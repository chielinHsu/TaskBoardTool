"""Folder jobs, cancellation, lifecycle and HTTP auth; never open a native dialog."""
from http.client import HTTPConnection
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'outputs/taskboard'))
import server
from folder_picker import FolderPicker


class Process:
    def __init__(self, result):
        self.returncode = None
        self.result = result
        self.killed = False
        self.collected = False

    def poll(self):
        return self.returncode

    def kill(self):
        self.killed = True
        self.returncode = -1

    def communicate(self):
        self.collected = True
        return self.result, b''


class FolderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'work', prefix='folder-中文 空白-')
        self.path = self.temp.name
        self.process = Process(json.dumps({'path': self.path, 'cancelled': False}, ensure_ascii=False).encode())
        self.spawn = patch('folder_picker.subprocess.Popen', return_value=self.process)
        self.mock_spawn = self.spawn.start()
        self.picker = FolderPicker()

    def tearDown(self):
        self.picker.close()
        self.spawn.stop()
        self.temp.cleanup()

    def test_pending_selection_unicode_and_duplicate_dialog_guard(self):
        job = self.picker.start(self.path)
        self.assertEqual(self.picker.get(job['id'])['status'], 'pending')
        with self.assertRaises(server.BoardError) as caught:
            self.picker.start()
        self.assertEqual(caught.exception.status, 409)
        self.process.returncode = 0
        selected = self.picker.get(job['id'])
        self.assertEqual((selected['status'], selected['path']), ('selected', self.path))
        self.assertTrue(self.process.collected)
        self.assertIsNone(self.picker.timer)

    def test_user_cancel_expiry_and_shutdown_reap_process(self):
        self.process.result = b'{"cancelled":true}'
        job = self.picker.start()
        self.process.returncode = 0
        self.assertEqual(self.picker.get(job['id'])['status'], 'cancelled')
        for operation in ('cancel', 'expire', 'close'):
            process = Process(b'')
            self.mock_spawn.return_value = process
            job = self.picker.start()
            if operation == 'cancel': self.picker.cancel(job['id'])
            elif operation == 'expire': self.picker._expire(job['id'])
            else: self.picker.close()
            self.assertTrue(process.killed)
            self.assertTrue(process.collected)
            self.assertEqual(self.picker.get(job['id'])['status'], 'cancelled')

    def test_bad_results_and_unknown_jobs_do_not_return_paths(self):
        for result in (b'invalid', b'{"path":"not-an-absolute-folder"}', b'{"path":null}'):
            self.process = Process(result)
            self.mock_spawn.return_value = self.process
            job = self.picker.start()
            self.process.returncode = 0
            reply = self.picker.get(job['id'])
            self.assertEqual(reply['status'], 'error')
            self.assertNotIn('path', reply)
        with self.assertRaises(server.BoardError) as caught:
            self.picker.get('unknown')
        self.assertEqual(caught.exception.status, 404)
        with self.assertRaises(server.BoardError):
            self.picker.start(['bad'])

    def test_http_requires_token_and_allowed_origin_before_opening(self):
        http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        http.token, http.folder_picker = 'fixture-token', self.picker
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        def request(path, method='GET', token='', origin=None, body=None):
            conn = HTTPConnection('127.0.0.1', http.server_port, timeout=3)
            headers = {'X-Board-Token': token, 'Content-Type': 'application/json'}
            if origin: headers['Origin'] = origin
            try:
                conn.request(method, path, body=json.dumps(body or {}) if method == 'POST' else None, headers=headers)
                response = conn.getresponse()
                return response.status, json.loads(response.read())
            finally:
                conn.close()
        try:
            self.assertEqual(request('/api/folders/select', 'POST')[0], 403)
            self.assertEqual(request('/api/folders/select', 'POST', 'fixture-token', 'https://evil.example')[0], 403)
            self.mock_spawn.assert_not_called()
            status, job = request('/api/folders/select', 'POST', 'fixture-token', body={'initialPath': self.path})
            self.assertEqual(status, 202)
            self.assertEqual(request('/api/folders/'+job['id'], token='fixture-token')[1]['status'], 'pending')
            self.assertEqual(request('/api/folders/'+job['id']+'/cancel', 'POST', 'fixture-token')[1]['status'], 'cancelled')
            self.assertEqual(request('/api/folders/unknown', token='fixture-token')[0], 404)
        finally:
            http.shutdown(); http.server_close(); thread.join()


if __name__ == '__main__':
    unittest.main()
