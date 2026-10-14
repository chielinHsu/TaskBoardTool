"""Brief and follow-up attachments: upload, card references, prompts and native image input. Isolated DB, no model calls."""
import base64
from http.client import HTTPConnection
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'outputs/taskboard'))
sys.path.insert(0, str(ROOT / 'tests'))
import server
import attachments
from test_taskboard_runs import FakeRPC

FAKE_CLI = [sys.executable, '-X', 'utf8', str(ROOT / 'tests' / 'fake_claude_cli.py')]
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==')


def upload(board, name, raw, mime=''):
    return board.attachments.save({'name': name, 'mime': mime, 'data': base64.b64encode(raw).decode('ascii')})


class AttachmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'work')
        self.root = Path(self.temp.name)
        self.log = self.root / 'claude-args.log'
        self.inputs = self.root / 'claude-input.log'
        os.environ['FAKE_CLAUDE_LOG'] = str(self.log)
        os.environ['FAKE_CLAUDE_INPUT_LOG'] = str(self.inputs)
        self.board = server.Board(self.root / 'board', None, FAKE_CLI)
        self.claude = self.board.adapters['claude']
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
        os.environ.pop('FAKE_CLAUDE_INPUT_LOG', None)
        for attempt in range(10):
            try:
                self.temp.cleanup()
                break
            except OSError:
                time.sleep(0.3)

    def wait(self, task_id, timeout=30):
        deadline = time.time() + timeout
        while time.time() < deadline:
            task = self.board.store.get(task_id)
            if task['status'] != 'in_progress' and self.board.active_id is None:
                return task
            time.sleep(0.05)
        raise AssertionError(f'timed out waiting for {task_id}')

    def test_store_validates_names_sizes_and_ids(self):
        store = self.board.attachments
        meta = upload(self.board, '..\\..\\secret:name?.png', PNG)
        self.assertEqual(meta['name'], 'secret_name_.png')
        self.assertEqual((meta['mime'], meta['size']), ('image/png', len(PNG)))  # guessed from the extension
        self.assertEqual(store.path(meta).parent.parent, store.root)
        self.assertEqual(base64.b64decode(store.read(meta['id'])['data']), PNG)
        self.assertEqual(upload(self.board, 'CON.txt', b'x')['name'], '_CON.txt')
        for bad in ({'name': 'a.txt', 'data': '***'}, {'name': 'a.txt', 'data': ''}):
            with self.assertRaises(server.BoardError):
                store.save(bad)
        with self.assertRaises(server.BoardError) as big:
            upload(self.board, 'big.bin', b'0' * (attachments.MAX_BYTES + 1))
        self.assertEqual(big.exception.status, 413)
        for bad_id in ('../meta', 'ABC', '0' * 16):
            with self.assertRaises(server.BoardError):
                store.meta(bad_id)
        with self.assertRaises(server.BoardError):
            store.resolve(['x'] * (attachments.MAX_PER_ITEM + 1))

    def test_brief_attachments_reach_codex_prompt_and_image_input(self):
        image, notes = upload(self.board, '畫面.png', PNG), upload(self.board, '規格.txt', '驗收規格'.encode())
        task = self.board.create({'title': '附件任務', 'description': '照圖修改', 'cwd': str(self.root),
                                  'attachments': [image['id'], notes['id'], image['id']]})
        self.assertEqual([a['id'] for a in task['attachments']], [image['id'], notes['id']])
        self.assertNotIn('path', task['attachments'][0])  # cards keep metadata; paths are resolved at dispatch
        self.board.start(task['id'])
        deadline = time.time() + 10
        while not any(method == 'turn/start' for method, _ in self.rpc.calls) and time.time() < deadline:
            time.sleep(0.05)
        params = next(params for method, params in self.rpc.calls if method == 'turn/start')
        prompt = params['input'][0]['text']
        self.assertIn('需求附件（請直接讀取）', prompt)
        self.assertIn(str(self.board.attachments.path(notes)), prompt)
        self.assertEqual(params['input'][1:], [{'type': 'localImage', 'path': str(self.board.attachments.path(image))}])

    def test_followup_attachments_are_queued_recorded_and_sent_once(self):
        brief_image = upload(self.board, 'brief.png', PNG)
        task = self.board.create({'title': 'Claude 附件', 'description': '第一次', 'cwd': str(self.root), 'tool': 'claude',
                                  'attachments': [brief_image['id']]})
        self.board.start(task['id'])
        first = self.wait(task['id'])
        self.assertEqual(first['runs'][-1]['status'], 'completed', first['error'])
        args = json.loads(self.log.read_text(encoding='utf-8').splitlines()[-1])['args']
        self.assertEqual(args[-2:], ['--add-dir', str(self.board.attachments.root)])  # variadic option stays last
        followup_image, log_file = upload(self.board, 'after.png', PNG), upload(self.board, 'error.log', b'Traceback')
        queued = self.board.followup(task['id'], {'version': first['version'], 'threadId': first['workerThreadId'],
                                                  'text': '依截圖再修', 'attachments': [followup_image['id'], log_file['id']]})
        self.assertEqual([a['name'] for a in queued['nextRun']['attachments']], ['after.png', 'error.log'])
        self.assertEqual(queued['comments'][-1]['attachments'], queued['nextRun']['attachments'])
        self.board.start(task['id'])
        done = self.wait(task['id'])
        self.assertEqual([a['id'] for a in done['runs'][-1]['attachments']], [followup_image['id'], log_file['id']])
        prompt = self.board.prompt(done)
        self.assertIn('本次後續需求的附件（請直接讀取）', prompt)
        self.assertIn(str(self.board.attachments.path(log_file)), prompt)
        self.assertIn(str(self.board.attachments.path(brief_image)), prompt)  # the brief's files stay named
        # First run: brief image. Continued session: only the follow-up's image, not the brief's again.
        self.assertEqual([json.loads(line) for line in self.inputs.read_text(encoding='utf-8').splitlines()],
                         [['text', 'image'], ['text', 'image']])
        self.assertEqual([i['id'] for i in self.board.run_images(done)], [followup_image['id']])
        with self.assertRaises(server.BoardError):
            self.board.followup(task['id'], {'version': done['version'], 'text': '再一次', 'attachments': ['0' * 16]})

    def test_removed_and_deleted_card_files_are_cleaned(self):
        keep, drop = upload(self.board, 'keep.txt', b'k'), upload(self.board, 'drop.txt', b'd')
        task = self.board.create({'title': '清理', 'attachments': [keep['id'], drop['id']]})
        saved = self.board.update(task['id'], {'version': task['version'], 'attachments': [keep['id']]})
        self.assertFalse((self.board.attachments.root / drop['id']).exists())
        self.assertTrue(self.board.attachments.path(keep).is_file())
        http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        http.token, http.board = 'fixture-token', self.board
        threading.Thread(target=http.serve_forever, daemon=True).start()
        headers = {'X-Board-Token': 'fixture-token', 'Content-Type': 'application/json'}
        try:
            conn = HTTPConnection('127.0.0.1', http.server_port, timeout=10)
            raw = os.urandom(400000)  # well over the 300 KB limit of ordinary requests
            conn.request('POST', '/api/attachments', body=json.dumps({'name': 'big.bin', 'data': base64.b64encode(raw).decode()}), headers=headers)
            response = conn.getresponse()
            uploaded = json.loads(response.read())
            self.assertEqual((response.status, uploaded['size']), (201, len(raw)))
            conn.request('GET', '/api/attachments/' + uploaded['id'], headers=headers)
            self.assertEqual(base64.b64decode(json.loads(conn.getresponse().read())['data']), raw)
            conn.request('DELETE', '/api/tasks/' + saved['id'], headers=headers)
            self.assertEqual(conn.getresponse().read(), b'{"ok": true}')
            conn.close()
        finally:
            http.shutdown()
            http.server_close()
        self.assertFalse((self.board.attachments.root / keep['id']).exists())


if __name__ == '__main__':
    unittest.main()
