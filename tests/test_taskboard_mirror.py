"""Claude App turn mirror: the taskboard-pane mod relays turn start／end, the board keeps one card per session.
Isolated database, no model calls, no real sessions; the board never dispatches during these tests."""
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'outputs/taskboard'))
import server

SESSION = 'a1b2c3d4-0000-4000-8000-000000000001'


class MirrorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'work')
        self.root = Path(self.temp.name)
        self.board = server.Board(self.root / 'board', None)
        self.board.store.set_setting('automatic', False)

    def tearDown(self):
        self.board.close()
        self.board.store.db.close()
        self.temp.cleanup()

    def mirror(self, **body):
        return self.board.mirror_turn({'tool': 'claude', 'sessionId': SESSION, **body})

    def test_first_prompt_creates_card_in_progress_and_replaces_the_sync_card(self):
        self.board.claude_chats = {SESSION: {'id': SESSION, 'tool': 'claude', 'title': SESSION, 'cwd': str(self.root), 'updatedAt': 1,
                                             'createdAt': 1, 'model': 'opus', 'desktopId': 'local_x', 'origin': 'desktop', 'project': '',
                                             'sessionStatus': {'status': 'in_progress', 'label': '近期有執行訊號', 'basis': 'transcript'}}}
        self.board.claude_sync['updatedAt'] = server.stamp()
        self.assertEqual([t['id'] for t in self.board.state()['tasks']], ['session:claude:' + SESSION])
        result = self.mirror(event='start', turnId='turn-1', text='幫我裝任務看板\n要能在 App 開啟', cwd=str(self.root), model='opus')
        self.assertTrue(result['mirrored'] and result['created'])
        task = result['task']
        self.assertEqual((task['status'], task['priority'], task['tool'], task['title'], task['description'], task['cwd'],
                          task['sourceId'], task['sourceTool'], task['workerThreadId'], task['turnId'], task['project']),
                         ('in_progress', 'high', 'claude', '幫我裝任務看板', '幫我裝任務看板\n要能在 App 開啟', str(self.root),
                          SESSION, 'claude', SESSION, 'turn-1', self.root.name))
        run = task['runs'][-1]
        self.assertEqual((run['kind'], run['status'], run['threadId'], run['turnId'], run['request'], run['model'], run['tool']),
                         ('mirror', 'running', SESSION, 'turn-1', '幫我裝任務看板\n要能在 App 開啟', 'opus', 'claude'))
        self.assertIn('由 Claude App 的對話自動建立', task['comments'][0]['text'])
        tasks = self.board.state()['tasks']
        self.assertEqual([t['id'] for t in tasks], [task['id']])  # the read-only sync card gives way to the mirrored card
        self.assertFalse(tasks[0].get('readOnly'))
        self.assertEqual(tasks[0]['sessionStatus']['status'], 'in_progress')
        self.assertIsNone(self.board.active_id)  # nothing was dispatched by the board

    def test_brief_is_seeded_from_the_first_prompt_drafted_once_and_never_rewritten_by_later_turns(self):
        started = self.mirror(event='start', turnId='turn-1', text='第一句需求')
        task = started['task']
        self.assertEqual((task['brief'], started['wantsBrief'], started['briefSource']), ('seed', True, '第一句需求'))
        self.assertEqual(self.mirror(event='brief', description='')['reason'], 'brief-empty')
        draft = '需求簡介\n做第一句。\n\n驗收條件\n- 可檢查'
        drafted = self.mirror(event='brief', description=draft)
        self.assertEqual((drafted['mirrored'], drafted['task']['brief'], drafted['task']['description']), (True, 'drafted', draft))
        self.mirror(event='complete', turnId='turn-1', answer='完成', reason='answer')
        later = self.mirror(event='start', turnId='turn-2', text='第二句修改')
        self.assertEqual((later['task']['description'], later['task']['title'], later['wantsBrief']), (draft, '第一句需求', False))
        self.assertEqual(later['task']['runs'][-1]['request'], '第二句修改')
        # a hand edit locks the brief: drafts are refused from then on, other edits keep the lock
        saved = self.board.update(later['task']['id'], {'version': later['task']['version'], 'description': '我自己寫的驗收條件'})
        self.assertEqual(saved['brief'], 'manual')
        refused = self.mirror(event='brief', description='再擬一次')
        self.assertEqual((refused['mirrored'], refused['reason'], refused['task']['description']), (False, 'brief-manual', '我自己寫的驗收條件'))
        same = self.board.update(saved['id'], {'version': saved['version'], 'priority': 'low'})
        self.assertEqual(same['brief'], 'manual')
        self.assertEqual(self.mirror(event='brief', description='x')['reason'], 'brief-manual')
        self.assertEqual(self.board.mirror_turn({'tool': 'claude', 'sessionId': 'ffffffff-0000-4000-8000-000000000009', 'event': 'brief',
                                                 'description': 'x'})['reason'], 'no-card')

    def test_a_card_created_on_a_later_turn_takes_its_brief_from_the_transcript_first_prompt(self):
        self.board.read_chat = lambda thread_id, tool='codex': {'turns': [
            {'id': 't0', 'items': [{'type': 'userMessage', 'content': [{'type': 'text', 'text': '最初的需求\n第二行'}]},
                                   {'type': 'agentMessage', 'text': '回覆'}]},
            {'id': 't1', 'items': [{'type': 'userMessage', 'content': [{'type': 'text', 'text': '繼續驗證'}]}]}]}
        task = self.mirror(event='start', turnId='turn-2', text='繼續驗證')['task']
        self.assertEqual((task['title'], task['description'], task['brief'], task['runs'][-1]['request']),
                         ('最初的需求', '最初的需求\n第二行', 'seed', '繼續驗證'))
        self.board.store.delete(task['id'])

        def no_transcript(thread_id, tool='codex'):
            raise server.BoardError('沒有 transcript')
        self.board.read_chat = no_transcript
        task = self.mirror(event='start', turnId='turn-3', text='沒有紀錄時用這句')['task']
        self.assertEqual((task['description'], task['brief']), ('沒有紀錄時用這句', 'seed'))

    def test_a_card_mirrored_before_briefs_existed_is_still_draftable_unless_edited(self):
        task = self.mirror(event='start', turnId='turn-1', text='舊碼建的卡')['task']
        del task['brief']
        self.board.store.put(task)
        # the first event after the upgrade (here the turn's end) re-seeds the brief from the transcript's first prompt
        self.board.read_chat = lambda thread_id, tool='codex': {'turns': [
            {'id': 't0', 'items': [{'type': 'userMessage', 'content': [{'type': 'text', 'text': '最初的需求'}]}]}]}
        self.mirror(event='complete', turnId='turn-1', answer='完成', reason='answer')
        again = self.mirror(event='start', turnId='turn-2', text='第二句')
        self.assertEqual((again['task']['brief'], again['wantsBrief'], again['briefSource'], again['task']['description']),
                         ('seed', True, '最初的需求', '最初的需求'))
        edited = self.board.store.get(again['task']['id'])
        edited['description'] = '手改過'
        del edited['brief']
        self.board.store.put(edited)
        self.mirror(event='complete', turnId='turn-2', answer='完成', reason='answer')
        third = self.mirror(event='start', turnId='turn-3', text='第三句')
        self.assertEqual(('brief' in third['task'], third['wantsBrief']), (False, False))
        self.assertEqual(self.mirror(event='brief', description='x')['reason'], 'brief-manual')

    def chat_titled(self, title):
        self.board.claude_chats = {SESSION: {'id': SESSION, 'tool': 'claude', 'title': title, 'cwd': '', 'updatedAt': 1, 'createdAt': 1,
                                             'model': '', 'desktopId': 'local_x', 'origin': 'desktop', 'project': ''}}

    def test_the_app_reminder_never_titles_a_card_and_the_title_follows_the_app_until_edited_on_the_board(self):
        reminder = '<system-reminder>\nYou are operating in a git worktree.\nWorktree path: D:\\x\\.claude\\worktrees\\calm-a1\n</system-reminder>\n'
        task = self.mirror(event='start', turnId='t1', text=reminder + '修好看板標題\n第二行')['task']
        self.assertEqual((task['title'], task['titleSource'], task['description'], task['runs'][-1]['request']),
                         ('修好看板標題', 'seed', '修好看板標題\n第二行', '修好看板標題\n第二行'))
        self.chat_titled(SESSION)  # the App has not named the session yet
        self.assertEqual(self.mirror(event='complete', turnId='t1', answer='好')['task']['title'], '修好看板標題')
        self.chat_titled('App 自動標題')  # named after the first turn
        task = self.mirror(event='start', turnId='t2', text='第二句')['task']
        self.assertEqual((task['title'], task['titleSource']), ('App 自動標題', 'app'))
        # a rename in the App reaches the card on the next session sync, without a new turn
        renamed = dict(self.board.claude_chats[SESSION], title='我在 App 改的名字')
        self.board.adapters['claude'].list_sessions = lambda: ([renamed], False)
        self.board.claude_list()
        live = self.board.store.get(task['id'])
        self.assertEqual((live['title'], live['titleSource']), ('我在 App 改的名字', 'app'))
        # a title edited on the board is the card's own from then on
        edited = self.board.update(live['id'], {'version': live['version'], 'title': '看板上的標題', 'status': 'in_progress'})
        self.assertEqual(edited['titleSource'], 'manual')
        self.board.adapters['claude'].list_sessions = lambda: ([dict(renamed, title='又改一次')], False)
        self.board.claude_list()
        self.assertEqual(self.board.store.get(task['id'])['title'], '看板上的標題')
        self.assertEqual(self.mirror(event='complete', turnId='t2', answer='好')['task']['title'], '看板上的標題')

    def test_a_card_titled_before_title_sources_existed_follows_the_app_only_while_untouched(self):
        self.board.read_chat = lambda thread_id, tool='codex': {'turns': [
            {'id': 't0', 'items': [{'type': 'userMessage', 'content': [{'type': 'text', 'text': '最初的需求'}]}]}]}
        for old_title, expected in (('<system-reminder>', 'App 標題'), ('最初的需求', 'App 標題'), ('自己取的名字', '自己取的名字')):
            task = self.mirror(event='start', turnId='t1', text='最初的需求')['task']
            self.mirror(event='complete', turnId='t1', answer='好')
            legacy = self.board.store.get(task['id'])
            legacy['title'] = old_title
            del legacy['titleSource']
            self.board.store.put(legacy)
            self.chat_titled('App 標題')
            again = self.mirror(event='start', turnId='t2', text='下一句')['task']
            self.assertEqual(again['title'], expected, old_title)
            self.board.claude_chats = {}
            self.board.store.delete(task['id'])

    def test_transcript_prompts_drop_only_the_apps_leading_reminder(self):
        import json
        from claude_sessions import ClaudeSessionIndex
        path = self.root / 'session.jsonl'
        records = [{'type': 'user', 'uuid': 'u1', 'message': {'content': [
                       {'type': 'text', 'text': '<system-reminder>\nThe user started this session without choosing a project folder.\n</system-reminder>'},
                       {'type': 'text', 'text': '真正的需求'}]}},
                   {'type': 'user', 'uuid': 'u2', 'message': {'content': '解釋 <system-reminder> 這個標記'}},
                   {'type': 'user', 'uuid': 'u3', 'message': {'content': '<system-reminder>\n只有提醒\n</system-reminder>'}}]
        path.write_text('\n'.join(json.dumps(r, ensure_ascii=False) for r in records) + '\n', encoding='utf-8')
        turns, _, _ = ClaudeSessionIndex._parse_tail(path, 0, 10)
        self.assertEqual([t['items'][0]['content'][0]['text'] for t in turns], ['真正的需求', '解釋 <system-reminder> 這個標記'])

    def test_a_service_restart_leaves_a_mirrored_turn_running(self):
        task = self.mirror(event='start', turnId='turn-1', text='還在 App 裡跑')['task']
        self.board.close()
        self.board.store.db.close()
        self.board = server.Board(self.root / 'board', None)  # the restart recovery runs here
        again = self.board.store.get(task['id'])
        self.assertEqual((again['status'], again['runs'][-1]['status'], again['error']), ('in_progress', 'running', ''))
        done = self.mirror(event='complete', turnId='turn-1', answer='完成', reason='answer')
        self.assertEqual((done['task']['status'], done['task']['runs'][-1]['status']), ('in_review', 'completed'))

    def test_turn_end_moves_the_card_to_review_and_later_prompts_reuse_it(self):
        task = self.mirror(event='start', turnId='turn-1', text='第一句')['task']
        done = self.mirror(event='complete', turnId='turn-1', answer='已完成第一句', reason='answer')
        self.assertFalse(done['created'])
        saved = done['task']
        self.assertEqual((saved['status'], saved['result'], saved['turnId'], saved['runs'][-1]['status'], saved['runs'][-1]['result']),
                         ('in_review', '已完成第一句', '', 'completed', '已完成第一句'))
        self.assertIn('請驗收成果', saved['comments'][-1]['text'])
        again = self.mirror(event='start', turnId='turn-2', text='第二句')
        self.assertEqual((again['created'], again['task']['id'], again['task']['status'], len(again['task']['runs'])),
                         (False, task['id'], 'in_progress', 2))
        self.assertEqual(again['task']['runs'][-1]['request'], '第二句')
        self.assertEqual(len(self.board.store.all()), 1)
        # a duplicate delivery of the same turn start adds nothing
        self.assertEqual(len(self.mirror(event='start', turnId='turn-2', text='第二句')['task']['runs']), 2)
        # a start whose end never arrived is closed as unknown before the next run
        third = self.mirror(event='start', turnId='turn-3', text='第三句')['task']
        self.assertEqual([r['status'] for r in third['runs']], ['completed', 'unknown', 'running'])

    def forked_chat(self, fork, title='同一段對話'):
        return {'id': fork, 'tool': 'claude', 'title': title, 'cwd': '', 'updatedAt': 2, 'createdAt': 1, 'model': '', 'desktopId': 'local_x',
                'origin': 'desktop', 'project': '', 'priorIds': [SESSION],
                'sessionStatus': {'status': 'in_review', 'label': '最近回合已結束', 'basis': 'transcript'}}

    def test_a_rewind_in_the_app_keeps_mirroring_onto_the_same_card(self):
        task = self.mirror(event='start', turnId='turn-1', text='第一句')['task']
        self.mirror(event='complete', turnId='turn-1', answer='好', reason='answer')
        fork = 'a1b2c3d4-0000-4000-8000-000000000002'
        self.board.claude_chats = {fork: self.forked_chat(fork)}
        again = self.board.mirror_turn({'tool': 'claude', 'sessionId': fork, 'event': 'start', 'turnId': 'turn-2', 'text': '倒回後重送'})
        self.assertFalse(again['created'])
        saved = again['task']
        # the App copied the conversation into the fork: the replaced session's runs are shown under it, not as a second session
        self.assertEqual((saved['id'], saved['sourceId'], saved['workerThreadId'], [r['threadId'] for r in saved['runs']], saved['priorSessionIds']),
                         (task['id'], fork, fork, [fork, fork], [SESSION]))
        self.assertTrue(any('倒回對話' in c['text'] for c in saved['comments']))
        self.assertEqual(len(self.board.store.all()), 1)
        # the replaced id still reaches the card
        self.assertIn(('claude', SESSION), server.task_session_keys(self.board.store.get(task['id'])))
        self.board.claude_sync['updatedAt'] = server.stamp()
        self.assertEqual([t['id'] for t in self.board.state()['tasks']], [task['id']])  # no read-only card for the fork

    def test_the_session_sync_moves_a_card_to_its_forked_session_before_the_next_turn(self):
        task = self.mirror(event='start', turnId='turn-1', text='第一句')['task']
        self.mirror(event='complete', turnId='turn-1', answer='好', reason='answer')
        fork = 'a1b2c3d4-0000-4000-8000-000000000002'
        self.board.adapters['claude'].list_sessions = lambda: ([self.forked_chat(fork, 'App 標題')], False)
        self.board.claude_list()
        saved = self.board.store.get(task['id'])
        self.assertEqual((saved['sourceId'], saved['title'], [r['threadId'] for r in saved['runs']]), (fork, 'App 標題', [fork]))
        tasks = self.board.state()['tasks']
        self.assertEqual([t['id'] for t in tasks], [task['id']])
        self.assertEqual(tasks[0]['sessionStatus']['status'], 'in_review')
        self.board.claude_list()  # already followed: nothing new is written
        self.assertEqual(self.board.store.get(task['id'])['version'], saved['version'])

    def test_a_card_already_on_the_fork_folds_the_replaced_sessions_runs(self):
        task = self.mirror(event='start', turnId='turn-1', text='第一句')['task']
        self.mirror(event='complete', turnId='turn-1', answer='好', reason='answer')
        fork = 'a1b2c3d4-0000-4000-8000-000000000002'
        stored = self.board.store.get(task['id'])
        stored['sourceId'] = fork  # merged by hand before runs were folded
        self.board.store.put(stored)
        self.board.adapters['claude'].list_sessions = lambda: ([self.forked_chat(fork)], False)
        self.board.claude_list()
        saved = self.board.store.get(task['id'])
        self.assertEqual(([r['threadId'] for r in saved['runs']], saved['workerThreadId'], saved['priorSessionIds']), ([fork], fork, [SESSION]))

    def test_a_fork_already_on_its_own_card_is_not_moved_onto_the_older_card(self):
        old = self.mirror(event='start', turnId='turn-1', text='第一句')['task']
        fork = 'a1b2c3d4-0000-4000-8000-000000000002'
        own = self.board.mirror_turn({'tool': 'claude', 'sessionId': fork, 'event': 'start', 'turnId': 'turn-2', 'text': '另一張'})['task']
        self.board.adapters['claude'].list_sessions = lambda: ([self.forked_chat(fork)], False)
        self.board.claude_list()
        self.assertEqual(self.board.store.get(old['id'])['sourceId'], SESSION)
        self.assertEqual(self.board.store.get(own['id'])['sourceId'], fork)

    def test_done_card_reopens_and_aborted_or_failed_turns_are_recorded(self):
        task = self.mirror(event='start', turnId='t1', text='需求')['task']
        self.mirror(event='complete', turnId='t1', answer='完成', reason='answer')
        live = self.board.store.get(task['id'])
        self.assertEqual(self.board.update(task['id'], {'version': live['version'], 'status': 'done'})['status'], 'done')
        reopened = self.mirror(event='start', turnId='t2', text='再改一下')['task']
        self.assertEqual(reopened['status'], 'in_progress')
        self.assertIn('重新回到進行中', reopened['comments'][-1]['text'])
        aborted = self.mirror(event='complete', turnId='t2', answer='', reason='aborted', aborted=True)['task']
        self.assertEqual((aborted['status'], aborted['runs'][-1]['status']), ('backlog', 'interrupted'))
        self.mirror(event='start', turnId='t3', text='再試')
        failed = self.mirror(event='complete', turnId='t3', answer='', reason='error', error='API 逾時')['task']
        self.assertEqual((failed['status'], failed['runs'][-1]['status'], failed['error']), ('in_review', 'failed', 'API 逾時'))
        self.mirror(event='start', turnId='t4', text='再試一次')
        refused = self.mirror(event='complete', turnId='t4', answer='', reason='refusal')['task']
        self.assertEqual((refused['runs'][-1]['status'], refused['error']), ('failed', '模型拒絕回答。'))

    def test_a_mirrored_turn_blocks_board_actions_until_it_ends(self):
        task = self.mirror(event='start', turnId='t1', text='需求')['task']
        with self.assertRaises(server.BoardError):
            self.board.update(task['id'], {'version': task['version'], 'status': 'todo'})
        with self.assertRaises(server.BoardError):
            self.board.start(task['id'])
        with self.assertRaises(server.BoardError):
            self.board.followup(task['id'], {'version': task['version'], 'text': '後續', 'threadId': ''})
        renamed = self.board.update(task['id'], {'version': task['version'], 'title': '改標題', 'status': 'in_progress'})
        self.assertEqual((renamed['title'], renamed['status']), ('改標題', 'in_progress'))  # other fields stay editable
        self.board.store.set_setting('automatic', True)
        self.assertIsNone(self.board.tick())  # the scheduler never picks a mirrored card
        self.assertIsNone(self.board.active_id)

    def test_a_queued_followup_requeues_when_the_mirrored_turn_ends(self):
        task = self.mirror(event='start', turnId='t1', text='需求')['task']
        self.mirror(event='complete', turnId='t1', answer='完成')
        live = self.board.store.get(task['id'])
        live['nextRun'] = {'threadId': SESSION, 'text': '看板接手的後續需求', 'cwd': '', 'kind': 'followup', 'tool': 'claude', 'model': '', 'effort': '', 'fromTool': ''}
        live['status'] = 'todo'
        self.board.store.put(live)
        self.assertEqual(self.mirror(event='start', turnId='t2', text='App 裡又說了一句')['task']['status'], 'in_progress')
        ended = self.mirror(event='complete', turnId='t2', answer='好了')['task']
        self.assertEqual((ended['status'], ended['nextRun']['text']), ('todo', '看板接手的後續需求'))

    def test_a_session_the_board_dispatched_is_left_to_its_adapter(self):
        card = self.board.create({'title': '看板派工', 'description': '需求', 'tool': 'claude'})
        card['runs'].append({'id': 'r1', 'kind': 'initial', 'threadId': '', 'turnId': '', 'cwd': '', 'tool': 'claude', 'model': '',
                             'effort': '', 'request': '需求', 'result': '', 'error': '', 'status': 'running', 'startedAt': 1})
        card['status'] = 'in_progress'
        self.board.store.put(card)
        self.board.active_id = card['id']
        self.assertEqual(self.mirror(event='start', turnId='t1', text='需求')['reason'], 'board-run')  # unbound while the CLI starts
        card = self.board.store.get(card['id'])
        card['runs'][-1]['threadId'] = card['workerThreadId'] = SESSION
        self.board.store.put(card)
        self.assertEqual(self.mirror(event='complete', turnId='t1', answer='x')['reason'], 'board-run')
        other = self.board.mirror_turn({'tool': 'claude', 'sessionId': 'b' * 12, 'event': 'start', 'turnId': 'u1', 'text': 'App 另一個對話'})
        self.assertTrue(other['created'])  # a different session typed in the App is still mirrored
        self.assertEqual(len(self.board.store.all()), 2)

    def test_app_turns_leave_a_mirrored_card_alone_while_the_board_runs_a_session_on_it(self):
        self.mirror(event='start', turnId='t1', text='鏡像的第一句')
        card = self.mirror(event='complete', turnId='t1', answer='好')['task']
        # A follow-up sent from the card in a new session: the board's run is now active on this mirrored card.
        card['runs'].append({'id': 'r2', 'kind': 'new_session', 'threadId': 'c' * 12, 'turnId': '', 'cwd': '', 'tool': 'claude',
                             'model': '', 'effort': '', 'request': '幫我 commit', 'result': '', 'error': '', 'status': 'running', 'startedAt': 2})
        card.update(status='in_progress', workerThreadId='c' * 12)
        self.board.store.put(card)
        self.board.active_id = card['id']
        self.assertEqual(self.mirror(event='start', turnId='t2', text='App 裡的下一句')['reason'], 'board-run')
        self.assertEqual(self.mirror(event='complete', turnId='t2', answer='x')['reason'], 'board-run')
        card = self.board.store.get(card['id'])
        self.assertEqual(([r['kind'] for r in card['runs']], card['workerThreadId']), (['mirror', 'new_session'], 'c' * 12))
        self.board.active_id = None  # once the board's run ends, the App's turns are mirrored again
        self.assertTrue(self.mirror(event='start', turnId='t3', text='再下一句')['mirrored'])

    def test_a_board_turn_end_arriving_after_its_run_finished_adds_no_mirrored_run(self):
        card = self.board.create({'title': '看板派工', 'description': '需求', 'tool': 'claude'})
        card['runs'].append({'id': 'r1', 'kind': 'followup', 'threadId': SESSION, 'turnId': '', 'cwd': '', 'tool': 'claude', 'model': '',
                             'effort': '', 'request': '後續', 'result': '', 'error': 'OAuth 過期', 'status': 'failed',
                             'startedAt': 1, 'finishedAt': 2})
        card.update(status='backlog', workerThreadId=SESSION)
        self.board.store.put(card)
        late = self.mirror(event='complete', turnId='t1', answer='', reason='error')
        self.assertEqual(late['reason'], 'board-run')
        card = self.board.store.get(card['id'])
        self.assertEqual(([r['kind'] for r in card['runs']], card['status']), (['followup'], 'backlog'))
        resumed = self.mirror(event='start', turnId='t2', text='在終端機 claude --resume 接著做')['task']  # a real resume is still mirrored
        self.assertEqual([r['kind'] for r in resumed['runs']], ['followup', 'mirror'])

    def test_bad_input_and_orphan_turn_ends_create_nothing(self):
        self.assertEqual(self.mirror(event='complete', turnId='t0', answer='孤立回合')['reason'], 'no-card')
        self.assertEqual(self.mirror(event='start', turnId='t0', text='   ')['reason'], 'no-card')
        with self.assertRaises(server.BoardError):
            self.mirror(event='pause', turnId='t0', text='x')
        with self.assertRaises(server.BoardError):
            self.board.mirror_turn({'tool': 'claude', 'sessionId': '../x', 'event': 'start', 'turnId': 't', 'text': 'x'})
        with self.assertRaises(server.BoardError):
            self.mirror(event='start', turnId='t0', text='x', tool='bash')
        self.assertEqual(self.board.store.all(), [])


if __name__ == '__main__':
    unittest.main()
