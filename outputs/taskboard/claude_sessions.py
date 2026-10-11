"""Read-only index of local Claude Code sessions. Never launches, resumes or writes anything.

Sources (both local, no credentials):
- Claude Desktop App metadata: %APPDATA%/Claude/claude-code-sessions/<org>/<user>/local_<id>.json
  (title, cwd, model, activity time, archive flag, cliSessionId).
- Claude Code CLI transcripts: ~/.claude/projects/<encoded cwd>/<session id>.jsonl
  (official storage location; the record format is documented as internal and may change,
  so every parse is best-effort and bounded).
"""
from __future__ import annotations
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import time

TAIL_BYTES = 262144
MAX_METADATA_BYTES = 1048576
MAX_TRANSCRIPT_BYTES = 64 * 1024 * 1024
RECENT_SECONDS = 600
_RECORD_FILTER = re.compile(rb'"type":\s*"(?:user|assistant|custom-title)"')


def encode_project(cwd):
    """Claude Code replaces every non-alphanumeric character of the cwd with '-'."""
    return re.sub(r'[^A-Za-z0-9]', '-', cwd)


def _timestamp(value):
    if isinstance(value, (int, float)):
        return value / 1000 if value > 1e11 else value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
        except ValueError:
            return 0
    return 0


def _text_blocks(content):
    if isinstance(content, str):
        return [content]
    return [block.get('text', '') for block in content or [] if isinstance(block, dict) and block.get('type') == 'text']


def _has_block(content, kind):
    return isinstance(content, list) and any(isinstance(block, dict) and block.get('type') == kind for block in content)


