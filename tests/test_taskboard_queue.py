"""Scheduler order (priority, then time entered the todo queue) and follow-ups that start right away. Isolated; no model calls."""
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'outputs/taskboard'))
sys.path.insert(0, str(ROOT / 'tests'))
import server
from claude_sessions import ClaudeSessionIndex
from test_taskboard_runs import FakeRPC

FAKE_CLI = [sys.executable, '-X', 'utf8', str(ROOT / 'tests' / 'fake_claude_cli.py')]


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'work')
        self.root = Path(self.temp.name)
        os.environ['FAKE_CLAUDE_LOG'] = str(self.root / 'claude-args.log')
        self.board = server.Board(self.root / 'board', None, FAKE_CLI)
        self.claude = self.board.adapters['claude']
        self.claude.sessions = ClaudeSessionIndex(self.root / 'desktop', self.root / 'projects')
        self.rpc = FakeRPC()
        self.board.rpc = self.rpc
        self.board.store.set_setting('automatic', False)

    def tearDown(self):
        self.board.close()
        deadline = time.time() + 15
        while self.claude.process and time.time() < deadline:
            time.sleep(0.05)
        self.board.store.db.close()
        os.environ.pop('FAKE_CLAUDE_LOG', None)
        for attempt in range(10):
            try:
                self.temp.cleanup()
                break
            except OSError:
                time.sleep(0.3)

    def get(self, task_id):
        return self.board.store.get(task_id)

    def to_todo(self, task_id):
        task = self.get(task_id)
        return self.board.update(task_id, {'version': task['version'], 'status': 'todo'})

    def wait(self, task_id, predicate=None, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            task = self.get(task_id)
            done = predicate(task) if predicate else (task['status'] != 'in_progress' and self.board.active_id is None)
            if done:
                return task
            time.sleep(0.05)
        raise AssertionError('timed out')

    def test_scheduler_picks_by_priority_then_by_time_entered_the_queue(self):
        # Created in one order, queued in another: the queue time, not the creation time, decides among equals.
        first_created = self.board.create({'title': '先建立', 'priority': 'medium'})
        later_created = self.board.create({'title': '後建立', 'priority': 'medium'})
        urgent = self.board.create({'title': '緊急但最晚排隊', 'priority': 'urgent'})
        self.to_todo(later_created['id'])
        time.sleep(0.01)
        self.to_todo(first_created['id'])
        time.sleep(0.01)
        self.to_todo(urgent['id'])
        self.assertGreater(self.get(first_created['id'])['queuedAt'], self.get(later_created['id'])['queuedAt'])
        self.board.store.set_setting('automatic', True)
        picked = []
        for _ in range(3):
            with patch.object(server.threading, 'Thread'):
                started = self.board.tick()
            picked.append(started['title'])
            self.board._launch(started['id'])
            task = self.get(started['id'])
            self.board.on_event({'method': 'turn/completed', 'params': {'threadId': task['workerThreadId'], 'turn': {'id': task['turnId'], 'status': 'completed'}}})
        self.assertEqual(picked, ['緊急但最晚排隊', '後建立', '先建立'])
        # Leaving and re-entering the queue moves the card to the back.
        again = self.get(later_created['id'])
        self.board.update(again['id'], {'version': again['version'], 'status': 'todo'})
        self.to_todo(first_created['id'])
        self.assertGreater(self.get(first_created['id'])['queuedAt'], self.get(later_created['id'])['queuedAt'])

    def test_older_cards_without_queuedat_fall_back_to_creation_time(self):
        old = self.board.create({'title': '舊卡', 'status': 'todo'})
        self.assertGreater(old['queuedAt'], 0)
        task = self.get(old['id'])
        task['queuedAt'] = 0
        self.board.store.put(task)
        self.assertEqual(server.queue_order(self.get(old['id'])), (-1, self.get(old['id'])['createdAt']))

    def test_followup_can_start_immediately_or_queue(self):
        task = self.board.create({'title': '二次修改', 'description': '第一次', 'tool': 'claude', 'cwd': str(self.root)})
        self.board.start(task['id'])
        first = self.wait(task['id'])
        self.assertEqual(first['status'], 'in_review')
        # Queue only: stays in todo for the scheduler (automatic is off here).
        queued = self.board.followup(task['id'], {'version': first['version'], 'text': '先排隊', 'threadId': first['workerThreadId']})
        self.assertEqual(queued['status'], 'todo')
        self.assertGreater(queued['queuedAt'], 0)
        self.board.cancel_followup(task['id'], {'version': queued['version']})
        # Start now: dispatched at once, same session, no scheduler involved.
        current = self.get(task['id'])
        started = self.board.followup(task['id'], {'version': current['version'], 'text': '馬上修', 'threadId': first['workerThreadId'], 'startNow': True})
        self.assertEqual(started['status'], 'in_progress')
        self.assertNotIn('startError', started)
        done = self.wait(task['id'])
        self.assertEqual(done['runs'][-1]['kind'], 'followup')
        self.assertEqual(done['runs'][-1]['threadId'], first['workerThreadId'])
        self.assertIn('resumed=true', done['runs'][-1]['result'])
        # Start now while another card runs: queued with an explanation instead of failing.
        other = self.board.create({'title': '占用', 'tool': 'claude', 'description': 'HANG', 'cwd': str(self.root)})
        self.board.start(other['id'])
        self.wait(other['id'], lambda t: bool(t['turnId']) and not self.board.launching)
        current = self.get(task['id'])
        blocked = self.board.followup(task['id'], {'version': current['version'], 'text': '想馬上跑但被占用', 'threadId': first['workerThreadId'], 'startNow': True})
        self.assertEqual(blocked['status'], 'todo')
        self.assertIn('已有任務執行中', blocked['startError'])
        self.assertIsNotNone(self.get(task['id'])['nextRun'])
        self.board.stop(other['id'])
        self.wait(other['id'])


if __name__ == '__main__':
    unittest.main()
