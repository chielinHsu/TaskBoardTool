"""Session synchronization tests use isolated data and never start a model turn."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'outputs/taskboard'))
import server
from session_sync import SessionSignals


class FakeRPC:
    ready, error = True, ''

    def __init__(self, pages):
        self.pages = pages
        self.calls = []

    def connect(self):
        pass

    def call(self, method, params):
        self.calls.append((method, params))
        if method != 'thread/list':
            raise AssertionError('Sync must never resume or execute a session')
        return self.pages[1 if params.get('cursor') else 0]

    def close(self):
        pass


class SessionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'work')
        self.root = Path(self.temp.name)
        self.board = server.Board(self.root / 'board', None)
        self.signals = SessionSignals(self.root)
        self.board.session_signals = self.signals
        self.log = self.root / 'sessions' / 'a.jsonl'
        self.log.parent.mkdir()

    def tearDown(self):
        self.board.close()
        self.board.store.db.close()
        self.temp.cleanup()

    def write(self, kind, at='2026-10-10T02:00:00Z', turn='turn-a', item=None):
        payload = {'type': kind, 'turn_id': turn}
        if item:
            payload['item'] = {'type': item}
        with self.log.open('a', encoding='utf-8') as stream:
            stream.write(json.dumps({'type': 'event_msg', 'timestamp': at, 'payload': payload}) + '\n')

    def raw(self, **extra):
        return {'id': 'chat-a', 'name': '原標題', 'cwd': str(self.root), 'path': str(self.log),
                'createdAt': 10, 'updatedAt': 20, 'status': {'type': 'notLoaded'}, **extra}

    def test_turn_lifecycle_freshness_and_cache(self):
        now = 1791597660  # 2026-10-10 02:01 UTC
        self.write('task_started')
        self.assertEqual(self.signals.read(self.raw(), now)['status'], 'in_progress')
        self.assertEqual(self.signals.read(self.raw(), now + 700)['status'], 'backlog')
        self.write('task_complete')
        self.write('item_completed', item='CommandExecution')
        self.assertEqual(self.signals.read(self.raw(), now)['status'], 'in_review')
        self.write('task_started', turn='turn-b')
        self.assertEqual(self.signals.read(self.raw(), now)['status'], 'in_progress')
        self.write('turn_aborted', turn='turn-b')
        self.assertEqual(self.signals.read(self.raw(), now)['label'], '最近回合已中止')

    def test_bounded_tail_partial_record_and_recent_activity(self):
        self.log.write_bytes(b'x' * 300000 + b'\n')
        self.write('item_completed', item='Reasoning')
        with self.log.open('ab') as stream:
            stream.write(b'{"type":')
        self.assertEqual(self.signals.read(self.raw(), 1791597660)['status'], 'in_progress')
        self.assertLess(self.log.stat().st_size, 310000)

    def test_restrict_rollout_root_and_runtime_flags(self):
        outside = self.root / 'secret.jsonl'
        outside.write_text('not a session', encoding='utf-8')
        self.assertEqual(self.signals.read(self.raw(path=str(outside)))['basis'], 'unknown')
        self.assertEqual(self.signals.read(self.raw(path='missing'))['basis'], 'unknown')
        signal = self.signals.read(self.raw(status={'type': 'active', 'activeFlags': ['waitingOnApproval']}))
        self.assertEqual(signal['label'], '等待核准或回答')

    def test_projection_pagination_dedup_rename_and_archive(self):
        self.write('task_complete')
        other = self.raw(id='chat-b', name='第二個 session')
        rpc = FakeRPC([{'data': [self.raw()], 'nextCursor': 'page2'}, {'data': [other], 'nextCursor': None}])
        self.board.rpc = rpc
        self.board.chats_list()
        state = self.board.state()
        self.assertEqual(len(state['tasks']), 2)
        self.assertTrue(all(t['readOnly'] for t in state['tasks']))
        self.assertEqual(self.board.store.all(), [])
        self.assertEqual(self.board.store.events(), [])
        imported = self.board.import_chat('chat-a')
        state = self.board.state()
        self.assertEqual(len(state['tasks']), 2)
        self.assertEqual(sum(bool(t.get('readOnly')) for t in state['tasks']), 1)
        rpc.pages = [{'data': [self.raw(name='新標題')], 'nextCursor': None}]
        self.board.chats_list()
        self.assertEqual(len(self.board.state()['tasks']), 1)
        self.assertEqual(self.board.chats['chat-a']['title'], '新標題')
        self.assertEqual(self.board.store.get(imported['id'])['title'], '原標題')

    def test_failure_keeps_snapshot_marks_stale_and_cannot_dispatch(self):
        self.write('task_started')
        self.board.rpc = FakeRPC([{'data': [self.raw()], 'nextCursor': None}])
        self.board.chats_list()
        with patch.object(self.board.rpc, 'call', side_effect=server.BoardError('offline')):
            with self.assertRaises(server.BoardError):
                self.board.chats_list()
        state = self.board.state()
        self.assertEqual(state['chatSync']['error'], 'offline')
        self.assertEqual(state['tasks'][0]['status'], 'backlog')
        self.assertIn('同步中斷', state['tasks'][0]['sessionStatus']['label'])
        with self.assertRaises(server.BoardError):
            self.board.start(state['tasks'][0]['id'])
        self.assertIsNone(self.board.tick())
        self.assertEqual(self.board.store.all(), [])
        self.assertFalse(self.board.chat_sync['syncing'])

    def test_state_does_not_wait_for_sync_and_concurrent_sync_is_coalesced(self):
        self.board.chat_sync_lock.acquire()
        try:
            self.assertEqual(self.board.chats_list()['chats'], [])
            self.assertEqual(self.board.state()['tasks'], [])
        finally:
            self.board.chat_sync_lock.release()


if __name__ == '__main__':
    unittest.main()
