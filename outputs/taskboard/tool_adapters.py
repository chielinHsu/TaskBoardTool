"""Shared execution interface. Each tool adapter maps its own protocol onto board runs.

The board owns scheduling, SQLite and the HTTP API; adapters only translate
availability, model lists, launches, stops, approvals and chat reads.
"""
from __future__ import annotations
from pathlib import Path

TOOLS = ('codex', 'claude')
TOOL_LABELS = {'codex': 'Codex', 'claude': 'Claude Code'}


def task_tool(task):
    return task.get('tool') or 'codex'


def run_tool(task, run):
    return run.get('tool') or task_tool(task)


def session_tool(task, session_id):
    """Tool that owns a session linked to this card (runs first, then the source chat)."""
    for run in reversed(task.get('runs', [])):
        if run.get('threadId') == session_id:
            return run_tool(task, run)
    if session_id and session_id == task.get('sourceId'):
        return task.get('sourceTool') or task_tool(task)
    return task_tool(task)


def task_session_keys(task):
    """(tool, session id) pairs; the same id under different tools never collides."""
    keys = set()
    if task.get('sourceId'):
        keys.add((task.get('sourceTool') or task_tool(task), task['sourceId']))
    for run in task.get('runs', []):
        if run.get('threadId'):
            keys.add((run_tool(task, run), run['threadId']))
    if task.get('workerThreadId'):
        keys.add((session_tool(task, task['workerThreadId']), task['workerThreadId']))
    return keys


class BoardError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class ToolAdapter:
    """Interface every execution tool implements. Unsupported abilities report False in capabilities()."""
    tool = ''
    label = ''

    def __init__(self, board):
        self.board = board

    def capabilities(self):
        raise NotImplementedError

    def models(self):
        """Verified model catalogue from the tool itself; never a hard-coded list."""
        raise NotImplementedError

    def launch(self, task_id):
        """Start or resume the latest run snapshot of the task. Called in a worker thread."""
        raise NotImplementedError

    def stop(self, task):
        raise NotImplementedError

    def answer(self, request, body):
        raise NotImplementedError

    def read_chat(self, session_id):
        raise NotImplementedError

    def list_sessions(self):
        """Read-only session projection: (chats, has_more). Never resumes or dispatches."""
        return [], False

    def close(self):
        pass


