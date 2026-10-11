"""Disposable HTTP fixture. All RPC operations are simulated, never call Codex."""
import json
from pathlib import Path
import secrets
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'outputs/taskboard'))
import server
from claude_sessions import ClaudeSessionIndex, encode_project

FAKE_CLI = [sys.executable, '-X', 'utf8', str(ROOT / 'tests' / 'fake_claude_cli.py')]
CLAUDE_LINKED = '11111111-2222-3333-4444-555555555555'
CLAUDE_UNLINKED = '99999999-8888-7777-6666-555555555555'


class FixtureRPC:
    ready, error = True, ''

    def __init__(self, board):
        self.board = board
        self.calls = []
        self.serial = 10

    def connect(self):
        pass

    def close(self):
        pass

    def call(self, method, params):
        self.calls.append(method)
        if method == 'model/list':
            return {'data': [{'model': 'fixture-model', 'displayName': '隔離測試模型', 'isDefault': True}]}
        if method == 'thread/start':
            self.serial += 1
            return {'thread': {'id': f'fixture-chat-{self.serial}'}}
        if method == 'turn/start':
            self.serial += 1
            turn_id = f'fixture-turn-{self.serial}'
            thread_id = params['threadId']
            self.board.on_event({'method': 'turn/started', 'params': {'threadId': thread_id, 'turn': {'id': turn_id}}})
            def finish():
                self.board.on_event({'method': 'item/completed', 'params': {'threadId': thread_id, 'turnId': turn_id,
                    'item': {'type': 'agentMessage', 'phase': 'final_answer', 'text': '隔離測試：後續修正回報'}}})
                self.board.on_event({'method': 'turn/completed', 'params': {'threadId': thread_id,
                    'turn': {'id': turn_id, 'status': 'completed'}}})
            threading.Timer(.05, finish).start()
            return {'turn': {'id': turn_id}}
        if method == 'thread/read':
            return {'thread': {'id': params['threadId'], 'name': '隔離測試對話'}}
        if method == 'thread/turns/list':
            return {'data': [{'id': 'fixture-turn', 'status': 'completed', 'items': [
                {'type': 'userMessage', 'content': [{'type': 'text', 'text': '原始需求'}]},
                {'type': 'agentMessage', 'phase': 'final_answer', 'text': '隔離對話內容'}]}]}
        return {}


class FixtureBoard(server.Board):
    def state(self):
        state = super().state()
        state['fixtureCalls'] = self.rpc.calls
        return state


class FixturePicker:
    """Same async HTTP contract as Windows chooser, without opening a window."""
    def __init__(self, cwd):
        self.path = str(Path(cwd) / '已選 中文資料夾')
        Path(self.path).mkdir()
        self.job = None
        self.reads = 0

    def start(self, initial_path=''):
        self.job = {'id': secrets.token_hex(8), 'status': 'pending'}
        self.cancelled = initial_path == self.path
        self.reads = 0
        return dict(self.job)

    def get(self, job_id):
        if not self.job or self.job['id'] != job_id:
            raise server.BoardError('找不到選擇操作。', 404)
        self.reads += 1
        if self.reads > 1 and self.job['status'] == 'pending':
            self.job = {**self.job, 'status': 'cancelled' if self.cancelled else 'selected'}
            if not self.cancelled: self.job['path'] = self.path
        return dict(self.job)

    def cancel(self, job_id):
        self.get(job_id)
        self.job['status'] = 'cancelled'
        return dict(self.job)