class ClaudeSessionIndex:
    def __init__(self, desktop_root=None, projects_root=None):
        appdata = os.environ.get('APPDATA', '')
        self.desktop_root = Path(desktop_root) if desktop_root else (Path(appdata) / 'Claude' / 'claude-code-sessions' if appdata else None)
        config = os.environ.get('CLAUDE_CONFIG_DIR') or str(Path.home() / '.claude')
        self.projects_root = Path(projects_root or Path(config) / 'projects').resolve()
        self.cache = {}

    @property
    def desktop_available(self):
        return bool(self.desktop_root and self.desktop_root.is_dir())

    @property
    def transcripts_available(self):
        return self.projects_root.is_dir()

    def transcript_path(self, session_id, cwd=''):
        if not re.fullmatch(r'[A-Za-z0-9-]{1,64}', session_id or ''):
            return None
        if cwd:
            candidate = self.projects_root / encode_project(cwd) / f'{session_id}.jsonl'
            if candidate.is_file():
                return candidate
        for candidate in self.projects_root.glob(f'*/{session_id}.jsonl'):
            if candidate.is_file():
                return candidate
        return None

    def list(self, now=None, limit=500):
        """Desktop App sessions as chat rows. Archived rows are dropped; nothing is written."""
        now = time.time() if now is None else now
        rows = []
        if not self.desktop_available:
            return rows
        for path in self.desktop_root.glob('*/*/local_*.json'):
            try:
                if path.stat().st_size > MAX_METADATA_BYTES:
                    continue
                data = json.loads(path.read_text(encoding='utf-8'))
            except (OSError, ValueError):
                continue
            if not isinstance(data, dict) or data.get('isArchived'):
                continue
            session_id = data.get('cliSessionId') or ''
            if not re.fullmatch(r'[A-Za-z0-9-]{1,64}', session_id):
                continue
            cwd = data.get('cwd') or ''
            updated = _timestamp(data.get('lastActivityAt') or data.get('createdAt') or 0)
            summary = data.get('postTurnSummary') if isinstance(data.get('postTurnSummary'), dict) else {}
            rows.append({'id': session_id, 'tool': 'claude', 'title': (data.get('title') or '').strip() or session_id,
                         'cwd': cwd, 'updatedAt': updated, 'createdAt': _timestamp(data.get('createdAt') or 0) or updated,
                         'model': data.get('model') or '', 'desktopId': path.stem, 'origin': 'desktop',
                         'sessionStatus': self.signal(self.transcript_path(session_id, cwd), now, summary.get('status_category') or '')})
        rows.sort(key=lambda row: -row['updatedAt'])
        return rows[:limit]

    def signal(self, path, now, summary=''):
        unknown = {'status': 'backlog', 'label': '狀態待確認', 'basis': 'unknown'}
        if not path:
            return unknown
        try:
            stat = path.stat()
            fingerprint = (stat.st_size, stat.st_mtime_ns)
            cached = self.cache.get(str(path))
            if cached and cached[0] == fingerprint:
                signal = cached[1]
            else:
                signal = None
                with path.open('rb') as stream:
                    offset = max(0, stat.st_size - TAIL_BYTES)
                    stream.seek(offset)
                    if offset:
                        stream.readline()
                    for line in stream.read(TAIL_BYTES).splitlines():
                        try:
                            record = json.loads(line)
                        except ValueError:
                            continue
                        if not isinstance(record, dict) or record.get('isSidechain'):
                            continue
                        kind = record.get('type')
                        message = record.get('message') if isinstance(record.get('message'), dict) else {}
                        content = message.get('content')
                        at = record.get('timestamp')
                        if kind == 'user' and not record.get('isMeta'):
                            signal = ('activity' if _has_block(content, 'tool_result') else 'turn_start', at)
                        elif kind == 'assistant':
                            if _has_block(content, 'tool_use') or message.get('stop_reason') in (None, 'tool_use'):
                                signal = ('activity', at)
                            else:
                                signal = ('turn_end', at)
                self.cache[str(path)] = (fingerprint, signal)
                if len(self.cache) > 3000:
                    self.cache.clear()
            if not signal:
                return unknown
            kind, timestamp = signal
            at = _timestamp(timestamp) or stat.st_mtime
            hint = {'completed': 'App 摘要：已完成', 'blocked': 'App 摘要：需要你回覆', 'review_ready': 'App 摘要：可審核'}.get(summary, '')
            if kind == 'turn_end':
                return {'status': 'in_review', 'label': '最近回合已結束 · 待確認' + (f'（{hint}）' if hint else ''), 'basis': 'transcript', 'at': at}
            if 0 <= now - at <= RECENT_SECONDS:
                return {'status': 'in_progress', 'label': '近期有執行訊號', 'basis': 'transcript', 'at': at}
            return {'status': 'backlog', 'label': '執行訊號已過期 · 待確認' + (f'（{hint}）' if hint else ''), 'basis': 'transcript', 'at': at}
        except (OSError, ValueError, TypeError, AttributeError):
            return unknown

    def read_turns(self, session_id, cwd='', limit=20):
        """Last turns of a transcript as board chat items. Returns None when no transcript exists.

        Transcripts of long sessions reach tens of MB; only a growing tail window is parsed so
        the embedded App's 20-second RPC budget is not spent on history the dialog never shows.
        """
        path = self.transcript_path(session_id, cwd)
        if not path:
            return None
        size = path.stat().st_size
        window = 2 * 1024 * 1024
        while True:
            offset = max(0, size - window)
            turns, title, partial = self._parse_tail(path, offset, limit)
            if offset == 0 or len(turns) > limit or window >= MAX_TRANSCRIPT_BYTES:
                break
            window *= 4
        dropped = partial or len(turns) > limit
        turns = turns[-limit:]
        for turn in turns:
            for item in reversed(turn['items']):
                if item['type'] == 'agentMessage':
                    item['phase'] = 'final_answer'
                    break
        return {'title': title, 'turns': turns, 'hasMore': bool(dropped), 'path': str(path)}

    @staticmethod
    def _parse_tail(path, offset, limit):
        title, turns, partial = '', [], offset > 0
        with path.open('rb') as stream:
            stream.seek(offset)
            if offset:
                stream.readline()  # drop the partial record at the window edge
            for line in stream:
                # Cheap pre-filter: skip progress/snapshot records before paying for json.loads.
                if not _RECORD_FILTER.search(line):
                    continue
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                if not isinstance(record, dict) or record.get('isSidechain'):
                    continue
                kind = record.get('type')
                if kind == 'custom-title' and record.get('customTitle'):
                    title = str(record['customTitle'])
                    continue
                message = record.get('message') if isinstance(record.get('message'), dict) else {}
                content = message.get('content')
                if kind == 'user' and not record.get('isMeta') and not _has_block(content, 'tool_result'):
                    text = '\n'.join(t for t in _text_blocks(content) if t).strip()
                    if not text:
                        continue
                    turns.append({'id': record.get('uuid') or f'turn-{len(turns)}', 'status': 'unknown', 'at': _timestamp(record.get('timestamp')),
                                  'items': [{'type': 'userMessage', 'content': [{'type': 'text', 'text': text}]}]})
                    if len(turns) > limit + 1:
                        turns.pop(0)
                        partial = True
                elif kind == 'assistant' and turns:
                    text = '\n'.join(t for t in _text_blocks(content) if t).strip()
                    if text:
                        turns[-1]['items'].append({'type': 'agentMessage', 'phase': 'commentary', 'text': text})
                    if message.get('stop_reason') == 'end_turn':
                        turns[-1]['status'] = 'completed'
        return turns, title, partial
