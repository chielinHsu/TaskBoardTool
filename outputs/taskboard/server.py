"""Local taskboard. Python stdlib + the user's installed Codex App Server / Claude Code CLI."""
from __future__ import annotations
import argparse
import atexit
import base64
from html import escape as html_escape
import hashlib
import hmac
import json
import logging
import os
from pathlib import Path, PureWindowsPath
import queue
import re
import secrets
import shutil
import sqlite3
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote
from session_sync import SessionSignals, project_from_cwd, session_card
from tool_adapters import BoardError, CodexAdapter, TOOLS, TOOL_LABELS, task_tool, run_tool, session_tool, task_session_keys
from claude_adapter import ClaudeAdapter, resolve_command
from claude_sessions import strip_reminders
from folder_picker import FolderPicker
import attachments as attachment_files
from attachments import AttachmentStore, task_attachment_ids

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / 'vendor'
MERMAID_INSTALL = 'node outputs/taskboard/setup-mermaid.mjs'
_vendor_cache: dict = {}


def vendor_mermaid() -> dict:
    """setup-mermaid.mjs 下載的 Mermaid（vendor/，不進 Git）：以安裝紀錄的 SHA-256 核對後回傳原始碼，
    依檔案 mtime／大小快取。看板以 inline script 注入，網頁版與 Codex App 內嵌版同一路徑，不放寬 CSP。"""
    script, manifest = VENDOR / 'mermaid.min.js', VENDOR / 'mermaid.json'
    try:
        info = script.stat()
        record = json.loads(manifest.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        raise BoardError(f'尚未安裝 Mermaid 圖表函式庫，請在專案根目錄執行 {MERMAID_INSTALL}。', 404)
    expected = str(record.get('sha256') or '').lower() if isinstance(record, dict) else ''
    key = (str(script), info.st_mtime_ns, info.st_size, expected)
    cached = _vendor_cache.get('mermaid')
    if cached and cached[0] == key:
        return cached[1]
    data = script.read_bytes()
    try:
        if not expected or hashlib.sha256(data).hexdigest() != expected:
            raise ValueError
        source = data.decode('utf-8')
    except ValueError:
        raise BoardError(f'Mermaid 檔案與安裝紀錄的雜湊不符，請重新執行 {MERMAID_INSTALL}。', 409)
    value = {'name': 'mermaid', 'version': str(record.get('version') or ''), 'sha256': expected, 'source': source}
    _vendor_cache['mermaid'] = (key, value)
    return value


def claude_account_name() -> str:
    """Claude Code 登入帳號的顯示名稱：讀 ~/.claude.json（或 CLAUDE_CONFIG_DIR）的 oauthAccount；讀不到回空字串。"""
    try:
        config_dir = os.environ.get('CLAUDE_CONFIG_DIR')
        path = (Path(config_dir) if config_dir else Path.home()) / '.claude.json'
        account = json.loads(path.read_text(encoding='utf-8')).get('oauthAccount') or {}
        for key in ('displayName', 'fullName', 'emailAddress'):
            value = str(account.get(key) or '').strip()
            if value:
                return value.split('@')[0] if key == 'emailAddress' else value
    except Exception:
        pass
    return ''


def codex_account_name() -> str:
    """Codex 登入帳號的顯示名稱：只解碼 ~/.codex/auth.json（或 CODEX_HOME）id_token 的 name／email 兩個 claim，不保存、不記錄 token。"""
    try:
        path = Path(os.environ.get('CODEX_HOME') or Path.home() / '.codex') / 'auth.json'
        token = str((json.loads(path.read_text(encoding='utf-8')).get('tokens') or {}).get('id_token') or '')
        payload = token.split('.')[1]
        claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        name = str(claims.get('name') or '').strip()
        if name:
            return name
        email = str(claims.get('email') or '').strip()
        if email:
            return email.split('@')[0]
    except Exception:
        pass
    return ''


def board_user_name(tool: str) -> str:
    """看板左上角與頁籤的名字：嵌在 Codex App（embed=1）時用 Codex 的登入帳號，其餘用 Claude Code 的登入帳號；
    該工具沒有登入資料時用另一個，兩個都沒有時顯示「使用者」。每次送出頁面時重新讀取，換帳號後重新整理即可。"""
    readers = {'codex': codex_account_name, 'claude': claude_account_name}
    for key in (('codex', 'claude') if tool == 'codex' else ('claude', 'codex')):
        name = readers[key]()
        if name:
            return name
    return '使用者'
STATUSES = ('backlog', 'todo', 'in_progress', 'in_review', 'done')
STATUS_LABELS = {'backlog': '列管', 'todo': '待辦', 'in_progress': '進行中', 'in_review': '待審核', 'done': '已完成'}
PRIORITIES = ('low', 'medium', 'high', 'urgent')
LOG = logging.getLogger('taskboard')
API_VERSION = '1.10.0'
EXPORT_SCHEMA = 5
EFFORTS = ('low', 'medium', 'high', 'xhigh', 'max')
# The five Claude roles of MODEL_ROUTING.md as (model alias, effort); Codex keeps its own default model.
ROLE_ROUTING = {'fast-worker': ('haiku', 'low'), 'developer': ('sonnet', 'medium'), 'developer-deep': ('sonnet', 'high'),
                'architect': ('opus', 'high'), 'architect-deep': ('opus', 'xhigh')}


def stamp():
    return time.time()


_queue_clock_lock = threading.Lock()
_queue_clock_last = 0.0


def queue_stamp():
    """Strictly increasing wall-clock stamp for queue order. time.time() ticks every 15.6 ms on Windows, so
    cards queued in one burst (plan import, dependency release, quick clicks) would otherwise tie."""
    global _queue_clock_last
    with _queue_clock_lock:
        now = max(time.time(), _queue_clock_last + 1e-6)
        _queue_clock_last = now
        return now


def decode_task(body):
    """Read older cards without rewriting the database or losing their last report."""
    task = json.loads(body)
    if 'runs' not in task:
        task['runs'] = []
        if task.get('workerThreadId'):
            task['runs'].append({'id': 'legacy', 'kind': 'legacy', 'threadId': task['workerThreadId'],
                                 'turnId': task.get('turnId', ''), 'cwd': task.get('cwd', ''),
                                 'request': task.get('description', ''), 'result': task.get('result', ''),
                                 'error': task.get('error', ''), 'status': 'running' if task['status'] == 'in_progress' else 'unknown',
                                 'startedAt': task.get('updatedAt', task['createdAt'])})
    task.setdefault('nextRun', None)
    task.setdefault('model', '')
    task.setdefault('labels', [])
    # Cards written before multi-tool support were always dispatched to Codex.
    task.setdefault('tool', 'codex')
    task.setdefault('sourceTool', 'codex' if task.get('sourceId') else '')
    task.setdefault('effort', '')
    task.setdefault('plan', None)
    task.setdefault('queuedAt', 0)  # when the card last entered the todo queue; 0 on older cards
    task.setdefault('attachments', [])
    return task


def queue_order(task):
    """Scheduler and board order: highest priority first, then first into the todo queue (creation time for older
    cards); creation time and id break remaining ties deterministically."""
    return (-PRIORITIES.index(task.get('priority', 'medium')), task.get('queuedAt') or task['createdAt'], task['createdAt'], task['id'])


def task_thread_ids(task):
    return {thread_id for thread_id in [task.get('sourceId'), task.get('workerThreadId'),
            *(run.get('threadId') for run in task.get('runs', []))] if thread_id}


def finish_run(task, status):
    if task.get('runs') and task['runs'][-1]['status'] == 'running':
        task['runs'][-1].update(status=status, result=task['result'], error=task['error'], finishedAt=stamp())


class Store:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(self.directory / 'taskboard.sqlite', check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, body TEXT NOT NULL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, body TEXT NOT NULL)')
        self.db.execute('CREATE TABLE IF NOT EXISTS task_relations (left_id TEXT NOT NULL, right_id TEXT NOT NULL, PRIMARY KEY(left_id,right_id))')
        # Directed: blocker must reach `done` before blocked may be dispatched.
        self.db.execute('CREATE TABLE IF NOT EXISTS task_dependencies (blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL, PRIMARY KEY(blocker_id,blocked_id))')
        self.db.commit()
        if self.setting('automatic') is None:
            self.set_setting('automatic', True)
        # Never assume that an interrupted service completed a task. A turn mirrored from the Claude App
        # (its last run is `mirror`) runs in the App, not here: it outlives this service and its end still arrives.
        for task in self.all():
            if task['status'] == 'in_progress':
                if task.get('runs') and task['runs'][-1].get('kind') == 'mirror':
                    continue
                task['status'] = 'in_review'
                task['error'] = '服務曾重新啟動，請檢查執行聊天的結果，再決定是否重試。'
                task['turnId'] = ''
                finish_run(task, 'interrupted')
                self.put(task)

    def all(self):
        with self.lock:
            return [self.with_relations(decode_task(row[0])) for row in self.db.execute('SELECT body FROM tasks')]

    def with_relations(self, task):
        task['relatedIds'] = sorted(row[1] if row[0] == task['id'] else row[0] for row in
            self.db.execute('SELECT left_id,right_id FROM task_relations WHERE left_id=? OR right_id=?', (task['id'], task['id'])))
        task['dependsOn'] = sorted(row[0] for row in self.db.execute('SELECT blocker_id FROM task_dependencies WHERE blocked_id=?', (task['id'],)))
        task['blocks'] = sorted(row[0] for row in self.db.execute('SELECT blocked_id FROM task_dependencies WHERE blocker_id=?', (task['id'],)))
        return task

    def bump(self, other_id, at):
        """Invalidate open drafts of another card whose links changed."""
        other = self.db.execute('SELECT body FROM tasks WHERE id=?', (other_id,)).fetchone()
        if other:
            body = json.loads(other[0])
            body['version'] += 1
            body['updatedAt'] = at
            self.db.execute('UPDATE tasks SET body=? WHERE id=?', (json.dumps(body, ensure_ascii=False), other_id))

    def get(self, task_id):
        with self.lock:
            row = self.db.execute('SELECT body FROM tasks WHERE id=?', (task_id,)).fetchone()
        if not row:
            raise BoardError('找不到這個任務。', 404)
        with self.lock:
            return self.with_relations(decode_task(row[0]))

    def put(self, task, related_ids=None, depends_on=None):
        with self.lock:
            row = self.db.execute('SELECT body FROM tasks WHERE id=?', (task['id'],)).fetchone()
            previous = json.loads(row[0]) if row else None
            task['updatedAt'] = stamp()
            task['version'] = task.get('version', 0) + 1
            stored = {key: value for key, value in task.items() if key not in ('relatedIds', 'dependsOn', 'blocks')}
            self.db.execute('INSERT OR REPLACE INTO tasks VALUES (?,?)', (task['id'], json.dumps(stored, ensure_ascii=False)))
            if related_ids is not None:
                self.db.execute('DELETE FROM task_relations WHERE left_id=? OR right_id=?', (task['id'], task['id']))
                for other_id in related_ids:
                    self.db.execute('INSERT INTO task_relations VALUES (?,?)', tuple(sorted((task['id'], other_id))))
                # Updating either endpoint invalidates open drafts at the other endpoint.
                for other_id in set(task.get('relatedIds', [])).symmetric_difference(related_ids):
                    self.bump(other_id, task['updatedAt'])
            if depends_on is not None:
                self.db.execute('DELETE FROM task_dependencies WHERE blocked_id=?', (task['id'],))
                for blocker_id in depends_on:
                    self.db.execute('INSERT INTO task_dependencies VALUES (?,?)', (blocker_id, task['id']))
                for other_id in set(task.get('dependsOn', [])).symmetric_difference(depends_on):
                    self.bump(other_id, task['updatedAt'])
            if not previous or previous['status'] != task['status']:
                messages = {'backlog': '任務已放入列管清單', 'todo': '任務已加入待辦佇列',
                            'in_progress': f'{TOOL_LABELS.get(task_tool(task), "執行工具")} 開始執行任務', 'in_review': '執行已結束，等待人工驗收',
                            'done': '使用者已驗收，任務完成'}
                event = {'taskId': task['id'], 'title': task['title'], 'status': task['status'],
                         'at': task['updatedAt'], 'message': task.get('error') or messages[task['status']],
                         'result': task.get('result', '') if task['status'] == 'in_review' else '',
                         'error': bool(task.get('error')), 'threadId': task.get('workerThreadId', ''), 'tool': task_tool(task)}
                self.db.execute('INSERT INTO events (body) VALUES (?)', (json.dumps(event, ensure_ascii=False),))
            self.db.commit()
            return self.with_relations(task)

    def events(self):
        with self.lock:
            return [dict(json.loads(row[1]), id=row[0]) for row in self.db.execute('SELECT id,body FROM events ORDER BY id DESC LIMIT 300')]

    def delete(self, task_id):
        with self.lock:
            task = self.get(task_id)
            at = stamp()
            for other_id in set(task['relatedIds']) | set(task['dependsOn']) | set(task['blocks']):
                self.bump(other_id, at)
            self.db.execute('DELETE FROM task_relations WHERE left_id=? OR right_id=?', (task_id, task_id))
            self.db.execute('DELETE FROM task_dependencies WHERE blocker_id=? OR blocked_id=?', (task_id, task_id))
            self.db.execute('DELETE FROM tasks WHERE id=?', (task_id,))
            self.db.commit()

    def setting(self, key):
        with self.lock:
            row = self.db.execute('SELECT value FROM settings WHERE key=?', (key,)).fetchone()
            return json.loads(row[0]) if row else None

    def set_setting(self, key, value):
        with self.lock:
            self.db.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', (key, json.dumps(value)))
            self.db.commit()


class CodexRPC:
    def __init__(self, executable, event_handler):
        self.executable = executable
        self.event_handler = event_handler
        self.proc = None
        self.pending = {}
        self.lock = threading.RLock()
        self.connect_lock = threading.Lock()
        self.counter = 0
        self.ready = False
        self.error = ''
        self.user_agent = ''

    def connect(self):
        with self.connect_lock:
            if self.ready and self.proc and self.proc.poll() is None:
                return
            if not self.executable:
                raise BoardError('找不到 Codex 執行檔。請在啟動指令使用 --codex 指定位置。', 503)
            env = os.environ.copy()
            env.pop('CODEX_THREAD_ID', None)
            flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
            self.proc = subprocess.Popen([self.executable, 'app-server', '--stdio'], cwd=ROOT, env=env,
                                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                         text=True, encoding='utf-8', errors='replace', creationflags=flags)
            proc = self.proc
            threading.Thread(target=self._read, args=(proc,), daemon=True).start()
            threading.Thread(target=self._stderr, args=(proc,), daemon=True).start()
            try:
                result = self.call('initialize', {'clientInfo': {'name': 'caspar_taskboard', 'title': 'Caspar Taskboard', 'version': '1.0.0'},
                                                 'capabilities': {'experimentalApi': True}}, timeout=35)
                self.notify('initialized', {})
                self.user_agent = result.get('userAgent', '')
                self.ready, self.error = True, ''
            except Exception as exc:
                self.error = str(exc)
                self.close()
                raise

    def _stderr(self, proc):
        for _ in proc.stderr:
            pass  # Do not write account/provider details to the board log.

    def _read(self, proc):
        for line in proc.stdout:
            try:
                message = json.loads(line)
            except ValueError:
                continue
            if 'id' in message and 'method' not in message:
                with self.lock:
                    waiter = self.pending.get(message['id'])
                if waiter:
                    waiter.put(message)
            else:
                try:
                    self.event_handler(message)
                except Exception:
                    LOG.exception('Event handling failed')
        if self.proc is proc:
            self.ready = False
            self.error = 'Codex 連線已中斷。'
            with self.lock:
                waiters = list(self.pending.values())
            for waiter in waiters:
                waiter.put({'error': {'message': self.error}})
            self.event_handler({'method': '_disconnected', 'params': {}})

    def send(self, message):
        with self.lock:
            if not self.proc or self.proc.poll() is not None:
                raise BoardError('Codex 尚未連線。', 503)
            self.proc.stdin.write(json.dumps(message, ensure_ascii=False) + '\n')
            self.proc.stdin.flush()

    def call(self, method, params, timeout=45):
        with self.lock:
            self.counter += 1
            request_id = self.counter
            waiter = queue.Queue()
            self.pending[request_id] = waiter
        try:
            self.send({'id': request_id, 'method': method, 'params': params})
            message = waiter.get(timeout=timeout)
            if 'error' in message:
                raise BoardError(message['error'].get('message', 'Codex 呼叫失敗。'), 502)
            return message.get('result', {})
        except queue.Empty:
            raise BoardError('Codex 回應逾時。請檢查連線後重試。', 504)
        finally:
            with self.lock:
                self.pending.pop(request_id, None)

    def notify(self, method, params):
        self.send({'method': method, 'params': params})

    def respond(self, request_id, result=None, error=None):
        message = {'id': request_id}
        message['error' if error else 'result'] = error if error else result
        self.send(message)

    def close(self):
        self.ready = False
        if self.proc and self.proc.poll() is None:
            self.proc.terminate()


def clean_text(value, label, limit=20000):
    if not isinstance(value, str) or len(value) > limit:
        raise BoardError(f'{label}格式不正確或太長。')
    return value.strip()


def app_title(chat, session_id):
    """The Claude App's own session title; '' while the App has not named it (the index then shows the session id)."""
    title = str((chat or {}).get('title') or '').strip()
    return title[:1000] if title and title != session_id else ''


def first_line(text):
    return next((line.strip() for line in (text or '').splitlines() if line.strip()), (text or '').strip())


def clean_tool(value):
    if value not in TOOLS:
        raise BoardError('執行工具不正確，請選擇 Codex 或 Claude Code。')
    return value


class Board:
    def __init__(self, directory, codex, claude=None):
        self.store = Store(directory)
        self.lock = threading.RLock()
        self.rpc = CodexRPC(codex, self.on_event)
        self.adapters = {'codex': CodexAdapter(self), 'claude': ClaudeAdapter(self, claude)}
        self.active_id = None
        self.requests = {}
        self.chats = {}
        self.claude_chats = {}
        self.chat_sync_lock = threading.Lock()
        self.chat_sync = {'updatedAt': 0, 'error': '', 'syncing': False, 'hasMore': False}
        self.claude_sync_lock = threading.Lock()
        self.claude_sync = {'updatedAt': 0, 'error': '', 'syncing': False, 'hasMore': False}
        self.session_signals = SessionSignals()
        self.running = True
        self.launching = False
        self.model_lock = threading.Lock()
        self.model_cache = {}
        self.default_workspace = self.store.directory / 'workspaces'
        self.default_workspace.mkdir(exist_ok=True)
        self.attachments = AttachmentStore(self.store.directory / 'attachments')

    # ----- shared helpers used by adapters -----
    clean = staticmethod(clean_text)

    def adapter(self, tool):
        return self.adapters[clean_tool(tool)]

    def chat(self, tool, session_id):
        if not session_id:
            return None
        return (self.chats if tool == 'codex' else self.claude_chats).get(session_id)

    def active_task(self):
        return self.store.get(self.active_id) if self.active_id else None

    def fill_workspace(self, task_id, cwd):
        with self.lock:
            task = self.store.get(task_id)
            if not task['cwd']:
                task['cwd'] = cwd
                self.store.put(task)

    def bind_session(self, task_id, session_id, extra=None):
        with self.lock:
            task = self.store.get(task_id)
            task['workerThreadId'] = session_id
            task['runs'][-1]['threadId'] = session_id
            if extra:
                task['runs'][-1].update({key: value for key, value in extra.items() if value not in (None, '')})
            self.store.put(task)

    def set_turn(self, task_id, turn_id, extra=None):
        with self.lock:
            task = self.store.get(task_id)
            if task['status'] != 'in_progress':
                return
            task['turnId'] = turn_id
            task['runs'][-1]['turnId'] = turn_id
            if extra:
                task['runs'][-1].update(extra)
            self.store.put(task)

    def set_progress(self, task_id, text, append=False):
        with self.lock:
            if self.active_id != task_id:
                return
            task = self.store.get(task_id)
            task['result'] = (task['result'] + text)[-100000:] if append else text[-100000:]
            self.store.put(task)

    def complete_run(self, task_id, status, error='', result=None, extra=None, note='', review=False):
        """Finish the active run for any tool: review/backlog/retry routing, run snapshot, scheduler release."""
        with self.lock:
            if self.active_id != task_id:
                return
            task = self.store.get(task_id)
            if result:
                task['result'] = result[-100000:]
            task['error'] = error or ''
            task['status'] = 'backlog' if status == 'interrupted' and not review else 'in_review'
            if status == 'failed' and any(word in task['error'].lower() for word in ('rate limit', 'usage limit', 'quota', 'usage_limit', 'rate_limit')):
                task['status'], task['retryAt'] = 'todo', stamp() + 600
            message = '執行已結束，請驗收成果。' if status == 'completed' else f"執行狀態：{status}。{task['error']}"
            task['comments'].append({'author': '系統', 'at': stamp(), 'text': message + (f'\n{note}' if note else '')})
            if extra:
                task['runs'][-1].update({key: value for key, value in extra.items() if value is not None})
            finish_run(task, status or 'unknown')
            task['turnId'] = ''
            self.store.put(task)
            self.active_id = None
            session_id = task['workerThreadId']
            self.requests = {key: value for key, value in self.requests.items()
                             if not (value['params'].get('threadId') == session_id and value.get('tool') == task_tool(task))}

    # ----- state and catalogue -----
    def state(self):
        with self.lock:
            tasks = self.store.all()
            linked = {key for task in tasks for key in task_session_keys(task)}
            for task in tasks:
                chat = self.chat(session_tool(task, task['workerThreadId']), task['workerThreadId']) or \
                    self.chat(task.get('sourceTool') or task_tool(task), task['sourceId'])
                if chat:
                    task['sessionStatus'] = chat['sessionStatus']
            stale = bool(self.chat_sync['error']) or stamp() - self.chat_sync['updatedAt'] > 60
            tasks.extend(session_card(chat, stale) for chat in self.chats.values() if ('codex', chat['id']) not in linked)
            claude_stale = bool(self.claude_sync['error']) or stamp() - self.claude_sync['updatedAt'] > 60
            tasks.extend(session_card(chat, claude_stale, tool='claude') for chat in self.claude_chats.values() if ('claude', chat['id']) not in linked)
            return {'tasks': tasks, 'automatic': self.store.setting('automatic'),
                    'activeId': self.active_id, 'connected': self.rpc.ready,
                    'connectionError': self.rpc.error, 'approvals': list(self.requests.values()),
                    'defaultWorkspace': str(self.default_workspace), 'events': self.store.events(),
                    'chats': list(self.chats.values()), 'chatSync': dict(self.chat_sync),
                    'claudeChats': list(self.claude_chats.values()), 'claudeSync': dict(self.claude_sync),
                    'claudeGroupsAt': self.store.setting('claudeGroupsAt') or 0,
                    'tools': {tool: adapter.capabilities() for tool, adapter in self.adapters.items()},
                    'version': API_VERSION}

    def models(self, tool='codex'):
        adapter = self.adapter(tool)
        with self.model_lock:
            cached = self.model_cache.get(tool)
            if cached and stamp() - cached[1] < 60:
                return cached[0]
            models = adapter.models()
            self.model_cache[tool] = (models, stamp())
            return models

    # ----- card editing -----
    def properties(self, task, body):
        """Validate property fields in place; returns (related_ids, depends_on), each None when untouched."""
        if 'tool' in body:
            task['tool'] = clean_tool(body['tool'])
        if 'model' in body:
            task['model'] = clean_text(body['model'], '模型', 200)
        if 'effort' in body:
            effort = clean_text(body['effort'], '推理強度', 20)
            if effort and effort not in EFFORTS:
                raise BoardError('推理強度不正確（low／medium／high／xhigh／max）。')
            task['effort'] = effort
        if 'labels' in body:
            labels = body['labels']
            if not isinstance(labels, list) or len(labels) > 20:
                raise BoardError('標籤需為清單，最多 20 個。')
            task['labels'] = list(dict.fromkeys(label for value in labels if (label := clean_text(value, '標籤', 80))))
        if 'attachments' in body:
            task['attachments'] = self.attachments.resolve(body['attachments'])
        related_ids = self.id_list(task, body.get('relatedIds'), '相關議題') if 'relatedIds' in body else None
        depends_on = self.id_list(task, body.get('dependsOn'), '前置卡片') if 'dependsOn' in body else None
        if depends_on is not None:
            self.check_cycle(task['id'], depends_on)
        return related_ids, depends_on

    def id_list(self, task, values, label):
        if not isinstance(values, list) or len(values) > 100:
            raise BoardError(f'{label}需為清單，最多 100 張。')
        ids = sorted(set(clean_text(value, f'{label} ID', 100) for value in values))
        for other_id in ids:
            if other_id == task['id']:
                raise BoardError(f'卡片不能把自己設為{label}。')
            self.store.get(other_id)
        return ids

    def check_cycle(self, task_id, depends_on):
        """Refuse a dependency that would let task_id block itself through other cards."""
        seen, frontier = set(), list(depends_on)
        while frontier:
            current = frontier.pop()
            if current == task_id:
                raise BoardError('前置卡片形成循環，請調整依賴順序。')
            if current in seen:
                continue
            seen.add(current)
            frontier.extend(self.store.get(current)['dependsOn'])

    def blockers(self, task):
        """Blockers that have not reached done; the card cannot be dispatched while any remain."""
        pending = []
        for blocker_id in task.get('dependsOn', []):
            try:
                blocker = self.store.get(blocker_id)
            except BoardError:
                continue
            if blocker['status'] != 'done':
                pending.append(blocker)
        return pending

    def release_dependents(self, task_id):
        """A card reached done: dependents whose blockers are all done leave the backlog for the todo queue."""
        released = []
        for blocked_id in self.store.get(task_id)['blocks']:
            dependent = self.store.get(blocked_id)
            if dependent['status'] != 'backlog' or self.blockers(dependent):
                continue
            dependent['comments'].append({'text': '前置卡片已全部完成，自動排入待辦。', 'at': stamp(), 'author': '系統'})
            dependent['status'], dependent['error'], dependent['retryAt'], dependent['queuedAt'] = 'todo', '', 0, queue_stamp()
            released.append(self.store.put(dependent))
        return released

    def create(self, body):
        title = clean_text(body.get('title', ''), '標題', 1000)
        if not title:
            raise BoardError('請填寫任務標題。')
        status = body.get('status', 'backlog')
        if status not in ('backlog', 'todo'):
            raise BoardError('新任務請先放入列管或待辦。')
        task = {'id': uuid.uuid4().hex[:12], 'title': title, 'description': '', 'project': '個人任務',
                'cwd': '', 'priority': 'medium', 'status': status, 'sourceId': '', 'sourceTool': '', 'workerThreadId': '',
                'turnId': '', 'result': '', 'resultUrl': '', 'error': '', 'retryAt': 0,
                'comments': [], 'runs': [], 'nextRun': None, 'tool': 'codex', 'model': '', 'effort': '', 'labels': [], 'attachments': [],
                'plan': body.get('plan') if isinstance(body.get('plan'), dict) else None, 'createdAt': stamp(), 'version': 0}
        for key in ('description', 'project', 'cwd', 'resultUrl'):
            if key in body:
                task[key] = clean_text(body[key], key)
        if body.get('priority', 'medium') not in PRIORITIES:
            raise BoardError('優先級不正確。')
        task['priority'] = body.get('priority', 'medium')
        if status == 'todo':
            task['queuedAt'] = queue_stamp()
        self.validate_workspace(task['cwd'])
        related_ids, depends_on = self.properties(task, body)
        return self.store.put(task, related_ids, depends_on)

    def validate_workspace(self, cwd):
        if cwd and (not Path(cwd).is_absolute() or not Path(cwd).is_dir()):
            raise BoardError('工作資料夾必須是已存在的完整路徑。')

    def update(self, task_id, body):
        with self.lock:
            task = self.store.get(task_id)
            if body.get('version') != task['version']:
                raise BoardError('任務已更新，請重新打開後再儲存。', 409)
            if task_id == self.active_id:
                raise BoardError('執行中的任務請先停止；留言可以使用下方的新增留言。', 409)
            if task['status'] == 'in_progress' and body.get('status', 'in_progress') != 'in_progress':
                raise BoardError('這張卡片正由 Claude App 的對話執行中，等回合結束後再移動。', 409)
            previous_description, previous_title = task['description'], task['title']
            for key in ('title', 'description', 'project', 'cwd', 'resultUrl'):
                if key in body:
                    task[key] = clean_text(body[key], key, 1000 if key == 'title' else 20000)
            if task.get('brief') and task['description'] != previous_description:
                task['brief'] = 'manual'  # a hand-edited brief is the card's own; the session's drafts never replace it again
            if 'titleSource' in task and task['title'] != previous_title:
                task['titleSource'] = 'manual'  # likewise a title edited on the board no longer follows the App's session title
            if not task['title']:
                raise BoardError('請填寫任務標題。')
            if 'status' in body and body['status'] != task['status']:
                if body['status'] not in STATUSES or body['status'] == 'in_progress':
                    raise BoardError('請用「開始執行」將任務移到進行中。')
                if body['status'] == 'todo' and task['status'] != 'todo':
                    task['queuedAt'] = queue_stamp()
                task['status'] = body['status']
            if 'priority' in body:
                if body['priority'] not in PRIORITIES:
                    raise BoardError('優先級不正確。')
                task['priority'] = body['priority']
            related_ids, depends_on = self.properties(task, body)
            self.validate_workspace(task['cwd'])
            previous = self.store.get(task_id)
            if task.get('nextRun') and any(task[key] != previous[key] for key in ('cwd', 'tool', 'model', 'effort')):
                # Queued runs keep their explicit parameters; change them by cancelling the queue first.
                raise BoardError('已有後續需求排隊，請先執行或取消排隊，再更換工具、模型、推理強度或工作資料夾。', 409)
            if task['status'] in ('todo', 'done'):
                # Re-queueing retries the card; marking it done is the user's acceptance, so a stale failure
                # must not be replayed by the status event or keep the card flagged. Runs keep their own error.
                task['error'], task['retryAt'] = '', 0
            saved = self.store.put(task, related_ids, depends_on)
            self.attachments.delete(task_attachment_ids(previous) - task_attachment_ids(saved))
            if saved['status'] == 'done' and previous['status'] != 'done':
                saved['released'] = [t['id'] for t in self.release_dependents(task_id)]
            return saved

    def comment(self, task_id, text):
        text = clean_text(text, '留言')
        if not text:
            raise BoardError('留言不能空白。')
        with self.lock:
            task = self.store.get(task_id)
            task['comments'].append({'text': text, 'at': stamp(), 'author': '你'})
            return self.store.put(task)

    def followup(self, task_id, body):
        text = clean_text(body.get('text', ''), '後續需求')
        thread_id = clean_text(body.get('threadId', ''), '對話 ID', 200)
        attached = self.attachments.resolve(body.get('attachments', []))
        if not text:
            raise BoardError('請填寫尚未符合需求的地方或後續需求。')
        with self.lock:
            task = self.store.get(task_id)
            if body.get('version') != task['version']:
                raise BoardError('任務已更新，請重新打開後再送出。', 409)
            if self.active_id == task_id or task['status'] == 'in_progress':
                raise BoardError('請等這張卡片執行結束再新增後續對話。', 409)
            if task.get('nextRun'):
                raise BoardError('已有後續需求排入待辦，請先執行該需求。', 409)
            sessions = task_session_keys(task)
            runs = task.get('runs', [])
            previous_tool = run_tool(task, runs[-1]) if runs else (task.get('sourceTool') or task_tool(task) if task.get('sourceId') else '')
            if thread_id:
                owners = sorted({tool for tool, session_id in sessions if session_id == thread_id})
                if not owners:
                    raise BoardError('只能延續這張卡片已連結的對話。')
                requested = body.get('tool')
                if requested and requested not in owners:
                    raise BoardError('延續對話只能使用原本的執行工具；要換工具請選擇開新對話。')
                if len(owners) > 1 and not requested:
                    raise BoardError('這個對話 ID 同時屬於兩個工具，請指定執行工具。')
                tool = requested or owners[0]
                kind = 'followup'
            else:
                tool = clean_tool(body.get('tool') or task_tool(task))
                kind = 'handoff' if previous_tool and previous_tool != tool else 'new_session'
            capability = self.adapters[tool].capabilities()
            if not capability['available']:
                raise BoardError(f"{capability['label']} 目前無法使用：{capability['reason']}", 503)
            if thread_id and (self.chat(tool, thread_id) or {}).get('sessionStatus', {}).get('status') == 'in_progress':
                raise BoardError('這個對話仍有執行訊號，請等執行結束後再延續。', 409)
            if 'model' in body:
                model = clean_text(body['model'], '模型', 200)
            else:
                model = task['model'] if tool == task_tool(task) else ''
            if 'effort' in body:
                effort = clean_text(body['effort'], '推理強度', 20)
                if effort and effort not in EFFORTS:
                    raise BoardError('推理強度不正確（low／medium／high／xhigh／max）。')
            else:
                effort = task.get('effort', '') if tool == task_tool(task) else ''
            cwd = task['cwd']
            if thread_id:
                previous = next((r for r in reversed(runs) if r.get('threadId') == thread_id), None)
                cwd = (previous or {}).get('cwd') or (self.chat(tool, thread_id) or {}).get('cwd') or cwd
            self.validate_workspace(cwd)
            task['nextRun'] = {'threadId': thread_id, 'text': text, 'cwd': cwd, 'kind': kind, 'tool': tool, 'model': model,
                               'effort': effort, 'fromTool': previous_tool if kind == 'handoff' else '', 'attachments': attached}
            task['comments'].append({'text': text, 'at': stamp(), 'author': '你', 'kind': 'followup',
                                     'threadId': thread_id, 'tool': tool, 'attachments': attached})
            task['tool'], task['model'], task['effort'] = tool, model, effort
            task['status'], task['error'], task['retryAt'], task['queuedAt'] = 'todo', '', 0, queue_stamp()
            saved = self.store.put(task)
            if body.get('startNow') is True:
                # The person wants this revision to run right away instead of waiting for the scheduler.
                try:
                    return self.start(task_id, force=body.get('force') is True)
                except BoardError as exc:
                    saved = self.store.get(task_id)
                    saved['startError'] = str(exc)  # stays queued in todo; the UI explains why it did not start
            return saved

    def cancel_followup(self, task_id, body):
        with self.lock:
            task = self.store.get(task_id)
            if body.get('version') != task['version']:
                raise BoardError('任務已更新，請重新打開後再操作。', 409)
            if not task.get('nextRun'):
                raise BoardError('目前沒有排隊中的後續需求。', 409)
            if self.active_id == task_id or task['status'] == 'in_progress':
                raise BoardError('任務正在執行，無法取消排隊。', 409)
            task['comments'].append({'text': f"已取消排隊的後續需求：{task['nextRun']['text'][:200]}", 'at': stamp(), 'author': '系統'})
            task['nextRun'] = None
            if task['status'] == 'todo':
                task['status'] = 'backlog'
            return self.store.put(task)

    # ----- session projections -----
    def chats_list(self):
        if not self.chat_sync_lock.acquire(blocking=False):
            with self.lock:
                return {'chats': list(self.chats.values()), **self.chat_sync}
        with self.lock:
            self.chat_sync['syncing'] = True
        try:
            return self._sync_chats()
        except Exception as exc:
            with self.lock:
                self.chat_sync['error'] = str(exc)
            raise
        finally:
            with self.lock:
                self.chat_sync['syncing'] = False
            self.chat_sync_lock.release()

    def _sync_chats(self):
        all_chats, has_more = self.adapters['codex'].list_sessions()
        with self.lock:
            self.chats = {c['id']: c for c in all_chats}
            self.chat_sync.update(updatedAt=stamp(), error='', hasMore=has_more)
            if len(self.session_signals.cache) > 3000:
                self.session_signals.cache.clear()
        return {'chats': all_chats, 'hasMore': has_more}

    def claude_groups(self):
        return self.store.setting('claudeGroups') or {}

    def set_claude_groups(self, body):
        """Sidebar groups of the Claude App, relayed by the taskboard-pane mod (the App keeps them in its own state,
        not on disk). Stored by desktop session id; applied as the Claude session card's project name."""
        sessions = body.get('sessions')
        if not isinstance(sessions, list) or len(sessions) > 2000:
            raise BoardError('sessions 需為清單，最多 2000 筆。')
        mapping = {}
        for raw in sessions:
            if not isinstance(raw, dict):
                continue
            session_id = clean_text(str(raw.get('sessionId', '')), 'session ID', 80)
            group = raw.get('group') if isinstance(raw.get('group'), dict) else {}
            name = clean_text(str(group.get('name', '') or raw.get('groupName', '') or ''), '群組名稱', 200)
            if session_id and name:
                mapping[session_id] = name
        with self.lock:
            self.store.set_setting('claudeGroups', mapping)
            self.store.set_setting('claudeGroupsAt', stamp())
            for chat in self.claude_chats.values():
                chat['project'] = mapping.get(chat.get('desktopId', ''), '')
        return {'ok': True, 'groups': len(set(mapping.values())), 'sessions': len(mapping)}

    def claude_list(self):
        """Read-only Claude session projection; errors are recorded, never raised into the Codex sync."""
        if not self.claude_sync_lock.acquire(blocking=False):
            with self.lock:
                return {'chats': list(self.claude_chats.values()), **self.claude_sync}
        with self.lock:
            self.claude_sync['syncing'] = True
        try:
            chats, has_more = self.adapters['claude'].list_sessions()
            groups = self.claude_groups()
            for chat in chats:
                chat['project'] = groups.get(chat.get('desktopId', ''), '')
            with self.lock:
                self.claude_chats = {c['id']: c for c in chats}
                tasks = self.store.all()
                linked = {key for task in tasks for key in task_session_keys(task)}
                forks = {prior: c['id'] for c in chats for prior in c.get('priorIds') or [] if ('claude', c['id']) not in linked}
                for task in tasks:
                    if task.get('sourceTool') != 'claude':
                        continue
                    forked = forks.pop(task.get('sourceId'), '')
                    chat = self.claude_chats.get(forked or task.get('sourceId'))
                    changed = self.adopt_fork(task, forked, chat) if forked else self.fold_forks(task, chat)
                    # an App rename (or its late automatic title) reaches the mirrored card
                    changed = self.follow_cwd_project(task) or changed
                    if self.follow_app_title(task, chat) or changed:
                        self.store.put(task)
                self.claude_sync.update(updatedAt=stamp(), error='', hasMore=has_more)
            return {'chats': chats, 'hasMore': has_more}
        except Exception as exc:
            with self.lock:
                self.claude_sync['error'] = str(exc)
            raise
        finally:
            with self.lock:
                self.claude_sync['syncing'] = False
            self.claude_sync_lock.release()

    def sync_sessions(self):
        while self.running:
            for sync in (self.chats_list, self.claude_list):
                try:
                    sync()
                except Exception:
                    LOG.warning('Session synchronization failed; retaining last snapshot')
            for _ in range(15):
                if not self.running:
                    return
                time.sleep(1)

    def import_chat(self, thread_id, tool='codex'):
        # Metadata only, selected one at a time. No history or credential files are exported.
        tool = clean_tool(tool or 'codex')
        with self.lock:
            chat = self.chat(tool, thread_id)
            if not chat:
                raise BoardError('請先更新聊天清單，再選擇匯入。')
            for task in self.store.all():
                if (tool, thread_id) in task_session_keys(task):
                    return task
            task = self.create({'title': chat['title'][:1000], 'cwd': chat['cwd'] if Path(chat['cwd']).is_dir() else '',
                                'project': chat.get('project') or project_from_cwd(chat['cwd']), 'status': 'backlog', 'tool': tool})
            task['sourceId'] = thread_id
            task['sourceTool'] = tool
            task['comments'].append({'text': '已連結來源聊天。請補上這次要執行的需求，放入待辦後才會派工；來源聊天不會被自動改動。', 'at': stamp(), 'author': '系統'})
            return self.store.put(task)

    def read_chat(self, thread_id, tool='codex'):
        return self.adapter(tool or 'codex').read_chat(thread_id)

    # ----- Claude App turn mirror -----
    def mirror_turn(self, body):
        """Turns of a Claude App session, relayed by the taskboard-pane mod as they start and end.

        The session's first prompt creates its card straight into 進行中; every later prompt is one more
        run on the same card (a finished card reopens); the end of a turn moves the card to 待審核 with the
        answer as the run's report. The board never launches, resumes or stops these sessions, and a session
        the board itself dispatched is left to its adapter (its run is still unbound while the CLI starts).
        """
        event = body.get('event')
        if event not in ('start', 'complete', 'brief'):
            raise BoardError('event 需為 start、complete 或 brief。')
        tool = clean_tool(body.get('tool') or 'claude')
        session_id = str(body.get('sessionId') or '')
        if not re.fullmatch(r'[A-Za-z0-9-]{1,64}', session_id):
            raise BoardError('session ID 不正確。')
        turn_id = clean_text(str(body.get('turnId') or ''), 'turn ID', 200)
        text = strip_reminders(clean_text(str(body.get('text') or ''), '需求'))
        with self.lock:
            active = self.active_task()
            if active:
                run = active['runs'][-1] if active.get('runs') else {}
                if run_tool(active, run) == tool and run.get('threadId', '') in ('', session_id):
                    return {'mirrored': False, 'reason': 'board-run'}
            tasks = self.store.all()
            task = next((t for t in tasks if (tool, session_id) in task_session_keys(t)), None)
            if task is None:
                task = self.forked_card(tool, session_id, tasks)
                if task and not (active and task['id'] == active['id']):
                    self.adopt_fork(task, session_id, self.chat(tool, session_id))
            if task and active and task['id'] == active['id']:
                # The board is running its own session on this mirrored card (a follow-up sent from the card):
                # the App's turns leave it alone until that run ends, or its runs and session binding would be overwritten.
                return {'mirrored': False, 'reason': 'board-run'}
            chat = self.chat(tool, session_id) or {}
            model = clean_text(str(body.get('model') or chat.get('model') or ''), '模型', 200)
            cwd = clean_text(str(body.get('cwd') or chat.get('cwd') or ''), '工作資料夾', 2000)
            if event == 'brief':
                return self.apply_brief(task, body) if task else {'mirrored': False, 'reason': 'no-card'}
            created = False
            if task is None:
                if event != 'start' or not text:
                    return {'mirrored': False, 'reason': 'no-card'}
                # The brief (需求簡介／驗收條件) is seeded from the session's FIRST prompt — the transcript's earliest
                # readable turn when the card is only created later — and the mod drafts it once from that seed;
                # later prompts of the session never rewrite it, only the person editing the card does.
                first_text = self.first_prompt(tool, session_id) or text
                # The App names a session only after its first turn, so the card usually starts from the prompt's first
                # line (seed) and takes the App's title once it appears; see follow_app_title.
                chat_title = app_title(chat, session_id)
                title = chat_title or first_line(first_text)[:120]
                task = self.create({'title': title, 'description': first_text, 'priority': 'high', 'tool': tool,
                                    'cwd': cwd if cwd and Path(cwd).is_absolute() and Path(cwd).is_dir() else '',
                                    'project': chat.get('project') or project_from_cwd(cwd, '個人任務')})
                task['sourceId'], task['sourceTool'], task['brief'] = session_id, tool, 'seed'
                task['titleSource'] = 'app' if chat_title else 'seed'
                task['comments'].append({'author': '系統', 'at': stamp(), 'text': '由 Claude App 的對話自動建立。看板鏡像這個 session 的回合：'
                                         '送出需求時進入進行中，回合結束後進入待審核；看板不會派工、延續或停止它。'})
                created = True
            runs = task['runs']
            if 'brief' not in task and runs and runs[0].get('kind') == 'mirror' and task['description'] == runs[0].get('request', ''):
                # Seeded by the earlier mirror code from the prompt that created it and never edited since: still draftable,
                # and re-seeded from the session's real first prompt when the transcript still shows it.
                task['description'], task['brief'] = self.first_prompt(tool, session_id) or task['description'], 'seed'
            if 'titleSource' not in task and runs and runs[0].get('kind') == 'mirror':
                task['titleSource'] = self.legacy_title_source(task, tool, session_id, chat)
            self.follow_app_title(task, chat)
            last = runs[-1] if runs else None
            previous_status = task['status']
            if event == 'start':
                if last and last.get('kind') == 'mirror' and last['status'] == 'running':
                    if last.get('turnId') == turn_id:
                        return {'mirrored': True, 'created': False, 'task': task}
                    last.update(status='unknown', finishedAt=stamp(), error='回合結束訊號未送達（App 關閉或 mod 重新載入）。')
                runs.append({'id': uuid.uuid4().hex[:12], 'kind': 'mirror', 'threadId': session_id, 'turnId': turn_id,
                             'cwd': task['cwd'] or cwd, 'tool': tool, 'model': model, 'effort': '', 'fromTool': '',
                             'request': text, 'result': '', 'error': '', 'status': 'running', 'startedAt': stamp()})
                task.update(status='in_progress', workerThreadId=session_id, tool=tool, turnId=turn_id, result='', error='', retryAt=0)
                if previous_status == 'done':
                    task['comments'].append({'author': '系統', 'at': stamp(), 'text': '已完成的卡片收到 Claude App 對話的新需求，重新回到進行中。'})
            else:
                run = last if last and last.get('kind') == 'mirror' and (last['status'] == 'running' or last.get('turnId') == turn_id) else None
                if run is None and last and last.get('kind') != 'mirror' and last.get('threadId') == session_id:
                    # The end of a turn the board dispatched, relayed by a mod copy that predates TASKBOARD_DISPATCHED and
                    # arriving after the adapter already finished that run: its start was refused as board-run, so drop it too.
                    return {'mirrored': False, 'reason': 'board-run'}
                if run is None:
                    runs.append({'id': uuid.uuid4().hex[:12], 'kind': 'mirror', 'threadId': session_id, 'turnId': turn_id,
                                 'cwd': task['cwd'] or cwd, 'tool': tool, 'model': model, 'effort': '', 'fromTool': '',
                                 'request': text, 'result': '', 'error': '', 'status': 'running', 'startedAt': stamp()})
                    run = runs[-1]
                answer = clean_text(str(body.get('answer') or ''), '回報', 100000)
                reason = str(body.get('reason') or ('aborted' if body.get('aborted') is True else 'answer'))
                status = {'aborted': 'interrupted', 'error': 'failed', 'refusal': 'failed'}.get(reason, 'completed')
                error = '' if status != 'failed' else (clean_text(str(body.get('error') or ''), '錯誤', 2000)
                                                      or ('模型拒絕回答。' if reason == 'refusal' else '回合發生錯誤。'))
                run.update(turnId=run.get('turnId') or turn_id, result=answer, error=error, status=status, finishedAt=stamp())
                task['workerThreadId'] = task['workerThreadId'] or session_id
                task['result'], task['error'], task['turnId'] = answer, error, ''
                if task.get('nextRun'):
                    task['status'], task['queuedAt'] = 'todo', queue_stamp()
                else:
                    task['status'] = 'backlog' if status == 'interrupted' else 'in_review'
                task['comments'].append({'author': '系統', 'at': stamp(), 'text': 'Claude App 的回合已結束，請驗收成果。' if status == 'completed'
                                         else f'Claude App 的回合狀態：{status}。{error}'})
            saved = self.store.put(task)
            seeded = saved.get('brief') == 'seed'
            return {'mirrored': True, 'created': created, 'task': saved, 'wantsBrief': seeded, 'briefSource': saved['description'] if seeded else ''}

    def forked_card(self, tool, session_id, tasks):
        """The card of the conversation an App rewind forked this session from (the App lists the replaced CLI ids
        as priorIds), so the fork keeps mirroring onto it instead of creating a second card; None when there is none."""
        prior = (self.chat(tool, session_id) or {}).get('priorIds') or []
        return next((t for p in reversed(prior) for t in tasks if (tool, p) in task_session_keys(t)), None)

    def adopt_fork(self, task, session_id, chat):
        """Point the card at the App's current CLI session id and fold the replaced session's runs into it. True when changed."""
        if task.get('sourceId') == session_id:
            return self.fold_forks(task, chat)
        task['sourceId'] = session_id
        task['comments'].append({'author': '系統', 'at': stamp(), 'text': 'Claude App 倒回對話後改用新的 session，'
                                 '卡片改為追蹤新的 session，先前的回合併入這個 session。'})
        self.fold_forks(task, chat)
        return True

    def fold_forks(self, task, chat):
        """A rewind copies the conversation into the new session, so runs on the ids it replaced are shown under the
        current one; the replaced ids are kept in priorSessionIds and still reach the card. True when changed."""
        prior = set((chat or {}).get('priorIds') or [])
        current, tool = task.get('sourceId'), task.get('sourceTool') or task_tool(task)
        folded = set()
        for run in task.get('runs', []):
            if run.get('threadId') in prior and run_tool(task, run) == tool:
                folded.add(run['threadId'])
                run['threadId'] = current
        if task.get('workerThreadId') in prior:
            folded.add(task['workerThreadId'])
            task['workerThreadId'] = current
        if not folded:
            return False
        task['priorSessionIds'] = sorted(set(task.get('priorSessionIds') or []) | folded)
        return True

    def follow_app_title(self, task, chat):
        """A mirrored card's title tracks the App's session title (its late automatic one, or a rename in the App)
        until someone edits the title on the board: titleSource seed／app follow, manual never does. True when changed."""
        if task.get('titleSource') not in ('seed', 'app'):
            return False
        title = app_title(chat, task.get('sourceId', ''))
        if not title or title == task['title']:
            return False
        task['title'], task['titleSource'] = title, 'app'
        return True

    def follow_cwd_project(self, task):
        """Cards created before worktree／scratch folders were recognised took the folder's random name as their project.
        While the project is still exactly that name it is the old automatic value, so it moves to the repository (or the
        scratch label); any other project — an App group or a name typed on the board — is left alone. True when changed."""
        cwd = task.get('cwd') or ''
        if not cwd or task.get('project') != PureWindowsPath(cwd).name:
            return False
        project = project_from_cwd(cwd, task['project'])
        if project == task['project']:
            return False
        task['project'] = project
        return True

    def legacy_title_source(self, task, tool, session_id, chat):
        """Cards mirrored before titleSource existed follow the App only while their title is still the automatic one."""
        title = task['title']
        if title == app_title(chat, session_id):
            return 'app'
        if title.startswith('<system-reminder>') or title == first_line(self.first_prompt(tool, session_id))[:120]:
            return 'seed'
        return 'manual'

    def apply_brief(self, task, body):
        """A 需求簡介／驗收條件 draft from the mod (event=brief). Only an automatic brief (seed／drafted) is replaced;
        once the person edited the description (brief=manual) or the card never had an automatic brief, it is refused."""
        description = clean_text(str(body.get('description') or ''), '需求簡介', 20000)
        if task.get('brief') not in ('seed', 'drafted'):
            return {'mirrored': False, 'reason': 'brief-manual', 'task': task}
        if not description:
            return {'mirrored': False, 'reason': 'brief-empty', 'task': task}
        task['description'], task['brief'] = description, 'drafted'
        return {'mirrored': True, 'created': False, 'brief': 'drafted', 'task': self.store.put(task)}

    def first_prompt(self, tool, session_id):
        """The session's first user prompt: the transcript head when the tool reads it (Claude's firstPrompt), else the
        earliest prompt in the chat window; '' when none."""
        try:
            chat = self.read_chat(session_id, tool) or {}
        except (BoardError, OSError, ValueError, KeyError, TypeError):
            return ''
        if chat.get('firstPrompt'):
            return chat['firstPrompt']
        for turn in chat.get('turns') or []:
            for item in turn.get('items') or []:
                if item.get('type') == 'userMessage':
                    text = '\n'.join(str(c.get('text', '')) for c in item.get('content') or [] if c.get('type') == 'text').strip()
                    if text:
                        return text
        return ''

    # ----- plan import -----
    def import_plan(self, body):
        """Expand a planned feature into backlog cards: per-item tool/model/effort, directed dependencies, creation in dependency order."""
        name = clean_text(body.get('name', ''), '計畫名稱', 200)
        items = body.get('items')
        if not name:
            raise BoardError('請填寫計畫名稱。')
        if not isinstance(items, list) or not items or len(items) > 200:
            raise BoardError('計畫需包含 1–200 個事項。')
        default_tool = clean_tool(body.get('tool') or 'codex')
        project = clean_text(body.get('project', ''), '專案名稱', 20000)
        cwd = clean_text(body.get('cwd', ''), '工作資料夾', 20000)
        self.validate_workspace(cwd)
        specs, keys = [], set()
        for index, raw in enumerate(items):
            if not isinstance(raw, dict):
                raise BoardError(f'事項 {index + 1} 格式不正確。')
            key = clean_text(str(raw.get('key') or f'item-{index + 1}'), '事項 key', 64)
            if key in keys:
                raise BoardError(f'事項 key 重複：{key}')
            keys.add(key)
            title = clean_text(raw.get('title', ''), f'事項 {key} 標題', 1000)
            if not title:
                raise BoardError(f'事項 {key} 缺少標題。')
            tool = clean_tool(raw.get('tool') or default_tool)
            role = clean_text(str(raw.get('role') or ''), '角色', 40)
            if role and role not in ROLE_ROUTING:
                raise BoardError(f'事項 {key} 的角色不正確（{"、".join(ROLE_ROUTING)}）。')
            model = clean_text(raw.get('model', ''), '模型', 200)
            effort = clean_text(raw.get('effort', ''), '推理強度', 20)
            if tool == 'claude' and role and not model:
                model, effort = ROLE_ROUTING[role][0], effort or ROLE_ROUTING[role][1]
            if effort and effort not in EFFORTS:
                raise BoardError(f'事項 {key} 的推理強度不正確。')
            if tool != 'claude':
                effort = ''  # Codex app-server has no effort parameter here; the role is kept as a label only.
            depends = raw.get('dependsOn') or []
            if not isinstance(depends, list):
                raise BoardError(f'事項 {key} 的 dependsOn 需為 key 清單。')
            depends = [clean_text(str(d), 'dependsOn', 64) for d in depends]
            priority = raw.get('priority') or 'medium'
            if priority not in PRIORITIES:
                raise BoardError(f'事項 {key} 的優先級不正確。')
            status = raw.get('status') or 'backlog'
            if status not in ('backlog', 'todo'):
                raise BoardError(f'事項 {key} 只能放入列管或待辦。')
            labels = raw.get('labels') or []
            specs.append({'key': key, 'title': title, 'description': clean_text(raw.get('description', ''), '需求'), 'tool': tool,
                          'role': role, 'model': model, 'effort': effort, 'dependsOn': depends, 'priority': priority, 'status': status,
                          'labels': labels if isinstance(labels, list) else [], 'cwd': clean_text(raw.get('cwd', ''), '工作資料夾', 20000) or cwd})
        by_key = {s['key']: s for s in specs}
        for spec in specs:
            for dep in spec['dependsOn']:
                if dep not in by_key:
                    raise BoardError(f'事項 {spec["key"]} 依賴不存在的 key：{dep}')
                if dep == spec['key']:
                    raise BoardError(f'事項 {spec["key"]} 不能依賴自己。')
        # Kahn's algorithm: cards are created in dependency order so creation time mirrors the plan.
        order, remaining = [], {s['key']: set(s['dependsOn']) for s in specs}
        while remaining:
            ready = sorted(k for k, deps in remaining.items() if not deps)
            if not ready:
                raise BoardError('計畫的依賴形成循環：' + '、'.join(sorted(remaining)))
            for k in ready:
                order.append(k)
                del remaining[k]
            for deps in remaining.values():
                deps.difference_update(ready)
        plan_id = uuid.uuid4().hex[:8]
        created = {}
        last_created = 0.0
        with self.lock:
            for key in order:
                spec = by_key[key]
                task = self.create({'title': spec['title'], 'description': spec['description'], 'project': project or '個人任務',
                                    'cwd': spec['cwd'], 'priority': spec['priority'], 'status': spec['status'], 'tool': spec['tool'],
                                    'model': spec['model'], 'effort': spec['effort'],
                                    'labels': list(dict.fromkeys([name] + ([spec['role']] if spec['role'] else []) + [str(l) for l in spec['labels']])),
                                    'plan': {'id': plan_id, 'name': name, 'key': key, 'role': spec['role']}})
                if task['createdAt'] <= last_created:
                    # Same-millisecond creations would tie in the scheduler's (priority, createdAt) order.
                    task['createdAt'] = last_created + 0.001
                    task = self.store.put(task)
                last_created = task['createdAt']
                created[key] = task
            for key in order:
                spec = by_key[key]
                if spec['dependsOn']:
                    task = self.store.get(created[key]['id'])
                    blockers = sorted(created[d]['id'] for d in spec['dependsOn'])
                    task['comments'].append({'text': '前置卡片：' + '、'.join(by_key[d]['title'][:40] for d in spec['dependsOn']) + '。完成並驗收後會自動排入待辦。',
                                             'at': stamp(), 'author': '系統'})
                    self.store.put(task, None, blockers)
            # Blocked items that were asked to start in todo wait in the backlog until released.
            for key in order:
                task = self.store.get(created[key]['id'])
                if task['status'] == 'todo' and self.blockers(task):
                    task['status'] = 'backlog'
                    self.store.put(task)
            return {'planId': plan_id, 'name': name, 'order': order, 'tasks': [self.store.get(created[k]['id']) for k in order]}

    # ----- dispatch -----
    def prompt(self, task):
        notes = '\n'.join(f"- {c['text']}" for c in task['comments'][-20:] if c['author'] == '你')
        run = task['runs'][-1] if task.get('runs') else {}
        history = '\n\n'.join(f"對話 {r.get('threadId') or '未建立'}（{TOOL_LABELS.get(run_tool(task, r), '')}）：\n{r.get('result') or r.get('error') or '無回報'}"
                                for r in task.get('runs', [])[:-1][-3:])[-30000:]
        followup = ''
        if run.get('kind') in ('followup', 'new_session', 'handoff'):
            handoff = (f"\n\n接手說明：這項需求先前由 {TOOL_LABELS.get(run.get('fromTool', ''), '另一個工具')} 的對話處理，"
                       "以下只是回報摘要，並非原對話的完整紀錄；請以工作資料夾的實際內容為準。") if run.get('kind') == 'handoff' else ''
            run_files = attachment_files.describe(self.attachments, run.get('attachments') or [])
            run_files = f"\n\n本次後續需求的附件（請直接讀取）：\n{run_files}" if run_files else ''
            followup = f"\n\n本次後續需求（優先處理）：\n{run['request']}{run_files}{handoff}\n\n先前執行回報：\n{history or '無'}"
        brief_files = attachment_files.describe(self.attachments, task.get('attachments') or [])
        brief_files = f"\n\n需求附件（請直接讀取）：\n{brief_files}" if brief_files else ''
        return (f"請執行任務 {task['id']}：{task['title']}\n\n需求：\n{task['description'] or task['title']}{brief_files}{followup}\n\n"
                f"使用者補充：\n{notes or '無'}\n\n"
                "請遵守工作資料夾中的 AGENTS.md 與既有專案規範。完成後用繁體中文回報成果、驗證方式與未完成事項。"
                "需要發布、合併或外部傳送時先取得使用者的明確授權。只有確實完成並驗證才回報完成；無法完成就說明阻礙。"
                "成果會先進入待審核，由使用者驗收。不要直接修改任務看板資料庫。")

    def run_images(self, task):
        """Image attachments handed to the tool as native image input for the latest run. A continued conversation
        already saw the brief's images, so only its own follow-up images are sent again."""
        run = task['runs'][-1] if task.get('runs') else {}
        items = list(run.get('attachments') or [])
        if run.get('kind') != 'followup':
            items = list(task.get('attachments') or []) + items
        images = []
        for item in items:
            path = self.attachments.path(item)
            if item.get('mime') in attachment_files.IMAGE_TYPES and path.is_file():
                images.append({**item, 'path': str(path)})
        return images

    def start(self, task_id, force=False):
        """Dispatch now. `force` is the person's explicit override of unfinished blockers (recorded on the card);
        the automatic scheduler never forces."""
        with self.lock:
            if self.active_id or self.launching:
                raise BoardError('已有任務執行中，其他任務會依序排隊。', 409)
            task = self.store.get(task_id)
            if task['status'] == 'done':
                raise BoardError('請先把已完成的任務移回待辦。')
            if task['status'] == 'in_progress':
                raise BoardError('這張卡片正由 Claude App 的對話執行中，請等回合結束。', 409)
            self.validate_workspace(task['cwd'])
            pending = task.get('nextRun')
            previous = task['runs'][-1] if task['runs'] else None
            if not pending and previous and previous['status'] in ('failed', 'interrupted'):
                # A retry keeps the request and session, but takes the card's current model／effort so a
                # corrected choice (unavailable model, unsupported effort) is what actually runs.
                retry_tool = run_tool(task, previous)
                same_tool = retry_tool == task_tool(task)
                pending = {'threadId': previous['threadId'], 'text': previous['request'], 'cwd': previous['cwd'],
                           'kind': previous['kind'], 'tool': retry_tool,
                           'model': task.get('model', '') if same_tool else previous.get('model', ''),
                           'effort': task.get('effort', '') if same_tool else previous.get('effort', ''),
                           'fromTool': previous.get('fromTool', ''), 'attachments': previous.get('attachments', [])}
            if task['sourceId'] and not task['description'].strip() and not pending:
                raise BoardError('請先補上這次要執行的需求；聊天標題不會直接當成新指令。')
            blocked = self.blockers(task)
            if blocked and not force:
                raise BoardError('前置卡片尚未完成：' + '、'.join(b['title'][:40] for b in blocked[:3]) + '。完成並驗收後會自動排入待辦；若要先跑，請用「略過前置，開始執行」。', 409)
            if blocked:
                task['comments'].append({'author': '系統', 'at': stamp(), 'kind': 'override',
                                         'text': '使用者略過尚未完成的前置卡片，手動開始執行：' + '、'.join(f"{b['title'][:40]}（{STATUS_LABELS.get(b['status'], b['status'])}）" for b in blocked)})
            tool = (pending or {}).get('tool') or task_tool(task)
            capability = self.adapters[tool].capabilities()
            if not capability['available']:
                raise BoardError(f"{capability['label']} 目前無法使用：{capability['reason']}", 503)
            thread_id = pending['threadId'] if pending else task['workerThreadId']
            if not pending and thread_id and session_tool(task, thread_id) != tool:
                thread_id = ''  # never resume another tool's session
            if thread_id and (self.chat(tool, thread_id) or {}).get('sessionStatus', {}).get('status') == 'in_progress':
                raise BoardError('這個對話仍有執行訊號，請等執行結束後再延續。', 409)
            cwd = (pending or {}).get('cwd') or task['cwd'] or str(self.default_workspace / task_id)
            self.validate_workspace((pending or {}).get('cwd') or task['cwd'])
            model = pending['model'] if pending and 'model' in pending else task.get('model', '')
            effort = pending['effort'] if pending and 'effort' in pending else task.get('effort', '')
            # Snapshot before clearing the latest report; previous runs remain immutable.
            task['runs'].append({'id': uuid.uuid4().hex[:12], 'kind': (pending or {}).get('kind', 'initial' if not task['runs'] else 'retry'),
                                 'threadId': thread_id, 'turnId': '', 'cwd': cwd, 'tool': tool, 'model': model, 'effort': effort,
                                 'fromTool': (pending or {}).get('fromTool', ''), 'attachments': (pending or {}).get('attachments', []),
                                 'request': pending['text'] if pending else task['description'] or task['title'],
                                 'result': '', 'error': '', 'status': 'running', 'startedAt': stamp()})
            task['nextRun'] = None
            task['workerThreadId'] = thread_id
            task['tool'] = tool
            self.launching = True
            self.active_id = task_id
            task['status'], task['error'], task['result'], task['retryAt'] = 'in_progress', '', '', 0
            task['turnId'] = ''
            self.store.put(task)
        threading.Thread(target=self._launch, args=(task_id,), daemon=True).start()
        return self.store.get(task_id)

    def _launch(self, task_id):
        try:
            task = self.store.get(task_id)
            self.adapters[run_tool(task, task['runs'][-1])].launch(task_id)
        except Exception as exc:
            with self.lock:
                task = self.store.get(task_id)
                task['status'], task['error'] = 'in_review', str(exc)
                finish_run(task, 'failed')
                task['comments'].append({'text': f'派工失敗：{exc}', 'author': '系統', 'at': stamp()})
                self.store.put(task)
                if self.active_id == task_id:
                    self.active_id = None
        finally:
            with self.lock:
                self.launching = False

    def on_event(self, message):
        self.adapters['codex'].on_event(message)

    def answer(self, request_id, body):
        with self.lock:
            request = self.requests.get(str(request_id))
            if not request:
                raise BoardError('這個請求已結束。', 409)
        self.adapters[request.get('tool', 'codex')].answer(request, body)
        with self.lock:
            self.requests.pop(str(request_id), None)
        return {'ok': True}

    def stop(self, task_id):
        with self.lock:
            task = self.store.get(task_id)
            if self.active_id != task_id or not task['turnId']:
                raise BoardError('任務仍在啟動或已結束，請稍後確認。', 409)
        self.adapters[run_tool(task, task['runs'][-1])].stop(task)
        return {'ok': True}

    def scheduler(self):
        while self.running:
            try:
                self.tick()
            except Exception:
                LOG.exception('Scheduler failed')
            time.sleep(5)

    def tick(self):
        with self.lock:
            if self.store.setting('automatic') and not self.active_id and not self.launching:
                available = {tool for tool, adapter in self.adapters.items() if adapter.capabilities()['available']}
                eligible = [t for t in self.store.all() if t['status'] == 'todo' and t.get('retryAt', 0) <= stamp()
                            and ((t.get('nextRun') or {}).get('tool') or task_tool(t)) in available
                            and not self.blockers(t)
                            and (not t['sourceId'] or bool(t['description'].strip()) or bool(t.get('nextRun'))
                                 or bool(t.get('runs') and t['runs'][-1]['kind'] in ('followup', 'new_session', 'handoff')
                                         and t['runs'][-1]['status'] in ('failed', 'interrupted')))
                            and (self.chat((t.get('nextRun') or {}).get('tool') or task_tool(t),
                                           (t.get('nextRun') or {}).get('threadId', t['workerThreadId'])) or {})
                                .get('sessionStatus', {}).get('status') != 'in_progress']
                eligible.sort(key=queue_order)
                if eligible:
                    return self.start(eligible[0]['id'])
        return None

    def close(self):
        self.running = False
        for adapter in self.adapters.values():
            adapter.close()


class Handler(BaseHTTPRequestHandler):
    server_version = 'CasparTaskboard/1.0'
    # Keep-alive plus chunked flushes: on this Windows host a single large write followed by an
    # immediate close lost loopback segments (~10% of >100 KB replies reset after 19 s of retransmits).
    protocol_version = 'HTTP/1.1'
    WRITE_CHUNK = 16384

    def log_message(self, fmt, *args):
        if args and str(args[0]).startswith('GET /api/state'):
            return
        LOG.info(fmt, *args)

    @property
    def board(self):
        return self.server.board

    def check_host(self):
        if self.headers.get('Host') not in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'):
            raise BoardError('Host 不允許。', 403)

    def check_api(self):
        if not hmac.compare_digest(self.headers.get('X-Board-Token', ''), self.server.token):
            raise BoardError('請重新開啟看板。', 403)
        origin = self.headers.get('Origin')
        if origin and origin not in (f'http://127.0.0.1:{self.server.server_port}', f'http://localhost:{self.server.server_port}'):
            raise BoardError('Origin 不允許。', 403)

    def body(self, limit=300000):
        size = int(self.headers.get('Content-Length', '0'))
        if size < 0 or size > limit:
            raise BoardError('請求太大。', 413)
        value = json.loads(self.rfile.read(size) or '{}')
        if not isinstance(value, dict):
            raise BoardError('JSON 必須是物件。')
        return value

    def reply(self, data, status=200, mime='application/json; charset=utf-8', embed=False):
        encoded = json.dumps(data, ensure_ascii=False).encode() if mime.startswith('application/json') else data.encode()
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(encoded)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        ancestors = "app: codex-sandbox: file:" if embed else "'none'"
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors " + ancestors)
        self.end_headers()
        for start in range(0, len(encoded), self.WRITE_CHUNK):
            self.wfile.write(encoded[start:start + self.WRITE_CHUNK])
            self.wfile.flush()

    def dispatch(self, method):
        self.check_host()
        parsed = urlparse(self.path)
        path, query = parsed.path, parse_qs(parsed.query)
        tool = (query.get('tool') or ['codex'])[0]
        if method == 'GET' and path == '/health':
            return self.reply({'ok': True, 'service': 'caspar-taskboard'})
        if method == 'GET' and path in ('/', '/index.html'):
            embed = query.get('embed') == ['1']
            user_name = board_user_name('codex' if embed else 'claude')
            html = (ROOT / 'index.html').read_text(encoding='utf-8').replace('__BOARD_TOKEN__', self.server.token).replace('__BOARD_USER__', html_escape(user_name))
            return self.reply(html, mime='text/html; charset=utf-8', embed=embed)
        if not path.startswith('/api/'):
            raise BoardError('找不到此頁面。', 404)
        self.check_api()
        if method == 'GET':
            if path == '/api/state':
                return self.reply(self.board.state())
            if path == '/api/chats':
                result = self.board.chats_list()
                try:
                    claude = self.board.claude_list()
                except Exception as exc:
                    claude = {'chats': list(self.board.claude_chats.values()), 'error': str(exc)}
                return self.reply({**result, 'claudeChats': claude['chats'], 'claudeError': claude.get('error', '')})
            if path == '/api/vendor/mermaid':
                return self.reply(vendor_mermaid())
            if path == '/api/models':
                return self.reply({'tool': tool, 'models': self.board.models(tool)})
            if path == '/api/export':
                return self.reply({'schemaVersion': EXPORT_SCHEMA, 'exportedAt': stamp(), 'tasks': self.board.store.all()})
            if path.startswith('/api/chat/'):
                return self.reply(self.board.read_chat(path.split('/')[-1], tool))
            if path.startswith('/api/attachments/'):
                return self.reply(self.board.attachments.read(path.split('/')[-1]))
        if path == '/api/attachments' and method == 'POST':
            return self.reply(self.board.attachments.save(self.body(attachment_files.MAX_BODY)), 201)
        body = self.body() if method in ('POST', 'PATCH') else {}
        if path == '/api/folders/select' and method == 'POST':
            return self.reply(self.server.folder_picker.start(body.get('initialPath', '')), 202)
        folder_parts = path.split('/')
        if len(folder_parts) == 4 and folder_parts[2] == 'folders' and method == 'GET':
            return self.reply(self.server.folder_picker.get(folder_parts[3]))
        if len(folder_parts) == 5 and folder_parts[2] == 'folders' and folder_parts[4] == 'cancel' and method == 'POST':
            return self.reply(self.server.folder_picker.cancel(folder_parts[3]))
        if path == '/api/tasks' and method == 'POST':
            with self.board.lock:
                return self.reply(self.board.create(body), 201)
        if path == '/api/settings' and method == 'PATCH':
            if not isinstance(body.get('automatic'), bool):
                raise BoardError('automatic 必須為布林值。')
            with self.board.lock:
                self.board.store.set_setting('automatic', body['automatic'])
            return self.reply({'ok': True})
        if path == '/api/import-chat' and method == 'POST':
            return self.reply(self.board.import_chat(body.get('threadId'), body.get('tool', 'codex')))
        if path == '/api/plans' and method == 'POST':
            return self.reply(self.board.import_plan(body), 201)
        if path == '/api/claude-groups' and method == 'POST':
            return self.reply(self.board.set_claude_groups(body))
        if path == '/api/claude-turns' and method == 'POST':
            return self.reply(self.board.mirror_turn(body))
        if path == '/api/shutdown' and method == 'POST':
            self.reply({'ok': True})
            self.board.running = False
            threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        parts = path.split('/')
        if len(parts) >= 4 and parts[2] == 'tasks':
            task_id = parts[3]
            if len(parts) == 4:
                if method == 'PATCH':
                    return self.reply(self.board.update(task_id, body))
                if method == 'DELETE':
                    with self.board.lock:
                        if self.board.active_id == task_id:
                            raise BoardError('請先停止執行中的任務。', 409)
                        attached = task_attachment_ids(self.board.store.get(task_id))
                        self.board.store.delete(task_id)
                        self.board.attachments.delete(attached)
                    return self.reply({'ok': True})
            if len(parts) == 5 and method == 'POST':
                if parts[4] == 'start':
                    return self.reply(self.board.start(task_id, force=body.get('force') is True))
                if parts[4] == 'stop':
                    return self.reply(self.board.stop(task_id))
                if parts[4] == 'comment':
                    return self.reply(self.board.comment(task_id, body.get('text', '')))
                if parts[4] == 'followup':
                    return self.reply(self.board.followup(task_id, body))
            if len(parts) == 6 and method == 'POST' and parts[4] == 'followup' and parts[5] == 'cancel':
                return self.reply(self.board.cancel_followup(task_id, body))
        if len(parts) == 4 and parts[2] == 'approvals' and method == 'POST':
            # Claude request ids carry a colon ("claude:<uuid>") that the pages send percent-encoded.
            return self.reply(self.board.answer(unquote(parts[3]), body))
        raise BoardError('找不到此操作。', 404)

    def handle_method(self, method):
        try:
            self.dispatch(method)
        except BoardError as exc:
            self.reply({'error': str(exc)}, exc.status)
        except (ValueError, TypeError):
            self.reply({'error': '請求格式不正確。'}, 400)
        except Exception:
            LOG.exception('Request failed')
            self.reply({'error': '服務發生錯誤，請檢查看板紀錄。'}, 500)

    def do_GET(self): self.handle_method('GET')
    def do_POST(self): self.handle_method('POST')
    def do_PATCH(self): self.handle_method('PATCH')
    def do_DELETE(self): self.handle_method('DELETE')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=47824)
    parser.add_argument('--data-dir', type=Path, default=ROOT / '.data')
    parser.add_argument('--codex', default=os.environ.get('TASKBOARD_CODEX') or shutil.which('codex'))
    parser.add_argument('--claude', default=None, help='Claude Code CLI path (defaults to TASKBOARD_CLAUDE or `claude` on PATH).')
    parser.add_argument('--no-connect', action='store_true', help='Run the UI without starting Codex (for tests).')
    args = parser.parse_args()
    args.data_dir.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(filename=args.data_dir / 'server.log', level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', encoding='utf-8')
    board = Board(args.data_dir, args.codex, resolve_command(args.claude))
    http = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    http.board, http.token = board, secrets.token_urlsafe(32)
    http.folder_picker = FolderPicker()
    atexit.register(http.folder_picker.close)
    atexit.register(board.close)
    if not args.no_connect:
        def connect():
            try: board.rpc.connect()
            except Exception as exc: board.rpc.error = str(exc)
        threading.Thread(target=connect, daemon=True).start()
        threading.Thread(target=board.adapters['claude'].probe_version, daemon=True).start()
        threading.Thread(target=board.sync_sessions, daemon=True).start()
    threading.Thread(target=board.scheduler, daemon=True).start()
    print(f'Taskboard listening at http://127.0.0.1:{args.port}', flush=True)
    try:
        http.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        http.folder_picker.close()
        board.close()
        http.server_close()


if __name__ == '__main__':
    main()
