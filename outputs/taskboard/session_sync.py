"""Read-only projections of local Codex sessions; never dispatch or persist cards."""
from datetime import datetime
import json
import os
from pathlib import Path
import time


class SessionSignals:
    def __init__(self, codex_home=None):
        self.root = (Path(codex_home or os.environ.get('CODEX_HOME') or Path.home() / '.codex') / 'sessions').resolve()
        self.cache = {}

    def read(self, raw, now=None):
        now = time.time() if now is None else now
        runtime = raw.get('status') or {}
        if runtime.get('type') == 'active':
            flags = runtime.get('activeFlags') or []
            return {'status': 'in_progress', 'label': '等待核准或回答' if flags else '正在執行', 'basis': 'runtime'}
        if runtime.get('type') == 'systemError':
            return {'status': 'backlog', 'label': 'Session 發生錯誤', 'basis': 'runtime'}
        unknown = {'status': 'backlog', 'label': '狀態待確認', 'basis': 'unknown'}
        if not raw.get('path'):
            return unknown
        try:
            path = Path(raw['path']).resolve()
            if not path.is_relative_to(self.root) or path.suffix != '.jsonl':
                return unknown
            stat = path.stat()
            fingerprint = (stat.st_size, stat.st_mtime_ns)
            cached = self.cache.get(str(path))
            if cached and cached[0] == fingerprint:
                signal = cached[1]
            else:
                signal = None
                with path.open('rb') as stream:
                    offset = max(0, stat.st_size - 262144)
                    stream.seek(offset)
                    if offset:
                        stream.readline()  # Drop the partial first record.
                    for line in stream.read(262144).splitlines():
                        try:
                            record = json.loads(line)
                            payload = record.get('payload') or {}
                            if record.get('type') != 'event_msg':
                                continue
                            kind = payload.get('type')
                            if kind in ('task_complete', 'turn_aborted', 'task_started'):
                                signal = (kind, record.get('timestamp'), payload.get('turn_id'))
                            elif kind == 'item_completed' and payload.get('item', {}).get('type') != 'UserMessage':
                                # Do not let a late tool result reopen a completed turn.
                                if not signal or signal[0] not in ('task_complete', 'turn_aborted') or (payload.get('turn_id') and payload.get('turn_id') != signal[2]):
                                    signal = ('activity', record.get('timestamp'), payload.get('turn_id'))
                        except (ValueError, TypeError, AttributeError):
                            continue
                self.cache[str(path)] = (fingerprint, signal)
            if not signal:
                return unknown
            kind, timestamp, _ = signal
            at = datetime.fromisoformat(timestamp.replace('Z', '+00:00')).timestamp()
            if kind == 'task_complete':
                return {'status': 'in_review', 'label': '最近回合已結束 · 待確認', 'basis': 'rollout', 'at': at}
            if kind == 'turn_aborted':
                return {'status': 'backlog', 'label': '最近回合已中止', 'basis': 'rollout', 'at': at}
            if 0 <= now - at <= 600:
                return {'status': 'in_progress', 'label': '近期有執行訊號', 'basis': 'rollout', 'at': at}
            return {'status': 'backlog', 'label': '執行訊號已過期 · 待確認', 'basis': 'rollout', 'at': at}
        except (OSError, ValueError, TypeError, AttributeError):
            return unknown


def session_card(chat, stale=False, tool='codex'):
    """Derived read-only card. Codex ids keep the legacy `session:` prefix; other tools add their name."""
    signal = chat['sessionStatus']
    return {'id': ('session:' if tool == 'codex' else f'session:{tool}:') + chat['id'], 'title': chat['title'], 'description': '',
            'project': chat.get('project') or (Path(chat['cwd']).name if chat['cwd'] else '既有聊天'), 'cwd': chat['cwd'],
            'priority': 'medium', 'status': 'backlog' if stale else signal['status'],
            'sourceId': chat['id'], 'sourceTool': tool, 'tool': tool, 'model': chat.get('model', ''), 'labels': [],
            'desktopId': chat.get('desktopId', ''), 'workerThreadId': '', 'turnId': '', 'result': '', 'resultUrl': '',
            'error': '', 'retryAt': 0, 'comments': [], 'runs': [], 'nextRun': None, 'createdAt': chat['createdAt'],
            'updatedAt': max(chat['updatedAt'], signal.get('at', 0)), 'version': 0,
            'readOnly': True, 'sessionStatus': {**signal, 'label': '同步中斷 · 上次狀態：' + signal['label']} if stale else signal}
