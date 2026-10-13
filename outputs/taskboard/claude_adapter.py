"""Claude Code adapter: one `claude -p` process per run, streaming JSON over stdio.

Documented surface used: -p/--print, --input-format/--output-format stream-json, --verbose,
--model, --session-id, --resume, --permission-mode, --permission-prompt-tool, --name
(https://code.claude.com/docs/en/cli-reference). The control_request/control_response
messages (initialize → model catalogue, can_use_tool, interrupt) are what the official
Agent SDK speaks to the same CLI; their wire format is not published, so every exchange is
guarded by timeouts and the run fails visibly instead of hanging when the CLI changes.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import time
import uuid

from claude_sessions import ClaudeSessionIndex
from tool_adapters import BoardError, ToolAdapter, TOOL_LABELS

# Claude Code auto mode: its safety classifier approves routine tool calls; anything it still asks about reaches the board.
PERMISSION_MODE = 'auto'
HANDSHAKE_TIMEOUT = 45
STOP_GRACE = 15


def resolve_command(path=None):
    """Return the argv prefix for the Claude Code CLI, or None when it is not installed."""
    candidate = path or os.environ.get('TASKBOARD_CLAUDE') or shutil.which('claude')
    if not candidate:
        return None
    candidate = Path(candidate)
    if candidate.suffix.lower() in ('.cmd', '.ps1', ''):
        # npm shims wrap bin/claude.exe; spawning the binary keeps stop/terminate reliable.
        native = candidate.parent / 'node_modules' / '@anthropic-ai' / 'claude-code' / 'bin' / ('claude.exe' if os.name == 'nt' else 'claude')
        if native.is_file():
            return [str(native)]
    return [str(candidate)] if candidate.is_file() else None


def creation_flags():
    return subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0


def session_name(task, run):
    """Name a new session after what it is for: a card's own first run is the card, a new conversation or handoff is its request.
    index.html sessionTitle() derives the same title for display."""
    if run.get('kind') in ('new_session', 'handoff'):
        line = next((part.strip() for part in str(run.get('request') or '').splitlines() if part.strip()), '')
        if line:
            return line[:80]
    return task['title'][:80]


class ClaudeProcess:
    """A single headless turn. Owns the subprocess and translates its stream into board updates."""

    def __init__(self, adapter, task_id, run_id, session_id, args, cwd, prompt, resumed):
        self.adapter = adapter
        self.board = adapter.board
        self.task_id, self.run_id, self.session_id = task_id, run_id, session_id
        self.args, self.cwd, self.prompt, self.resumed = args, cwd, prompt, resumed
        self.proc = None
        self.lock = threading.Lock()
        self.finished = False
        self.stop_requested = False
        self.initialized = False
        self.stderr_tail = ''
        self.requests = set()

    def start(self):
        env = os.environ.copy()
        env.pop('CLAUDECODE', None)  # allow launching from inside another Claude Code session
        env['TASKBOARD_DISPATCHED'] = '1'  # the taskboard-pane mod loaded by this CLI leaves the board's own turns unmirrored
        self.proc = subprocess.Popen(self.args, cwd=self.cwd, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace',
                                     creationflags=creation_flags())
        threading.Thread(target=self._stderr, daemon=True).start()
        threading.Thread(target=self._read, daemon=True).start()
        self.send({'type': 'control_request', 'request_id': f'init-{self.run_id}', 'request': {'subtype': 'initialize', 'hooks': {}}})
        self.send({'type': 'user', 'session_id': self.session_id, 'parent_tool_use_id': None,
                   'message': {'role': 'user', 'content': [{'type': 'text', 'text': self.prompt}]}})

    def send(self, message):
        with self.lock:
            if not self.proc or self.proc.poll() is not None or not self.proc.stdin or self.proc.stdin.closed:
                return False
            try:
                self.proc.stdin.write(json.dumps(message, ensure_ascii=False) + '\n')
                self.proc.stdin.flush()
                return True
            except (OSError, ValueError):
                return False

    def _stderr(self):
        for line in self.proc.stderr:
            self.stderr_tail = (self.stderr_tail + line)[-4000:]

    def _read(self):
        try:
            for line in self.proc.stdout:
                try:
                    message = json.loads(line)
                except ValueError:
                    continue
                if isinstance(message, dict):
                    try:
                        self.handle(message)
                    except Exception as exc:  # keep reading; surface the failure on the run
                        self.finish('failed', f'處理 Claude Code 訊息時發生錯誤：{exc}')
        finally:
            code = self.proc.wait()
            if not self.finished:
                if self.stop_requested:
                    self.finish('interrupted', '已依要求停止執行。')
                else:
                    detail = self.stderr_tail.strip()[-1000:]
                    self.finish('failed', f'Claude Code 程序已結束（代碼 {code}），沒有回報結果。' + (f'\n{detail}' if detail else ''))
            for stream in (self.proc.stdin, self.proc.stdout, self.proc.stderr):
                try:
                    if stream and not stream.closed:
                        stream.close()
                except OSError:
                    pass

    def handle(self, message):
        kind = message.get('type')
        if kind == 'control_response':
            self.initialized = True
            return
        if kind == 'control_request':
            request = message.get('request') or {}
            request_id = str(message.get('request_id', ''))
            if request.get('subtype') == 'can_use_tool':
                key = f'claude:{request_id}'
                with self.board.lock:
                    self.board.requests[key] = {'id': key, 'tool': 'claude', 'method': 'claude/can_use_tool',
                                                'params': {'threadId': self.session_id, 'taskId': self.task_id,
                                                           'toolName': request.get('tool_name', ''), 'input': request.get('input'),
                                                           'description': request.get('description', ''),
                                                           'suggestions': request.get('permission_suggestions') or []},
                                                'requestId': request_id}
                self.requests.add(request_id)
                return
            self.send({'type': 'control_response', 'response': {'subtype': 'error', 'request_id': request_id,
                                                                'error': 'This taskboard only answers tool permission requests.'}})
            return
        if kind == 'system':
            if message.get('subtype') == 'init':
                self.initialized = True
                self.board.bind_session(self.task_id, message.get('session_id') or self.session_id,
                                        extra={'resolvedModel': message.get('model', ''), 'permissionMode': message.get('permissionMode', PERMISSION_MODE)})
            return
        if kind == 'assistant':
            content = (message.get('message') or {}).get('content') or []
            text = '\n'.join(block.get('text', '') for block in content if isinstance(block, dict) and block.get('type') == 'text').strip()
            if text:
                self.board.set_progress(self.task_id, text)
            return
        if kind == 'result':
            subtype = message.get('subtype', '')
            text = message.get('result') if isinstance(message.get('result'), str) else ''
            denials = message.get('permission_denials') or []
            extra = {'costUsd': message.get('total_cost_usd'), 'durationMs': message.get('duration_ms'),
                     'numTurns': message.get('num_turns'), 'permissionDenials': len(denials), 'resultSubtype': subtype}
            note = f'有 {len(denials)} 個工具呼叫未獲授權：' + '、'.join(sorted({d.get("tool_name", "?") for d in denials})) if denials else ''
            if self.stop_requested:
                self.finish('interrupted', '已依要求停止執行。', text, extra, note)
            elif message.get('is_error') or subtype != 'success':
                self.finish('failed', text or f'Claude Code 回報錯誤（{subtype or "unknown"}）。', text, extra, note)
            else:
                self.finish('completed', '', text, extra, note)
            self.close_input()

    def finish(self, status, error, result=None, extra=None, note=''):
        if self.finished:
            return
        self.finished = True
        try:
            with self.board.lock:
                self.board.requests = {key: value for key, value in self.board.requests.items() if value.get('requestId') not in self.requests}
                self.board.complete_run(self.task_id, status, error, result, extra, note)
        except Exception:
            if self.board.running:
                raise
            # The service is shutting down; the restart path marks the run as interrupted.
        finally:
            if self.adapter.process is self:
                self.adapter.process = None

    def close_input(self):
        with self.lock:
            try:
                if self.proc and self.proc.stdin and not self.proc.stdin.closed:
                    self.proc.stdin.close()
            except OSError:
                pass

    def respond(self, request_id, allow, message=''):
        if request_id not in self.requests:
            raise BoardError('這個請求已結束。', 409)
        request = self.board.requests.get(f'claude:{request_id}') or {}
        payload = {'behavior': 'allow', 'updatedInput': (request.get('params') or {}).get('input')} if allow \
            else {'behavior': 'deny', 'message': message or '使用者在任務看板拒絕了這個操作。'}
        if not self.send({'type': 'control_response', 'response': {'subtype': 'success', 'request_id': request_id, 'response': payload}}):
            raise BoardError('Claude Code 程序已結束，無法回覆核准。', 409)
        self.requests.discard(request_id)

    def stop(self):
        self.stop_requested = True
        self.send({'type': 'control_request', 'request_id': f'stop-{self.run_id}', 'request': {'subtype': 'interrupt'}})

        def enforce():
            time.sleep(STOP_GRACE)
            if not self.finished:
                self.close_input()
                time.sleep(STOP_GRACE)
            if not self.finished and self.proc.poll() is None:
                self.proc.terminate()
        threading.Thread(target=enforce, daemon=True).start()

    def terminate(self):
        self.stop_requested = True
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()


class ClaudeAdapter(ToolAdapter):
    tool = 'claude'
    label = TOOL_LABELS['claude']

    def __init__(self, board, command=None, sessions=None):
        super().__init__(board)
        self.command = command
        self.process = None
        self.version = ''
        self.version_error = ''
        self.sessions = sessions or ClaudeSessionIndex()

    def probe_version(self):
        if not self.command:
            return
        try:
            out = subprocess.run(self.command + ['--version'], capture_output=True, text=True, encoding='utf-8', errors='replace',
                                 timeout=30, creationflags=creation_flags())
            self.version = (out.stdout or '').strip().splitlines()[0] if out.stdout.strip() else ''
            self.version_error = '' if out.returncode == 0 else (out.stderr or '').strip()[-300:]
        except (OSError, subprocess.SubprocessError) as exc:
            self.version_error = str(exc)

    def capabilities(self):
        available = bool(self.command)
        reason = '' if available else '找不到 Claude Code CLI（claude）。請安裝 @anthropic-ai/claude-code，或以 --claude 指定執行檔。'
        if available and self.version_error:
            reason = f'Claude Code CLI 無法執行：{self.version_error}'
        return {'tool': self.tool, 'label': self.label, 'available': available and not self.version_error, 'reason': reason,
                'connected': available and not self.version_error, 'connectionError': reason, 'version': self.version,
                'models': available, 'resume': available, 'stop': available, 'approvals': available,
                'readChat': self.sessions.transcripts_available, 'listSessions': self.sessions.desktop_available,
                'sessionRoot': str(self.sessions.desktop_root or ''),
                'embed': False, 'openInApp': False, 'permissionMode': PERMISSION_MODE,
                'notes': ['以 claude -p 於工作資料夾執行；同一 session 以 --resume 延續。',
                          '權限採 Claude Code auto 模式：例行工具呼叫由安全分類器自動核准，仍需確認的才送到看板。',
                          '看板不內嵌於 Claude App；對話可用 claude --resume <session> 在終端機或 Claude App 的 /resume 清單開啟。']}

    def require(self):
        if not self.command:
            raise BoardError(self.capabilities()['reason'], 503)

    def models(self):
        """Ask the CLI for its catalogue through the initialize handshake; no prompt is ever sent."""
        self.require()
        args = self.command + ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
                               '--permission-mode', 'plan', '--no-session-persistence']
        probe_dir = self.board.default_workspace
        env = os.environ.copy()
        env.pop('CLAUDECODE', None)
        env['TASKBOARD_DISPATCHED'] = '1'
        proc = subprocess.Popen(args, cwd=str(probe_dir), env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, encoding='utf-8', errors='replace', creationflags=creation_flags())
        lines = queue.Queue()

        def reader():
            for line in proc.stdout:
                lines.put(line)
            lines.put(None)
        threading.Thread(target=reader, daemon=True).start()
        try:
            proc.stdin.write(json.dumps({'type': 'control_request', 'request_id': 'models', 'request': {'subtype': 'initialize', 'hooks': {}}}) + '\n')
            proc.stdin.flush()
            deadline = time.time() + HANDSHAKE_TIMEOUT
            while time.time() < deadline:
                try:
                    line = lines.get(timeout=1)
                except queue.Empty:
                    if proc.poll() is not None:
                        break
                    continue
                if line is None:
                    break
                try:
                    message = json.loads(line)
                except ValueError:
                    continue
                if message.get('type') == 'control_response':
                    inner = (message.get('response') or {}).get('response') or {}
                    catalogue = inner.get('models')
                    if not isinstance(catalogue, list):
                        raise BoardError('Claude Code 沒有回傳模型清單；請確認 CLI 版本。', 502)
                    return [{'model': item.get('value'), 'displayName': item.get('displayName') or item.get('value'),
                             'description': item.get('description', ''), 'resolvedModel': item.get('resolvedModel', ''),
                             'isDefault': item.get('value') == 'default', 'effortLevels': item.get('supportedEffortLevels') or []}
                            for item in catalogue if isinstance(item, dict) and item.get('value')]
            detail = (proc.stderr.read() or '').strip()[-300:] if proc.poll() is not None else ''
            raise BoardError('Claude Code 模型清單讀取逾時或 CLI 未回應。' + (f' {detail}' if detail else ''), 504)
        finally:
            try:
                proc.stdin.close()
            except OSError:
                pass
            if proc.poll() is None:
                proc.terminate()
            try:
                proc.wait(10)
            except subprocess.TimeoutExpired:
                proc.kill()
            for stream in (proc.stdout, proc.stderr):
                try:
                    stream.close()
                except OSError:
                    pass

    def launch(self, task_id):
        self.require()
        board = self.board
        if self.process and not self.process.finished:
            raise BoardError('已有 Claude Code 任務執行中。', 409)
        task = board.store.get(task_id)
        run = task['runs'][-1]
        cwd, model = run['cwd'], run.get('model', '')
        catalogue = {item['model']: item for item in board.models('claude')}
        if model and model not in catalogue:
            raise BoardError('所選模型目前不可用，請重新選擇負責模型再執行。')
        effort = run.get('effort', '')
        supported = (catalogue.get(model or 'default') or {}).get('effortLevels') or []
        if effort and effort not in supported:
            # Documented behaviour: unsupported levels fall back silently; the board makes that visible instead.
            raise BoardError(f'模型 {model or "default"} 不支援推理強度 {effort}（可用：{"、".join(supported) or "無"}），請調整後再執行。')
        Path(cwd).mkdir(parents=True, exist_ok=True)
        board.fill_workspace(task_id, cwd)
        task = board.store.get(task_id)
        resumed = bool(task['workerThreadId'])
        session_id = task['workerThreadId'] or str(uuid.uuid4())
        args = self.command + ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
                               '--permission-mode', PERMISSION_MODE, '--permission-prompt-tool', 'stdio']
        if model:
            args += ['--model', model]
        if effort:
            args += ['--effort', effort]
        args += ['--resume', session_id] if resumed else ['--session-id', session_id, '--name', session_name(task, run)]
        # The run can be stopped as soon as the process exists; the session binds after system/init.
        board.set_turn(task_id, run['id'], extra={'permissionMode': PERMISSION_MODE, 'command': args[len(self.command):]})
        process = ClaudeProcess(self, task_id, run['id'], session_id, args, cwd, board.prompt(task), resumed)
        self.process = process
        process.start()

    def stop(self, task):
        process = self.process
        if not process or process.task_id != task['id'] or process.finished:
            raise BoardError('任務仍在啟動或已結束，請稍後確認。', 409)
        process.stop()

    def answer(self, request, body):
        process = self.process
        if not process or process.finished:
            raise BoardError('這個請求已結束。', 409)
        decision = body.get('decision')
        if decision not in ('accept', 'decline', 'cancel'):
            raise BoardError('核准選項不正確。')
        process.respond(request['requestId'], decision == 'accept')

    def read_chat(self, session_id):
        chat = self.board.claude_chats.get(session_id) or {}
        data = self.sessions.read_turns(session_id, chat.get('cwd', ''))
        if data is None:
            raise BoardError('找不到這個 Claude Code session 的本機紀錄。', 404)
        return {'id': session_id, 'tool': 'claude', 'title': chat.get('title') or data['title'] or session_id,
                'turns': data['turns'], 'hasMore': data['hasMore'], 'resumeCommand': f'claude --resume {session_id}'}

    def list_sessions(self):
        return self.sessions.list(), False

    def close(self):
        if self.process and not self.process.finished:
            self.process.terminate()
