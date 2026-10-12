"""GET /api/vendor/mermaid：token／Origin 保護、缺檔、雜湊不符與快取；只用 work/ 的隔離資料夾，不碰 vendor/。"""
from http.client import HTTPConnection
import hashlib
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

SOURCE = 'globalThis.mermaid={render(){},initialize(){}};// 中文註解'


class VendorTests(unittest.TestCase):
    def setUp(self):
        (ROOT / 'work').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'work', prefix='vendor-')
        self.folder = Path(self.temp.name)
        self.vendor = patch.object(server, 'VENDOR', self.folder)
        self.vendor.start()
        server._vendor_cache.clear()
        self.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        self.http.token = 'fixture-token'
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.http.shutdown()
        self.http.server_close()
        self.vendor.stop()
        server._vendor_cache.clear()
        self.temp.cleanup()

    def install(self, source=SOURCE, digest=None):
        data = source.encode('utf-8')
        (self.folder / 'mermaid.min.js').write_bytes(data)
        record = {'name': 'mermaid', 'version': '11.0.0-test', 'sha256': hashlib.sha256(data).hexdigest() if digest is None else digest}
        (self.folder / 'mermaid.json').write_text(json.dumps(record), encoding='utf-8')

    def request(self, token='fixture-token', origin=None, path='/api/vendor/mermaid'):
        conn = HTTPConnection('127.0.0.1', self.http.server_port, timeout=3)
        headers = {'X-Board-Token': token}
        if origin:
            headers['Origin'] = origin
        conn.request('GET', path, headers=headers)
        response = conn.getresponse()
        body = json.loads(response.read().decode('utf-8'))
        conn.close()
        return response.status, body, response

    def test_requires_token_and_allowed_origin(self):
        self.install()
        self.assertEqual(self.request(token='')[0], 403)
        self.assertEqual(self.request(token='wrong')[0], 403)
        self.assertEqual(self.request(origin='https://evil.example')[0], 403)
        self.assertEqual(self.request(origin=f'http://127.0.0.1:{self.http.server_port}')[0], 200)

    def test_missing_library_explains_install_command(self):
        status, body, _ = self.request()
        self.assertEqual(status, 404)
        self.assertIn('setup-mermaid.mjs', body['error'])

    def test_returns_verified_source_as_json_without_relaxing_csp(self):
        self.install()
        status, body, response = self.request()
        self.assertEqual(status, 200)
        self.assertEqual((body['name'], body['version'], body['source']), ('mermaid', '11.0.0-test', SOURCE))
        self.assertEqual(body['sha256'], hashlib.sha256(SOURCE.encode()).hexdigest())
        self.assertTrue(response.getheader('Content-Type').startswith('application/json'))
        csp = response.getheader('Content-Security-Policy')
        self.assertIn("script-src 'self' 'unsafe-inline'", csp)
        self.assertNotIn('unsafe-eval', csp)
        self.assertNotIn('cdn.jsdelivr.net', csp)

    def test_hash_mismatch_is_rejected_after_tampering(self):
        self.install()
        self.assertEqual(self.request()[0], 200)
        (self.folder / 'mermaid.min.js').write_text(SOURCE + 'alert(1)', encoding='utf-8')
        status, body, _ = self.request()
        self.assertEqual(status, 409)
        self.assertIn('雜湊不符', body['error'])

    def test_missing_or_broken_manifest_is_not_installed(self):
        (self.folder / 'mermaid.min.js').write_text(SOURCE, encoding='utf-8')
        self.assertEqual(self.request()[0], 404)
        (self.folder / 'mermaid.json').write_text('{broken', encoding='utf-8')
        self.assertEqual(self.request()[0], 404)
        self.install(digest='')
        self.assertEqual(self.request()[0], 409)

    def test_cached_until_file_changes(self):
        self.install()
        first = server.vendor_mermaid()
        with patch.object(Path, 'read_bytes', side_effect=AssertionError('re-read')):
            self.assertIs(server.vendor_mermaid(), first)


if __name__ == '__main__':
    unittest.main()