with tempfile.TemporaryDirectory(dir=ROOT / 'work') as temp:
    board = FixtureBoard(Path(temp) / 'board', None)
    board.rpc = FixtureRPC(board)
    board.store.set_setting('automatic', False)
    task = board.create({'title': '測試：完整任務上下文', 'description': '需求簡介\n驗收條件：保留每次執行結果。',
                         'cwd': temp, 'project': '測試專案'})
    task['status'] = 'in_review'
    task['workerThreadId'] = 'fixture-chat-b'
    task['result'] = '第二個 session 的回報'
    for i, (thread_id, kind, result) in enumerate([
        ('fixture-chat-a', 'initial', '首次回報，必須保留'),
        ('fixture-chat-a', 'followup', '同一個 session 的第二次回報'),
        ('fixture-chat-b', 'new_session', '第二個 session 的回報')]):
        task['runs'].append({'id': f'run-{i}', 'threadId': thread_id, 'turnId': f'turn-{i}', 'kind': kind,
                             'request': f'第 {i+1} 次需求', 'result': result, 'error': '',
                             'cwd': temp, 'status': 'completed', 'startedAt': server.stamp(), 'finishedAt': server.stamp()})
    board.store.put(task)
    related = board.create({'title': '測試：相關議題', 'project': '測試專案', 'cwd': temp})
    board.chats = {'readonly-chat': {'id': 'readonly-chat', 'tool': 'codex', 'title': '測試唯讀追蹤卡片', 'cwd': temp,
                                    'createdAt': server.stamp(), 'updatedAt': server.stamp(),
                                    'sessionStatus': {'status': 'in_review', 'label': '最近回合已結束 · 待確認'}}}
    board.chat_sync['updatedAt'] = server.stamp()
    # Claude Code: simulated CLI, isolated session index with one linked and one unlinked App session.
    claude = board.adapters['claude']
    claude.command = FAKE_CLI
    claude.sessions = ClaudeSessionIndex(Path(temp) / 'claude-desktop', Path(temp) / 'claude-projects')
    for session_id, title in ((CLAUDE_LINKED, 'Claude 接手對話'), (CLAUDE_UNLINKED, '測試 Claude 同步追蹤卡片')):
        transcript = Path(temp) / 'claude-projects' / encode_project(temp) / f'{session_id}.jsonl'
        transcript.parent.mkdir(parents=True, exist_ok=True)
        transcript.write_text('\n'.join(json.dumps(r, ensure_ascii=False) for r in [
            {'type': 'user', 'uuid': 'u1', 'timestamp': '2026-10-10T02:00:00Z', 'message': {'role': 'user', 'content': [{'type': 'text', 'text': f'{title}：原始需求'}]}},
            {'type': 'assistant', 'timestamp': '2026-10-10T02:00:20Z', 'message': {'role': 'assistant', 'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': 'Claude 的回報內容'}]}}]) + '\n', encoding='utf-8')
        board.claude_chats[session_id] = {'id': session_id, 'tool': 'claude', 'title': title, 'cwd': temp, 'model': 'claude-opus-5-5',
                                          'desktopId': 'local_' + session_id[:8], 'createdAt': server.stamp(), 'updatedAt': server.stamp(),
                                          'sessionStatus': {'status': 'in_review', 'label': '最近回合已結束 · 待確認'}}
    board.claude_sync['updatedAt'] = server.stamp()
    claude_task = board.create({'title': '測試：Claude 接手任務', 'description': '先由 Codex 執行，再交給 Claude Code 修正。',
                                'cwd': temp, 'project': '測試專案', 'tool': 'claude', 'model': 'fake-opus'})
    claude_task['status'] = 'in_review'
    claude_task['workerThreadId'] = CLAUDE_LINKED
    claude_task['result'] = 'Claude 的回報內容'
    for i, (thread_id, tool, kind, from_tool, result) in enumerate([
            ('fixture-chat-c', 'codex', 'initial', '', 'Codex 的第一次回報'),
            (CLAUDE_LINKED, 'claude', 'handoff', 'codex', 'Claude 的回報內容')]):
        claude_task['runs'].append({'id': f'crun-{i}', 'threadId': thread_id, 'turnId': f'cturn-{i}', 'kind': kind, 'tool': tool,
                                    'fromTool': from_tool, 'model': 'fixture-model' if tool == 'codex' else 'fake-opus',
                                    'request': f'第 {i+1} 次需求', 'result': result, 'error': '', 'cwd': temp, 'status': 'completed',
                                    'startedAt': server.stamp(), 'finishedAt': server.stamp()})
    board.store.put(claude_task)
    http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
    http.board, http.token = board, secrets.token_urlsafe(32)
    http.folder_picker = FixturePicker(temp)
    print(json.dumps({'url': f'http://127.0.0.1:{http.server_port}', 'token': http.token,
                      'taskId': task['id'], 'relatedId': related['id'], 'claudeTaskId': claude_task['id'], 'cwd': temp,
                      'pickerPath': http.folder_picker.path}), flush=True)
    try:
        http.serve_forever()
    finally:
        board.close()
        board.store.db.close()
        http.server_close()
