"""Plan import, directed dependencies, auto-release and per-card effort. Fake Codex RPC + simulated Claude CLI; no model calls."""
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'outputs/taskboard'))
sys.path.insert(0, str(ROOT / 'tests'))
import server
from claude_sessions import ClaudeSessionIndex
from test_taskboard_runs import FakeRPC

FAKE_CLI = [sys.executable, '-X', 'utf8', str(ROOT / 'tests' / 'fake_claude_cli.py')]


class PlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'work')
        self.root = Path(self.temp.name)
        self.log = self.root / 'claude-args.log'
        os.environ['FAKE_CLAUDE_LOG'] = str(self.log)
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
            except OSError:  # PermissionError／NotADirectoryError while a finished child still holds the folder
                time.sleep(0.3)

    def plan(self, **extra):
        body = {'name': '深色模式', 'project': '網站', 'cwd': str(self.root), 'tool': 'claude', 'items': [
            {'key': 'tokens', 'title': 'A 定義色彩 token', 'role': 'developer'},
            {'key': 'css', 'title': 'B 套用深色樣式', 'role': 'developer-deep', 'dependsOn': ['tokens']},
            {'key': 'review', 'title': 'C 安全與一致性審查', 'role': 'architect', 'dependsOn': ['css'], 'priority': 'high'},
            {'key': 'docs', 'title': 'D 更新文件', 'tool': 'codex', 'role': 'fast-worker', 'dependsOn': ['tokens']},
        ]}
        body.update(extra)
        return self.board.import_plan(body)

    def get(self, task_id):
        return self.board.store.get(task_id)

    def launches(self):
        entries = [json.loads(line) for line in self.log.read_text(encoding='utf-8').splitlines()] if self.log.exists() else []
        return [e for e in entries if '--permission-prompt-tool' in e['args']]  # real dispatches only, not the catalogue probe

    def wait(self, task_id, predicate=None, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            task = self.get(task_id)
            done = predicate(task) if predicate else (task['status'] != 'in_progress' and self.board.active_id is None)
            if done:
                return task
            time.sleep(0.05)
        raise AssertionError('timed out')

    def finish_done(self, task_id):
        task = self.get(task_id)
        return self.board.update(task_id, {'version': task['version'], 'status': 'done'})

    def test_plan_creates_backlog_cards_with_role_routing_and_dependencies(self):
        result = self.plan()
        self.assertEqual(result['order'], ['tokens', 'css', 'docs', 'review'])
        by_key = {t['plan']['key']: t for t in result['tasks']}
        self.assertTrue(all(t['status'] == 'backlog' for t in result['tasks']))
        self.assertEqual((by_key['tokens']['tool'], by_key['tokens']['model'], by_key['tokens']['effort']), ('claude', 'sonnet', 'medium'))
        self.assertEqual((by_key['css']['model'], by_key['css']['effort']), ('sonnet', 'high'))
        self.assertEqual((by_key['review']['model'], by_key['review']['effort'], by_key['review']['priority']), ('opus', 'high', 'high'))
        self.assertEqual((by_key['docs']['tool'], by_key['docs']['model'], by_key['docs']['effort']), ('codex', '', ''))
        self.assertEqual(by_key['css']['dependsOn'], [by_key['tokens']['id']])
        self.assertEqual(sorted(by_key['tokens']['blocks']), sorted([by_key['css']['id'], by_key['docs']['id']]))
        self.assertIn('深色模式', by_key['tokens']['labels'])
        self.assertIn('developer', by_key['tokens']['labels'])
        self.assertEqual(by_key['css']['plan']['name'], '深色模式')
        self.assertLess(by_key['tokens']['createdAt'], by_key['review']['createdAt'])
        self.assertEqual(self.rpc.calls, [])
        self.assertEqual(self.launches(), [])

    def test_plan_rejects_cycles_unknown_keys_and_bad_roles(self):
        for items, message in ((
                [{'key': 'a', 'title': 'A', 'dependsOn': ['b']}, {'key': 'b', 'title': 'B', 'dependsOn': ['a']}], '循環'),
                ([{'key': 'a', 'title': 'A', 'dependsOn': ['zzz']}], '不存在'),
                ([{'key': 'a', 'title': 'A', 'role': 'wizard'}], '角色'),
                ([{'key': 'a', 'title': 'A'}, {'key': 'a', 'title': 'B'}], '重複'),
                ([{'key': 'a', 'title': ''}], '標題')):
            with self.assertRaises(server.BoardError) as caught:
                self.board.import_plan({'name': '壞計畫', 'items': items})
            self.assertIn(message, str(caught.exception))
        self.assertEqual(self.board.store.all(), [])

    def test_blocked_cards_wait_until_blockers_are_done_then_auto_release(self):
        result = self.plan()
        by_key = {t['plan']['key']: t for t in result['tasks']}
        css = by_key['css']
        with self.assertRaises(server.BoardError) as caught:
            self.board.start(css['id'])
        self.assertIn('前置卡片尚未完成', str(caught.exception))
        # A blocked card moved to todo by hand is still skipped by the scheduler.
        self.board.update(css['id'], {'version': self.get(css['id'])['version'], 'status': 'todo'})
        self.board.store.set_setting('automatic', True)
        self.assertIsNone(self.board.tick())
        self.board.store.set_setting('automatic', False)
        # Finishing the blocker through review → done releases dependents that are still in the backlog.
        tokens = by_key['tokens']
        self.board.update(tokens['id'], {'version': self.get(tokens['id'])['version'], 'status': 'in_review'})
        self.assertEqual(self.get(by_key['docs']['id'])['status'], 'backlog')
        saved = self.finish_done(tokens['id'])
        self.assertEqual(set(saved['released']), {by_key['docs']['id']})
        self.assertEqual(self.get(by_key['docs']['id'])['status'], 'todo')
        self.assertEqual(self.get(css['id'])['status'], 'todo')
        self.assertIn('自動排入待辦', self.get(by_key['docs']['id'])['comments'][-1]['text'])
        # review depends on css which is not done: it stays in the backlog even after tokens is done.
        self.assertEqual(self.get(by_key['review']['id'])['status'], 'backlog')
        self.assertEqual(self.board.blockers(self.get(css['id'])), [])
        self.board.store.set_setting('automatic', True)
        started = self.board.tick()
        self.assertIsNotNone(started)
        self.assertEqual(started['plan']['key'], 'css')  # created earlier than docs, same priority, and now unblocked
        self.wait(started['id'])
        self.assertIn('resumed=false model=sonnet', self.get(started['id'])['runs'][-1]['result'])
        args = self.launches()[-1]['args']
        self.assertEqual(args[args.index('--effort') + 1], 'high')
        self.assertEqual(args[args.index('--model') + 1], 'sonnet')

    def test_person_can_override_unfinished_blockers_but_the_scheduler_never_does(self):
        result = self.plan()
        by_key = {t['plan']['key']: t for t in result['tasks']}
        tokens, css = by_key['tokens'], by_key['css']
        # A is reviewed but intentionally not accepted yet (still being polished); B must be runnable by hand.
        self.board.update(tokens['id'], {'version': self.get(tokens['id'])['version'], 'status': 'in_review'})
        self.board.update(css['id'], {'version': self.get(css['id'])['version'], 'status': 'todo'})
        self.board.store.set_setting('automatic', True)
        self.assertIsNone(self.board.tick())  # automatic dispatch keeps respecting the dependency
        with self.assertRaises(server.BoardError):
            self.board.start(css['id'])
        self.board.start(css['id'], force=True)
        started = self.wait(css['id'])
        self.assertEqual(started['runs'][-1]['status'], 'completed')
        override = [c for c in started['comments'] if c.get('kind') == 'override']
        self.assertEqual(len(override), 1)
        self.assertIn('A 定義色彩 token（待審核）', override[0]['text'])
        # Accepting A later releases only cards still waiting in the backlog; B is untouched.
        self.finish_done(tokens['id'])
        self.assertEqual(self.get(css['id'])['status'], 'in_review')
        self.assertEqual(self.get(by_key['docs']['id'])['status'], 'todo')

    def test_dependency_validation_and_delete_cleanup(self):
        a = self.board.create({'title': 'A'})
        b = self.board.create({'title': 'B', 'dependsOn': [a['id']]})
        with self.assertRaises(server.BoardError):
            self.board.update(a['id'], {'version': self.get(a['id'])['version'], 'dependsOn': [b['id']]})  # cycle
        with self.assertRaises(server.BoardError):
            self.board.update(a['id'], {'version': self.get(a['id'])['version'], 'dependsOn': [a['id']]})  # self
        with self.assertRaises(server.BoardError):
            self.board.create({'title': 'C', 'dependsOn': ['missing']})
        with self.assertRaises(server.BoardError):
            self.board.update(b['id'], {'version': b['version'], 'effort': 'turbo'})
        self.assertEqual(self.get(a['id'])['blocks'], [b['id']])
        # Changing b's dependencies bumps a's version so an open draft of a cannot overwrite silently.
        version_before = self.get(a['id'])['version']
        self.board.update(b['id'], {'version': self.get(b['id'])['version'], 'dependsOn': []})
        self.assertGreater(self.get(a['id'])['version'], version_before)
        self.assertEqual(self.get(a['id'])['blocks'], [])
        self.board.update(b['id'], {'version': self.get(b['id'])['version'], 'dependsOn': [a['id']]})
        self.board.store.delete(a['id'])
        self.assertEqual(self.get(b['id'])['dependsOn'], [])
        self.assertEqual(self.board.blockers(self.get(b['id'])), [])

    def test_effort_is_validated_against_the_model_catalogue(self):
        task = self.board.create({'title': '強度測試', 'tool': 'claude', 'model': 'fake-opus', 'effort': 'medium', 'cwd': str(self.root)})
        self.board.start(task['id'])
        failed = self.wait(task['id'])
        self.assertEqual(failed['status'], 'in_review')
        self.assertIn('不支援推理強度 medium', failed['error'])
        self.assertEqual(self.launches(), [])
        self.board.update(task['id'], {'version': failed['version'], 'effort': 'low'})
        self.board.start(task['id'])
        done = self.wait(task['id'])
        self.assertEqual(done['runs'][-1]['status'], 'completed')
        self.assertEqual(done['runs'][-1]['effort'], 'low')
        args = self.launches()[-1]['args']
        self.assertEqual(args[args.index('--effort') + 1], 'low')

    def test_legacy_cards_have_no_dependencies_and_export_schema(self):
        task = self.board.create({'title': '舊卡'})
        body = json.loads(self.board.store.db.execute('SELECT body FROM tasks WHERE id=?', (task['id'],)).fetchone()[0])
        body.pop('effort'); body.pop('plan')
        self.board.store.db.execute('UPDATE tasks SET body=? WHERE id=?', (json.dumps(body), task['id']))
        self.board.store.db.commit()
        loaded = self.get(task['id'])
        self.assertEqual((loaded['effort'], loaded['plan'], loaded['dependsOn'], loaded['blocks']), ('', None, [], []))
        self.assertEqual(server.EXPORT_SCHEMA, 5)
        self.assertEqual(self.board.state()['version'], '1.7.0')


if __name__ == '__main__':
    unittest.main()
