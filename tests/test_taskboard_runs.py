"""Isolated lifecycle checks: RPC is fake; no model turns or real task data."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'outputs/taskboard'))
import server


class FakeRPC:
    ready, error = True, ''

    def __init__(self):
        self.calls = []
        self.threads = self.turns = 0
        self.available_models = [{'model': 'fixture-model', 'displayName': '隔離測試模型'}]

    def connect(self):
        pass

    def close(self):
        pass

    def call(self, method, params):
        self.calls.append((method, params))
        if method == 'model/list':
            return {'data': self.available_models}
        if method == 'thread/start':
            self.threads += 1
            return {'thread': {'id': f'chat-{self.threads}'}}
        if method == 'turn/start':
            self.turns += 1
            return {'turn': {'id': f'turn-{self.turns}'}}
        return {}


class RunTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'work')
        self.board = server.Board(Path(self.temp.name) / 'board', None)
        self.rpc = FakeRPC()
        self.board.rpc = self.rpc
        self.task = self.board.create({'title': '測試任務', 'description': '原始驗收條件'})

    def tearDown(self):
        self.board.close()
        self.board.store.db.close()
        self.temp.cleanup()

    def get(self):
        return self.board.store.get(self.task['id'])

    def start(self):
        # Drive the real launch synchronously, without starting a background worker.
        with patch.object(server.threading, 'Thread') as thread:
            self.board.start(self.task['id'])
            thread.return_value.start.assert_called_once()
        self.board._launch(self.task['id'])
        return self.get()

    def finish(self, text='第一次回報', status='completed', error=None):
        task = self.get()
        self.board.on_event({'method': 'item/completed', 'params': {'threadId': task['workerThreadId'],
            'turnId': task['turnId'], 'item': {'type': 'agentMessage', 'phase': 'final_answer', 'text': text}}})
        self.board.on_event({'method': 'turn/completed', 'params': {'threadId': task['workerThreadId'],
            'turn': {'id': task['turnId'], 'status': status, 'error': error}}})
        return self.get()

    def followup(self, text='修正未達標的部分', thread_id=''):
        return self.board.followup(self.task['id'], {'version': self.get()['version'], 'text': text, 'threadId': thread_id})

    def test_save_queue_and_execution_boundaries(self):
        self.assertEqual(self.rpc.calls, [])
        queued = self.followup()
        self.assertEqual(queued['status'], 'todo')
        self.assertEqual(queued['runs'], [])
        self.assertEqual(self.rpc.calls, [])
        started = self.start()
        self.assertEqual(started['runs'][0]['threadId'], 'chat-1')
        self.assertTrue(Path(started['cwd']).is_dir())

    def test_model_used_for_new_and_resumed_turns(self):
        self.board.update(self.task['id'], {'version': self.get()['version'], 'model': 'fixture-model'})
        self.assertEqual(self.rpc.calls, [])
        self.start()
        self.assertEqual(self.get()['runs'][-1]['model'], 'fixture-model')
        for method, params in self.rpc.calls:
            if method in ('thread/start', 'turn/start'):
                self.assertEqual(params['model'], 'fixture-model')
        first = self.finish()
        self.followup(thread_id=first['workerThreadId'])
        self.start()
        self.assertEqual(self.rpc.calls[-2][1]['model'], 'fixture-model')
        self.assertEqual(self.rpc.calls[-1][1]['model'], 'fixture-model')
        self.assertEqual(sum(method == 'model/list' for method, _ in self.rpc.calls), 1)
        launches = [(method, params) for method, params in self.rpc.calls
                    if method in ('thread/start', 'thread/resume', 'turn/start')]
        self.assertEqual([method for method, _ in launches],
                         ['thread/start', 'turn/start', 'thread/resume', 'turn/start'])
        for method, params in launches:
            self.assertEqual(params['approvalsReviewer'], 'auto_review', method)
            self.assertEqual(params['approvalPolicy'], 'on-request', method)
            if method == 'turn/start':
                self.assertEqual(params['sandboxPolicy']['type'], 'workspaceWrite')
                self.assertFalse(params['sandboxPolicy']['networkAccess'])
            else:
                self.assertEqual(params['sandbox'], 'workspace-write')

    def test_unavailable_model_does_not_silently_dispatch(self):
        self.board.update(self.task['id'], {'version': self.get()['version'], 'model': 'missing-model'})
        task = self.start()
        self.assertEqual(task['status'], 'in_review')
        self.assertIn('模型目前不可用', task['error'])
        self.assertFalse(any(method in ('thread/start', 'thread/resume', 'turn/start') for method, _ in self.rpc.calls))

    def test_tags_and_symmetric_relations_persist_unlink_and_delete(self):
        other = self.board.create({'title': '相關卡片'})
        body = {'version': self.get()['version'], 'labels': ['介面', '修復', '介面'], 'relatedIds': [other['id']]}
        saved = self.board.update(self.task['id'], body)
        self.assertEqual(saved['labels'], ['介面', '修復'])
        self.assertEqual(self.board.store.get(other['id'])['relatedIds'], [self.task['id']])
        with self.assertRaises(server.BoardError):
            self.board.update(other['id'], {'version': other['version'], 'relatedIds': []})
        current = self.board.store.get(other['id'])
        self.board.update(other['id'], {'version': current['version'], 'relatedIds': []})
        self.assertEqual(self.get()['relatedIds'], [])
        self.board.update(self.task['id'], {'version': self.get()['version'], 'relatedIds': [other['id']]})
        self.board.store.delete(other['id'])
        self.assertEqual(self.get()['relatedIds'], [])
        self.assertEqual(self.rpc.calls, [])

    def test_invalid_properties_are_rejected_without_partial_writes(self):
        original = self.get()
        for body in ({'labels': 'wrong'}, {'labels': ['a'] * 21}, {'labels': [42]},
                     {'relatedIds': [original['id']]}, {'relatedIds': ['absent']}, {'model': 42}):
            with self.assertRaises(server.BoardError):
                self.board.update(original['id'], {'version': original['version'], **body})
            self.assertEqual(self.get(), original)

    def test_followup_reuses_session_and_preserves_all_reports(self):
        self.start()
        first = self.finish()
        snapshot = copy.deepcopy(first['runs'][0])
        self.followup(thread_id=first['workerThreadId'])
        self.start()
        final = self.finish('修正完成')
        self.assertEqual(final['runs'][0], snapshot)
        self.assertEqual(final['runs'][1]['result'], '修正完成')
        self.assertEqual(self.rpc.threads, 1)
        self.assertEqual(self.rpc.calls[-2][0], 'thread/resume')
        self.assertIn('修正未達標的部分', self.rpc.calls[-1][1]['input'][0]['text'])
        self.assertIn('第一次回報', self.rpc.calls[-1][1]['input'][0]['text'])

    def test_new_session_dedup_import_and_return_to_older_session(self):
        self.start()
        self.finish()
        self.followup('換一個對話继续完成')
        self.start()
        self.finish('第二個對話回報')
        self.assertEqual(server.task_thread_ids(self.get()), {'chat-1', 'chat-2'})
        self.board.chats = {key: {'id': key, 'title': key, 'cwd': self.get()['cwd'],
            'createdAt': 1, 'updatedAt': 1, 'sessionStatus': {'status': 'in_review', 'label': '已結束'}} for key in ('chat-1', 'chat-2')}
        self.assertEqual(len(self.board.state()['tasks']), 1)
        self.assertEqual(self.board.import_chat('chat-1')['id'], self.task['id'])
        self.followup('回到第一個對話修正', 'chat-1')
        self.start()
        self.assertEqual(self.get()['workerThreadId'], 'chat-1')
        self.assertEqual(self.rpc.threads, 2)

    def test_validation_optimistic_version_and_active_guards(self):
        for body in ({'text': ''}, {'text': '補充', 'threadId': 'unrelated'}, {'text': '補充', 'version': -1}):
            with self.assertRaises(server.BoardError):
                self.board.followup(self.task['id'], {'version': self.get()['version'], **body})
        self.followup()
        with self.assertRaises(server.BoardError):
            self.followup()
        self.start()
        with self.assertRaises(server.BoardError):
            self.followup()

    def test_failed_followup_retry_keeps_request_and_ignores_stale_turn(self):
        self.start()
        first = self.finish()
        self.followup('這次修正', first['workerThreadId'])
        self.start()
        second = self.finish('', 'failed', {'message': 'rate limit'})
        self.assertEqual(second['status'], 'todo')
        self.start()
        task = self.get()
        self.assertEqual(task['runs'][-1]['request'], '這次修正')
        self.board.on_event({'method': 'turn/started', 'params': {'threadId': task['workerThreadId'], 'turn': {'id': 'turn-1'}}})
        self.board.on_event({'method': 'turn/completed', 'params': {'threadId': task['workerThreadId'], 'turn': {'id': 'turn-1', 'status': 'completed'}}})
        self.assertEqual(self.get()['turnId'], task['turnId'])
        self.assertEqual(self.get()['status'], 'in_progress')

    def test_disconnect_restart_and_legacy_read_preserve_reports(self):
        self.start()
        self.board.on_event({'method': '_disconnected'})
        self.assertEqual(self.get()['runs'][-1]['status'], 'interrupted')
        self.start()
        self.board.store.db.close()
        self.board.store = server.Store(Path(self.temp.name) / 'board')
        self.assertEqual(self.get()['runs'][-1]['status'], 'interrupted')
        old = self.get()
        old.pop('runs'); old.pop('nextRun')
        old['result'] = '舊版最新回報'
        self.board.store.db.execute('UPDATE tasks SET body=? WHERE id=?', (json.dumps(old), old['id']))
        self.board.store.db.commit()
        body = self.board.store.db.execute('SELECT body FROM tasks WHERE id=?', (old['id'],)).fetchone()[0]
        self.assertEqual(self.get()['runs'][0]['result'], '舊版最新回報')
        self.board.state()
        self.assertEqual(self.board.store.db.execute('SELECT body FROM tasks WHERE id=?', (old['id'],)).fetchone()[0], body)

    def test_source_session_only_continues_after_explicit_followup(self):
        self.board.chats = {'source': {'id': 'source', 'title': '來源聊天', 'cwd': self.temp.name,
            'sessionStatus': {'status': 'in_review', 'label': '已結束'}}}
        self.task = self.board.import_chat('source')
        self.followup('針對來源補充修正', 'source')
        self.start()
        self.assertEqual(self.get()['workerThreadId'], 'source')
        self.assertEqual(self.rpc.threads, 0)
        self.finish('', 'failed', {'message': 'usage limit'})
        task = self.get()
        task['retryAt'] = 0
        self.board.store.put(task)
        with patch.object(server.threading, 'Thread'):
            self.board.tick()
        self.assertEqual(self.get()['runs'][-1]['request'], '針對來源補充修正')
        self.board._launch(self.task['id'])
        self.finish()
        self.board.chats['source']['sessionStatus']['status'] = 'in_progress'
        with self.assertRaises(server.BoardError):
            self.followup('再修正', 'source')


if __name__ == '__main__':
    unittest.main()
