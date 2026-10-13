"""Multi-tool dispatch: fake Codex RPC + simulated Claude CLI. Isolated DB, no model calls, no real sessions."""
from http.client import HTTPConnection
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'outputs/taskboard'))
sys.path.insert(0, str(ROOT / 'tests'))
import server
from claude_sessions import ClaudeSessionIndex, encode_project
from test_taskboard_runs import FakeRPC

FAKE_CLI = [sys.executable, '-X', 'utf8', str(ROOT / 'tests' / 'fake_claude_cli.py')]


class ToolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'work')
        self.root = Path(self.temp.name)
        self.log = self.root / 'claude-args.log'
        os.environ['FAKE_CLAUDE_LOG'] = str(self.log)
        self.index = ClaudeSessionIndex(self.root / 'desktop', self.root / 'projects')
        self.board = server.Board(self.root / 'board', None, FAKE_CLI)
        self.claude = self.board.adapters['claude']
        self.claude.sessions = self.index
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
                time.sleep(0.3)  # a finished child may still hold the folder for a moment on Windows

    def create(self, **body):
        return self.board.create({'title': '工具測試', 'description': '完成需求', 'cwd': str(self.root), **body})

    def wait(self, task_id, predicate=None, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            task = self.board.store.get(task_id)
            done = predicate(task) if predicate else (task['status'] != 'in_progress' and self.board.active_id is None)
            if done:
                return task
            time.sleep(0.05)
        raise AssertionError(f'timed out waiting for {task_id}: {self.board.store.get(task_id)["status"]}')

    def run_claude(self, task_id):
        self.board.start(task_id)
        return self.wait(task_id)

    def launches(self):
        """Real dispatches only; the model-catalogue handshake (--permission-mode plan, no prompt) is excluded."""
        entries = [json.loads(line) for line in self.log.read_text(encoding='utf-8').splitlines()] if self.log.exists() else []
        return [entry for entry in entries if '--permission-prompt-tool' in entry['args']]

    def codex_turn(self, task_id, text='Codex 回報'):
        self.board.start(task_id)
        task = self.wait(task_id, lambda t: bool(t['turnId']))
        self.board.on_event({'method': 'item/completed', 'params': {'threadId': task['workerThreadId'], 'turnId': task['turnId'],
                             'item': {'type': 'agentMessage', 'phase': 'final_answer', 'text': text}}})
        self.board.on_event({'method': 'turn/completed', 'params': {'threadId': task['workerThreadId'], 'turn': {'id': task['turnId'], 'status': 'completed'}}})
        return self.board.store.get(task_id)

    def test_tool_catalogue_selection_and_validation(self):
        models = self.board.models('claude')
        self.assertIn('fake-opus', {m['model'] for m in models})
        self.assertTrue(any(m['isDefault'] for m in models))
        self.assertEqual(self.board.models('codex')[0]['model'], 'fixture-model')
        task = self.create(tool='claude', model='fake-opus')
        self.assertEqual((task['tool'], task['model']), ('claude', 'fake-opus'))
        with self.assertRaises(server.BoardError):
            self.board.update(task['id'], {'version': task['version'], 'tool': 'gemini'})
        state = self.board.state()
        self.assertEqual(state['version'], '1.9.0')
        self.assertTrue(state['tools']['claude']['available'])
        self.assertTrue(state['tools']['codex']['available'])
        self.assertFalse(state['tools']['claude']['embed'])
        self.assertEqual(self.launches(), [])

    def test_claude_run_records_tool_model_session_and_result(self):
        task = self.create(tool='claude', model='fake-opus')
        task = self.run_claude(task['id'])
        run = task['runs'][-1]
        self.assertEqual(task['status'], 'in_review')
        self.assertEqual((run['tool'], run['model'], run['status']), ('claude', 'fake-opus', 'completed'))
        self.assertEqual(len(run['threadId']), 36)
        self.assertEqual(task['workerThreadId'], run['threadId'])
        self.assertIn('resumed=false model=fake-opus', run['result'])
        self.assertEqual(run['resolvedModel'], 'claude-fake-5')
        self.assertEqual(run['costUsd'], 0.01)
        self.assertEqual(task['turnId'], '')
        launch = self.launches()[-1]
        args = launch['args']
        self.assertEqual(Path(launch['cwd']).resolve(), Path(run['cwd']).resolve())
        self.assertEqual(args[args.index('--session-id') + 1], run['threadId'])
        self.assertEqual(args[args.index('--model') + 1], 'fake-opus')
        self.assertEqual(args[args.index('--permission-mode') + 1], 'acceptEdits')
        self.assertIn('--permission-prompt-tool', args)
        self.assertNotIn('--resume', args)
        self.assertIn('Claude Code 開始執行任務', [e['message'] for e in self.board.store.events()])
        self.assertEqual(self.rpc.threads, 0)

    def test_unavailable_model_keeps_choice_and_reports(self):
        task = self.create(tool='claude', model='retired-model')
        task = self.run_claude(task['id'])
        self.assertEqual(task['status'], 'in_review')
        self.assertIn('模型目前不可用', task['error'])
        self.assertEqual(task['model'], 'retired-model')
        self.assertEqual(self.launches(), [])

    def test_followup_resumes_same_claude_session_and_keeps_reports(self):
        task = self.create(tool='claude')
        first = self.run_claude(task['id'])
        session = first['workerThreadId']
        snapshot = dict(first['runs'][0])
        queued = self.board.followup(task['id'], {'version': first['version'], 'text': '再修正一次', 'threadId': session})
        self.assertEqual((queued['nextRun']['tool'], queued['nextRun']['kind'], queued['nextRun']['threadId']), ('claude', 'followup', session))
        with self.assertRaises(server.BoardError):
            self.board.update(task['id'], {'version': queued['version'], 'tool': 'codex'})
        second = self.run_claude(task['id'])
        self.assertEqual(second['runs'][0], snapshot)
        self.assertEqual(second['runs'][1]['threadId'], session)
        self.assertIn('resumed=true', second['runs'][1]['result'])
        args = self.launches()[-1]['args']
        self.assertEqual(args[args.index('--resume') + 1], session)
        self.assertNotIn('--session-id', args)
        self.assertEqual(server.task_session_keys(second), {('claude', session)})

    def test_cross_tool_handoff_opens_new_session_and_keeps_sources(self):
        task = self.create(tool='codex', model='fixture-model')
        codex_done = self.codex_turn(task['id'])
        self.assertEqual(codex_done['workerThreadId'], 'chat-1')
        with self.assertRaises(server.BoardError):
            self.board.followup(task['id'], {'version': codex_done['version'], 'text': '換工具延續', 'threadId': 'chat-1', 'tool': 'claude'})
        queued = self.board.followup(task['id'], {'version': codex_done['version'], 'text': '請 Claude 接手修正', 'threadId': '', 'tool': 'claude', 'model': 'fake-opus'})
        self.assertEqual((queued['nextRun']['kind'], queued['nextRun']['fromTool'], queued['tool'], queued['model']), ('handoff', 'codex', 'claude', 'fake-opus'))
        handed = self.run_claude(task['id'])
        run = handed['runs'][-1]
        self.assertEqual((run['tool'], run['kind'], run['fromTool']), ('claude', 'handoff', 'codex'))
        self.assertNotEqual(run['threadId'], 'chat-1')
        self.assertEqual(handed['runs'][0]['threadId'], 'chat-1')
        self.assertEqual(handed['runs'][0]['result'], 'Codex 回報')
        prompt = self.board.prompt(handed)
        self.assertIn('接手說明', prompt)
        self.assertIn('Codex', prompt)
        self.assertIn('Codex 回報', prompt)
        self.assertEqual(server.task_session_keys(handed), {('codex', 'chat-1'), ('claude', run['threadId'])})
        self.assertNotIn('--resume', self.launches()[-1]['args'])
        back = self.board.followup(task['id'], {'version': handed['version'], 'text': '回到 Codex 對話', 'threadId': 'chat-1'})
        self.assertEqual((back['nextRun']['tool'], back['nextRun']['kind'], back['tool']), ('codex', 'followup', 'codex'))
        self.board.start(task['id'])
        started = self.wait(task['id'], lambda t: bool(t['turnId']))
        self.assertEqual(started['workerThreadId'], 'chat-1')
        self.assertEqual(self.rpc.calls[-2][0], 'thread/resume')

    def test_legacy_cards_read_as_codex_without_rewrite(self):
        task = self.create()
        body = {k: v for k, v in task.items() if k not in ('tool', 'sourceTool', 'relatedIds')}
        body['workerThreadId'] = 'old-thread'
        body['sourceId'] = 'old-source'
        body.pop('runs')
        stored = json.dumps(body)
        self.board.store.db.execute('UPDATE tasks SET body=? WHERE id=?', (stored, task['id']))
        self.board.store.db.commit()
        loaded = self.board.store.get(task['id'])
        self.assertEqual((loaded['tool'], loaded['sourceTool']), ('codex', 'codex'))
        self.assertEqual(server.task_session_keys(loaded), {('codex', 'old-thread'), ('codex', 'old-source')})
        self.board.state()
        self.assertEqual(self.board.store.db.execute('SELECT body FROM tasks WHERE id=?', (task['id'],)).fetchone()[0], stored)

    def test_same_session_id_under_two_tools_stays_isolated(self):
        chat = {'id': 'shared-id', 'title': '同名對話', 'cwd': str(self.root), 'createdAt': 1, 'updatedAt': 2,
                'sessionStatus': {'status': 'in_review', 'label': '已結束'}}
        self.board.chats = {'shared-id': dict(chat, tool='codex')}
        self.board.claude_chats = {'shared-id': dict(chat, tool='claude', title='Claude 同名對話')}
        self.board.chat_sync['updatedAt'] = self.board.claude_sync['updatedAt'] = server.stamp()
        cards = [t for t in self.board.state()['tasks'] if t.get('readOnly')]
        self.assertEqual(sorted(c['id'] for c in cards), ['session:claude:shared-id', 'session:shared-id'])
        self.assertEqual({c['tool'] for c in cards}, {'codex', 'claude'})
        imported = self.board.import_chat('shared-id', 'claude')
        self.assertEqual((imported['tool'], imported['sourceTool'], imported['sourceId']), ('claude', 'claude', 'shared-id'))
        cards = [t for t in self.board.state()['tasks'] if t.get('readOnly')]
        self.assertEqual([c['id'] for c in cards], ['session:shared-id'])
        other = self.board.import_chat('shared-id', 'codex')
        self.assertNotEqual(other['id'], imported['id'])
        self.assertEqual(self.board.import_chat('shared-id', 'claude')['id'], imported['id'])
        self.assertEqual([t for t in self.board.state()['tasks'] if t.get('readOnly')], [])
        with self.assertRaises(server.BoardError):
            self.board.followup(imported['id'], {'version': self.board.store.get(imported['id'])['version'], 'text': '延續', 'threadId': 'shared-id', 'tool': 'codex'})

    def test_rate_limit_crash_stop_and_restart(self):
        limited = self.run_claude(self.create(tool='claude', description='RATE_LIMIT')['id'])
        self.assertEqual(limited['status'], 'todo')
        self.assertGreater(limited['retryAt'], server.stamp())
        self.assertEqual(limited['runs'][-1]['status'], 'failed')
        self.assertEqual(limited['runs'][-1]['request'], 'RATE_LIMIT')
        crashed = self.run_claude(self.create(tool='claude', description='CRASH')['id'])
        self.assertEqual(crashed['status'], 'in_review')
        self.assertIn('沒有回報結果', crashed['error'])
        self.assertIn('not logged in', crashed['error'])
        self.assertEqual(crashed['runs'][-1]['status'], 'failed')
        hanging = self.create(tool='claude', description='HANG')
        self.board.start(hanging['id'])
        self.wait(hanging['id'], lambda t: bool(t['turnId']) and self.claude.process is not None and not self.board.launching)
        with self.assertRaises(server.BoardError):
            self.board.start(self.create(tool='codex')['id'])
        self.board.stop(hanging['id'])
        stopped = self.wait(hanging['id'])
        self.assertEqual((stopped['status'], stopped['runs'][-1]['status']), ('backlog', 'interrupted'))
        self.assertIn('停止', stopped['error'])
        self.board.start(hanging['id'])
        self.wait(hanging['id'], lambda t: bool(t['turnId']) and not self.board.launching)
        retried = self.board.store.get(hanging['id'])
        self.assertEqual((retried['runs'][-1]['kind'], retried['runs'][-1]['request'], retried['runs'][-1]['tool']), ('initial', 'HANG', 'claude'))
        self.assertEqual(retried['runs'][-1]['threadId'], stopped['runs'][-1]['threadId'])  # same session resumes
        # A service restart while the run is still in progress must not pretend the run completed.
        restarted_store = server.Store(self.root / 'board')
        restarted = restarted_store.get(hanging['id'])
        restarted_store.db.close()
        self.assertEqual((restarted['status'], restarted['runs'][-1]['status']), ('in_review', 'interrupted'))
        self.assertIn('重新啟動', restarted['error'])
        self.claude.process.terminate()
        deadline = time.time() + 15
        while self.claude.process and time.time() < deadline:
            time.sleep(0.05)

    def test_permission_requests_wait_for_board_answer(self):
        task = self.create(tool='claude', description='APPROVE 需要執行指令')
        self.board.start(task['id'])
        deadline = time.time() + 30
        while time.time() < deadline and not any(r.get('tool') == 'claude' for r in self.board.requests.values()):
            time.sleep(0.05)
        request = next(r for r in self.board.requests.values() if r.get('tool') == 'claude')
        self.assertEqual((request['method'], request['params']['toolName'], request['params']['input']), ('claude/can_use_tool', 'Bash', {'command': 'git status'}))
        self.assertEqual(self.board.state()['approvals'][0]['tool'], 'claude')
        self.assertEqual(self.board.store.get(task['id'])['status'], 'in_progress')
        with self.assertRaises(server.BoardError):
            self.board.answer(request['id'], {'decision': 'maybe'})
        # Answered the way the pages do: the "claude:<id>" key is percent-encoded in the URL path.
        http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        http.token, http.board = 'fixture-token', self.board
        threading.Thread(target=http.serve_forever, daemon=True).start()
        try:
            conn = HTTPConnection('127.0.0.1', http.server_port, timeout=5)
            conn.request('POST', '/api/approvals/' + quote(request['id'], safe=''), body=json.dumps({'decision': 'accept'}),
                         headers={'X-Board-Token': 'fixture-token', 'Content-Type': 'application/json'})
            response = conn.getresponse()
            self.assertEqual((response.status, json.loads(response.read())), (200, {'ok': True}))
            conn.close()
        finally:
            http.shutdown()
            http.server_close()
        allowed = self.wait(task['id'])
        self.assertEqual(allowed['runs'][-1]['status'], 'completed')
        self.assertEqual(self.board.requests, {})
        denied_task = self.create(tool='claude', description='APPROVE 第二次')
        self.board.start(denied_task['id'])
        while time.time() < deadline and not self.board.requests:
            time.sleep(0.05)
        self.board.answer(next(iter(self.board.requests)), {'decision': 'decline'})
        denied = self.wait(denied_task['id'])
        self.assertEqual(denied['runs'][-1]['permissionDenials'], 1)
        self.assertIn('指令被拒絕', denied['runs'][-1]['result'])
        self.assertIn('未獲授權', denied['comments'][-1]['text'])
        with self.assertRaises(server.BoardError):
            self.board.answer('claude:perm-1', {'decision': 'accept'})

    def test_single_scheduler_shared_across_tools(self):
        codex = self.create(tool='codex')
        claude = self.create(tool='claude', status='todo')
        self.board.start(codex['id'])
        self.wait(codex['id'], lambda t: bool(t['turnId']))
        with self.assertRaises(server.BoardError):
            self.board.start(claude['id'])
        self.board.store.set_setting('automatic', True)
        self.assertIsNone(self.board.tick())
        task = self.board.store.get(codex['id'])
        self.board.on_event({'method': 'turn/completed', 'params': {'threadId': task['workerThreadId'], 'turn': {'id': task['turnId'], 'status': 'completed'}}})
        self.assertEqual(self.board.store.get(codex['id'])['status'], 'in_review')
        self.assertEqual(self.board.tick()['id'], claude['id'])
        finished = self.wait(claude['id'])
        self.assertEqual(finished['runs'][-1]['tool'], 'claude')

    def test_unavailable_tool_blocks_queue_start_and_scheduler(self):
        self.claude.command = None
        self.assertFalse(self.board.state()['tools']['claude']['available'])
        task = self.create(tool='claude', status='todo')
        with self.assertRaises(server.BoardError):
            self.board.start(task['id'])
        self.assertEqual(self.board.store.get(task['id'])['status'], 'todo')
        other = self.create(tool='codex')
        with self.assertRaises(server.BoardError):
            self.board.followup(other['id'], {'version': other['version'], 'text': '改用 Claude', 'threadId': '', 'tool': 'claude'})
        self.board.store.set_setting('automatic', True)
        self.assertIsNone(self.board.tick())
        self.assertIsNone(self.board.active_id)
        with self.assertRaises(server.BoardError):
            self.board.models('claude')

    def test_cancel_queued_followup_restores_editing(self):
        task = self.create(tool='claude')
        done = self.run_claude(task['id'])
        queued = self.board.followup(task['id'], {'version': done['version'], 'text': '排隊後取消', 'threadId': done['workerThreadId']})
        cancelled = self.board.cancel_followup(task['id'], {'version': queued['version']})
        self.assertIsNone(cancelled['nextRun'])
        self.assertEqual(cancelled['status'], 'backlog')
        self.board.update(task['id'], {'version': cancelled['version'], 'tool': 'codex', 'model': ''})
        self.assertEqual(self.board.store.get(task['id'])['tool'], 'codex')

    def test_failed_run_clears_after_successful_followup_or_acceptance(self):
        # A fixed follow-up run replaces the stale failure; accepting the card (done) also drops it so the
        # review event does not replay the old error. Run history keeps the original failure.
        failed = self.run_claude(self.create(tool='claude', description='CRASH')['id'])
        self.assertEqual(failed['status'], 'in_review')
        self.assertIn('not logged in', failed['error'])
        edited = self.board.update(failed['id'], {'version': failed['version'], 'description': '修正後的需求'})
        self.board.followup(failed['id'], {'version': edited['version'], 'text': '重新登入後再跑一次', 'threadId': failed['workerThreadId']})
        fixed = self.run_claude(failed['id'])
        self.assertEqual((fixed['status'], fixed['error']), ('in_review', ''))
        self.assertEqual([r['status'] for r in fixed['runs']], ['failed', 'completed'])
        self.assertIn('not logged in', fixed['runs'][0]['error'])
        latest = self.board.store.events()[0]
        self.assertEqual((latest['status'], latest['message'], latest['error']), ('in_review', '執行已結束，等待人工驗收', False))
        stale = self.run_claude(self.create(tool='claude', description='CRASH')['id'])
        accepted = self.board.update(stale['id'], {'version': stale['version'], 'status': 'done'})
        self.assertEqual((accepted['status'], accepted['error'], accepted['retryAt']), ('done', '', 0))
        self.assertIn('not logged in', accepted['runs'][-1]['error'])
        latest = self.board.store.events()[0]
        self.assertEqual((latest['taskId'], latest['status'], latest['message'], latest['error']), (stale['id'], 'done', '使用者已驗收，任務完成', False))

    def test_claude_session_index_reads_desktop_metadata_and_transcript(self):
        cwd = str(self.root / 'proj')
        session = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
        meta_dir = self.root / 'desktop' / 'org' / 'user'
        meta_dir.mkdir(parents=True)
        (meta_dir / 'local_desk-1.json').write_text(json.dumps({'sessionId': 'desk-1', 'cliSessionId': session, 'cwd': cwd, 'title': 'App 對話',
            'lastActivityAt': 1791597660000, 'createdAt': 1791597000000, 'model': 'claude-opus-5-5', 'isArchived': False,
            'postTurnSummary': {'status_category': 'blocked'}}), encoding='utf-8')
        (meta_dir / 'local_desk-2.json').write_text(json.dumps({'cliSessionId': 'ffffffff-0000-0000-0000-000000000000', 'cwd': cwd, 'title': '已封存', 'isArchived': True}), encoding='utf-8')
        transcript = self.root / 'projects' / encode_project(cwd) / f'{session}.jsonl'
        transcript.parent.mkdir(parents=True)
        records = [{'type': 'user', 'uuid': 'u1', 'timestamp': '2026-10-10T02:00:00Z', 'message': {'role': 'user', 'content': [{'type': 'text', 'text': '原始需求'}]}},
                   {'type': 'assistant', 'timestamp': '2026-10-10T02:00:10Z', 'message': {'role': 'assistant', 'stop_reason': 'tool_use', 'content': [{'type': 'text', 'text': '先看檔案'}, {'type': 'tool_use', 'name': 'Read'}]}},
                   {'type': 'user', 'isMeta': False, 'timestamp': '2026-10-10T02:00:11Z', 'message': {'role': 'user', 'content': [{'type': 'tool_result', 'content': 'x'}]}},
                   {'type': 'assistant', 'timestamp': '2026-10-10T02:00:20Z', 'message': {'role': 'assistant', 'stop_reason': 'end_turn', 'content': [{'type': 'text', 'text': '完成回報'}]}}]
        transcript.write_text('\n'.join(json.dumps(r) for r in records) + '\n', encoding='utf-8')
        rows = self.index.list(now=1791597660)
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]['id'], rows[0]['title'], rows[0]['desktopId'], rows[0]['model']), (session, 'App 對話', 'local_desk-1', 'claude-opus-5-5'))
        self.assertEqual(rows[0]['sessionStatus']['status'], 'in_review')
        self.assertIn('需要你回覆', rows[0]['sessionStatus']['label'])
        self.board.claude_list()
        cards = [t for t in self.board.state()['tasks'] if t.get('readOnly')]
        self.assertEqual(cards[0]['id'], f'session:claude:{session}')
        chat = self.board.read_chat(session, 'claude')
        self.assertEqual(chat['resumeCommand'], f'claude --resume {session}')
        self.assertEqual(len(chat['turns']), 1)
        items = chat['turns'][0]['items']
        self.assertEqual(items[0]['content'][0]['text'], '原始需求')
        self.assertEqual([i['phase'] for i in items if i['type'] == 'agentMessage'], ['commentary', 'final_answer'])
        self.assertEqual(chat['turns'][0]['status'], 'completed')
        outside = self.root / 'outside.jsonl'
        outside.write_text('{}', encoding='utf-8')
        self.assertIsNone(self.index.transcript_path('../outside'))
        transcript.write_text(transcript.read_text(encoding='utf-8') + json.dumps({'type': 'user', 'timestamp': '2026-10-10T02:05:00Z', 'message': {'role': 'user', 'content': [{'type': 'text', 'text': '再來'}]}}) + '\n', encoding='utf-8')
        self.assertEqual(self.index.list(now=1791597960)[0]['sessionStatus']['status'], 'in_progress')
        self.assertEqual(self.index.list(now=1791598960)[0]['sessionStatus']['status'], 'backlog')
        self.assertEqual(self.board.store.all(), [])


if __name__ == '__main__':
    unittest.main()
