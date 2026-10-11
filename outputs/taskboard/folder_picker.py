"""Bounded Windows folder dialog jobs; no task/database writes."""
import json
import os
from pathlib import Path
import subprocess
import threading
import uuid

from tool_adapters import BoardError


class FolderPicker:
    def __init__(self):
        self.lock = threading.RLock()
        self.job = None
        self.process = None
        self.timer = None

    def start(self, initial_path=''):
        if not isinstance(initial_path, str) or len(initial_path) > 20000 or '\x00' in initial_path:
            raise BoardError('資料夾路徑格式不正確。')
        if os.name != 'nt':
            raise BoardError('原生資料夾選擇僅支援 Windows；仍可直接輸入路徑。', 503)
        initial = Path(initial_path) if initial_path else None
        if initial and (not initial.is_absolute() or not initial.is_dir()):
            initial_path = ''
        with self.lock:
            self._collect()
            if self.process:
                raise BoardError('已有資料夾選擇視窗開啟，請先完成或取消。', 409)
            try:
                self.process = subprocess.Popen([
                    'powershell.exe', '-NoProfile', '-NonInteractive', '-STA',
                    '-ExecutionPolicy', 'Bypass', '-File',
                    str(Path(__file__).with_name('select-folder.ps1')),
                    '-InitialPath', initial_path,
                ], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    creationflags=subprocess.CREATE_NO_WINDOW)
            except OSError as exc:
                raise BoardError('無法開啟資料夾選擇視窗；請確認 Windows PowerShell 可用。', 503) from exc
            self.job = {'id': uuid.uuid4().hex, 'status': 'pending'}
            self.timer = threading.Timer(300, self._expire, args=(self.job['id'],))
            self.timer.daemon = True
            self.timer.start()
            return dict(self.job)

    def _collect(self):
        if not self.process or self.process.poll() is None:
            return
        process, self.process = self.process, None
        if self.timer:
            self.timer.cancel()
            self.timer = None
        stdout, _ = process.communicate()
        try:
            result = json.loads(stdout.decode('utf-8-sig'))
            if process.returncode != 0 or not isinstance(result, dict):
                raise ValueError()
            if result.get('cancelled') is True:
                self.job.update(status='cancelled')
            else:
                selected = result.get('path')
                if not isinstance(selected, str) or not Path(selected).is_absolute() or not Path(selected).is_dir():
                    raise ValueError()
                self.job.update(status='selected', path=selected)
        except (ValueError, OSError, UnicodeError):
            self.job.update(status='error', error='資料夾選擇失敗；可重新選擇或直接輸入路徑。')

    def _stop(self, status):
        if self.timer:
            self.timer.cancel()
            self.timer = None
        if self.process:
            self.process.kill()
            self.process.communicate()
            self.process = None
        if self.job:
            self.job.update(status=status)

    def _expire(self, job_id):
        with self.lock:
            self._collect()
            if self.job and self.job['id'] == job_id and self.job['status'] == 'pending':
                self._stop('cancelled')

    def get(self, job_id):
        with self.lock:
            self._collect()
            if not self.job or self.job['id'] != job_id:
                raise BoardError('找不到資料夾選擇操作，請重新選擇。', 404)
            return dict(self.job)

    def cancel(self, job_id):
        with self.lock:
            self.get(job_id)
            if self.job['status'] == 'pending':
                self._stop('cancelled')
            return dict(self.job)

    def close(self):
        with self.lock:
            self._stop('cancelled')
