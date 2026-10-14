"""Claude App sidebar groups relayed by the mod become the project of Claude session cards. Isolated DB, no model calls."""
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'outputs/taskboard'))
sys.path.insert(0, str(ROOT / 'tests'))
import server
from test_taskboard_runs import FakeRPC


class GroupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'work')
        self.root = Path(self.temp.name)
        self.board = server.Board(self.root / 'board', None, None)
        self.board.rpc = FakeRPC()
        self.board.store.set_setting('automatic', False)

    def tearDown(self):
        self.board.close()
        self.board.store.db.close()
        self.temp.cleanup()

    def chat(self, session_id, desktop_id, cwd):
        return {'id': session_id, 'tool': 'claude', 'title': '對話 ' + session_id, 'cwd': cwd, 'createdAt': 1, 'updatedAt': 2,
                'model': '', 'desktopId': desktop_id, 'sessionStatus': {'status': 'in_review', 'label': '已結束'}}

    def test_groups_become_projects_and_survive_resync_and_restart(self):
        cwd = str(self.root)
        self.board.claude_chats = {'s1': self.chat('s1', 'local_a', cwd), 's2': self.chat('s2', 'local_b', cwd)}
        self.board.claude_sync['updatedAt'] = server.stamp()
        cards = {t['sourceId']: t for t in self.board.state()['tasks'] if t.get('readOnly')}
        self.assertEqual(cards['s1']['project'], '未分組')  # a Claude session card is never named after its folder
        result = self.board.set_claude_groups({'sessions': [
            {'sessionId': 'local_a', 'group': {'id': 'cg-1', 'name': '交易工具'}},
            {'sessionId': 'local_zzz', 'group': {'id': 'cg-2', 'name': '不存在的 session'}},
            {'sessionId': 'local_b', 'group': None}, 'garbage']})
        self.assertEqual((result['groups'], result['sessions']), (2, 2))
        cards = {t['sourceId']: t for t in self.board.state()['tasks'] if t.get('readOnly')}
        self.assertEqual(cards['s1']['project'], '交易工具')
        self.assertEqual(cards['s2']['project'], '未分組')
        self.assertGreater(self.board.state()['claudeGroupsAt'], 0)
        # A later read-only sync re-applies the stored mapping.
        self.board.adapters['claude'].list_sessions = lambda: ([self.chat('s1', 'local_a', cwd)], False)
        self.board.claude_list()
        self.assertEqual(self.board.claude_chats['s1']['project'], '交易工具')
        # Importing the chat as a dispatch card keeps the App group as the project.
        imported = self.board.import_chat('s1', 'claude')
        self.assertEqual(imported['project'], '交易工具')
        self.board.claude_chats['s2'] = self.chat('s2', 'local_b', cwd)
        self.assertEqual(self.board.import_chat('s2', 'claude')['project'], '未分組')
        # The mapping is persisted in settings, so a restarted service keeps it.
        self.board.store.db.close()
        self.board.store = server.Store(self.root / 'board')
        self.assertEqual(self.board.claude_groups(), {'local_a': '交易工具', 'local_zzz': '不存在的 session'})

    def test_invalid_payloads_are_rejected(self):
        with self.assertRaises(server.BoardError):
            self.board.set_claude_groups({'sessions': 'nope'})
        with self.assertRaises(server.BoardError):
            self.board.set_claude_groups({'sessions': [{}] * 2001})
        self.assertEqual(self.board.claude_groups(), {})


if __name__ == '__main__':
    unittest.main()