class CodexAdapter(ToolAdapter):
    """Codex app-server JSON-RPC over stdio (the original dispatch path)."""
    tool = 'codex'
    label = TOOL_LABELS['codex']

    @property
    def rpc(self):
        return self.board.rpc  # tests swap board.rpc for a fake

    def capabilities(self):
        available = bool(getattr(self.rpc, 'executable', True))  # simulated RPCs count as installed
        return {'tool': self.tool, 'label': self.label, 'available': available,
                'reason': '' if available else '找不到 Codex 執行檔。請在啟動指令使用 --codex 指定位置。',
                'connected': bool(self.rpc.ready), 'connectionError': self.rpc.error,
                'models': available, 'resume': available, 'stop': available, 'approvals': available,
                'readChat': available, 'listSessions': available, 'embed': True, 'openInApp': False,
                'notes': ['專用 Codex App 視窗可嵌入看板；對話以 thread/resume 延續。']}

    def models(self):
        self.rpc.connect()
        models, cursor, seen = [], None, set()
        for _ in range(20):
            result = self.rpc.call('model/list', {'limit': 100, 'includeHidden': False, **({'cursor': cursor} if cursor else {})})
            for item in result.get('data', []):
                model = item.get('model') or item.get('id')
                if model and model not in seen and not item.get('hidden'):
                    seen.add(model)
                    models.append({'model': model, 'displayName': item.get('displayName') or model, 'isDefault': bool(item.get('isDefault'))})
            next_cursor = result.get('nextCursor')
            if not next_cursor:
                break
            if next_cursor == cursor:
                raise BoardError('模型清單分頁未能完成。', 502)
            cursor = next_cursor
        else:
            raise BoardError('模型清單過大，請稍後重試。', 502)
        return models

    def launch(self, task_id):
        board = self.board
        self.rpc.connect()
        task = board.store.get(task_id)
        cwd = task['runs'][-1]['cwd']
        model = task['runs'][-1].get('model', '')
        if model and model not in {item['model'] for item in board.models('codex')}:
            raise BoardError('所選模型目前不可用，請重新選擇負責模型再執行。')
        model_options = {'model': model} if model else {}
        Path(cwd).mkdir(parents=True, exist_ok=True)
        board.fill_workspace(task_id, cwd)
        task = board.store.get(task_id)
        if task['workerThreadId']:
            self.rpc.call('thread/resume', {'threadId': task['workerThreadId'], 'cwd': cwd,
                                           'approvalPolicy': 'on-request', 'approvalsReviewer': 'auto_review',
                                           'sandbox': 'workspace-write', **model_options})
        else:
            result = self.rpc.call('thread/start', {'cwd': cwd, 'approvalPolicy': 'on-request',
                                                    'approvalsReviewer': 'auto_review', 'sandbox': 'workspace-write', **model_options})
            board.bind_session(task_id, result['thread']['id'])
            task = board.store.get(task_id)
            self.rpc.call('thread/name/set', {'threadId': task['workerThreadId'], 'name': task['title']})
        task = board.store.get(task_id)
        result = self.rpc.call('turn/start', {'threadId': task['workerThreadId'],
                                             'input': [{'type': 'text', 'text': board.prompt(task)}],
                                             'cwd': cwd, 'approvalPolicy': 'on-request', 'approvalsReviewer': 'auto_review',
                                             'sandboxPolicy': {'type': 'workspaceWrite', 'writableRoots': [cwd], 'networkAccess': False}, **model_options})
        board.set_turn(task_id, result['turn']['id'])

    def on_event(self, message):
        board = self.board
        method, params = message.get('method', ''), message.get('params', {})
        if method == '_disconnected':
            with board.lock:
                active = board.active_task()
                if active and task_tool(active) == 'codex':
                    board.complete_run(active['id'], 'interrupted', 'Codex 連線中斷，請確認結果後再重試。', review=True)
                board.requests = {key: value for key, value in board.requests.items() if value.get('tool') != 'codex'}
            return
        if 'id' in message and method:
            allowed = ('item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'item/tool/requestUserInput')
            if method not in allowed:
                self.rpc.respond(message['id'], error={'code': -32601, 'message': 'This taskboard does not support this interactive request. Please use the native Codex app.'})
                return
            with board.lock:
                board.requests[str(message['id'])] = {'id': message['id'], 'method': method, 'params': params, 'tool': 'codex'}
            return
        if method == 'serverRequest/resolved':
            with board.lock:
                board.requests.pop(str(params.get('requestId')), None)
            return
        thread_id = params.get('threadId')
        with board.lock:
            task = board.active_task()
            if not task or task_tool(task) != 'codex' or task['workerThreadId'] != thread_id:
                return
            if method == 'turn/started':
                if any(r.get('turnId') == params['turn']['id'] for r in task['runs'][:-1]):
                    return
                board.set_turn(task['id'], params['turn']['id'])
            elif method == 'item/agentMessage/delta':
                if params.get('turnId') and task['turnId'] and params['turnId'] != task['turnId']:
                    return
                board.set_progress(task['id'], params.get('delta', ''), append=True)
            elif method == 'item/completed' and params.get('item', {}).get('type') == 'agentMessage':
                if params.get('turnId') and task['turnId'] and params['turnId'] != task['turnId']:
                    return
                item = params['item']
                if item.get('phase') != 'commentary' or not task['result']:
                    board.set_progress(task['id'], item.get('text', task['result']))
            elif method == 'turn/completed':
                turn = params['turn']
                if not task['turnId'] or turn['id'] != task['turnId']:
                    return
                error = turn.get('error') or {}
                board.complete_run(task['id'], turn.get('status') or 'unknown', error.get('message', ''))

    def answer(self, request, body):
        if request['method'] == 'item/tool/requestUserInput':
            answers = body.get('answers')
            if not isinstance(answers, dict):
                raise BoardError('回答格式不正確。')
            validated = {}
            for question in request['params'].get('questions', []):
                text = self.board.clean(answers.get(question['id'], ''), '回答')
                if not text:
                    raise BoardError('請回答所有問題。')
                validated[question['id']] = {'answers': [text]}
            result = {'answers': validated}
        else:
            decision = body.get('decision')
            if decision not in ('accept', 'decline', 'cancel'):
                raise BoardError('核准選項不正確。')
            result = {'decision': decision}
        self.rpc.respond(request['id'], result=result)

    def stop(self, task):
        self.rpc.call('turn/interrupt', {'threadId': task['workerThreadId'], 'turnId': task['turnId']})

    def read_chat(self, session_id):
        self.rpc.connect()
        metadata = self.rpc.call('thread/read', {'threadId': session_id, 'includeTurns': False})['thread']
        result = self.rpc.call('thread/turns/list', {'threadId': session_id, 'limit': 20, 'sortDirection': 'desc', 'itemsView': 'full'})
        return {'id': session_id, 'tool': 'codex', 'title': metadata.get('name') or metadata.get('preview') or session_id,
                'turns': list(reversed(result.get('data', []))), 'hasMore': bool(result.get('nextCursor'))}

    def list_sessions(self):
        self.rpc.connect()
        all_chats, cursor = [], None
        for _ in range(30):
            params = {'limit': 100, 'sortKey': 'updated_at', 'sourceKinds': ['cli', 'vscode', 'exec', 'appServer', 'unknown'], 'useStateDbOnly': True}
            if cursor:
                params['cursor'] = cursor
            result = self.rpc.call('thread/list', params)
            for raw in result.get('data', []):
                all_chats.append({'id': raw['id'], 'tool': 'codex', 'title': raw.get('name') or raw.get('preview') or raw['id'],
                                  'cwd': raw.get('cwd') or '', 'updatedAt': raw.get('updatedAt', 0),
                                  'createdAt': raw.get('createdAt', raw.get('updatedAt', 0)),
                                  'sessionStatus': self.board.session_signals.read(raw)})
            cursor = result.get('nextCursor')
            if not cursor:
                break
        return all_chats, bool(cursor)

    def close(self):
        self.rpc.close()
