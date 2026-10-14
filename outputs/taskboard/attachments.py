"""Files and images attached to a card's brief or a follow-up request.

Each upload lives in its own folder under the board's data directory (`.data/attachments/<id>/`), next to a
meta.json the server wrote itself; cards and runs only keep the metadata. The execution tool receives the
absolute file path (and images as native image input), so nothing is copied into the user's workspace."""
import base64
import binascii
import json
import mimetypes
from pathlib import Path
import re
import shutil
import time
import uuid

from tool_adapters import BoardError

MAX_BYTES = 10 * 1024 * 1024
MAX_PER_ITEM = 20
# Base64 grows the payload by 4/3; the JSON envelope adds the name and type.
MAX_BODY = MAX_BYTES * 4 // 3 + 64 * 1024
IMAGE_TYPES = {'image/png', 'image/jpeg', 'image/gif', 'image/webp'}
ID_PATTERN = re.compile(r'^[0-9a-f]{16}$')
UNSAFE_NAME = re.compile(r'[\x00-\x1f<>:"/\\|?*]')
RESERVED_NAMES = {'con', 'prn', 'aux', 'nul', *(f'com{i}' for i in range(10)), *(f'lpt{i}' for i in range(10))}


def safe_name(name):
    """A Windows-safe file name that keeps the original extension."""
    name = UNSAFE_NAME.sub('_', Path(str(name or '').replace('\\', '/')).name).strip(' .')
    stem, suffix = (name.rsplit('.', 1) + [''])[:2] if '.' in name else (name, '')
    stem, suffix = stem[:150] or '附件', suffix[:20]
    if stem.lower() in RESERVED_NAMES or stem == 'meta':
        stem = '_' + stem
    return f'{stem}.{suffix}' if suffix else stem


def public(meta):
    return {key: meta[key] for key in ('id', 'name', 'size', 'mime', 'createdAt')}


class AttachmentStore:
    def __init__(self, directory):
        self.root = Path(directory)
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, body):
        name = safe_name(body.get('name', ''))
        data = body.get('data')
        if not isinstance(data, str) or not data:
            raise BoardError('附件內容不能空白。')
        try:
            raw = base64.b64decode(data, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise BoardError('附件內容格式不正確。') from exc
        if not raw:
            raise BoardError('附件內容不能空白。')
        if len(raw) > MAX_BYTES:
            raise BoardError(f'附件 {name} 超過 {MAX_BYTES // 1024 // 1024} MB。', 413)
        mime = str(body.get('mime') or '').strip().lower()[:100]
        if not re.match(r'^[a-z0-9.+-]+/[a-z0-9.+-]+$', mime):
            mime = mimetypes.guess_type(name)[0] or 'application/octet-stream'
        meta = {'id': uuid.uuid4().hex[:16], 'name': name, 'size': len(raw), 'mime': mime, 'createdAt': time.time()}
        folder = self.root / meta['id']
        folder.mkdir()
        (folder / name).write_bytes(raw)
        (folder / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
        return public(meta)

    def meta(self, attachment_id):
        if not isinstance(attachment_id, str) or not ID_PATTERN.match(attachment_id):
            raise BoardError('附件 ID 不正確。')
        try:
            meta = json.loads((self.root / attachment_id / 'meta.json').read_text(encoding='utf-8'))
        except (OSError, ValueError) as exc:
            raise BoardError('找不到附件，請重新上傳。', 404) from exc
        return public(meta)

    def path(self, meta):
        return self.root / meta['id'] / meta['name']

    def resolve(self, values):
        """Validate a list of attachment ids from a request; returns their metadata in order, duplicates removed."""
        if not isinstance(values, list) or len(values) > MAX_PER_ITEM:
            raise BoardError(f'附件需為清單，最多 {MAX_PER_ITEM} 個。')
        ids = list(dict.fromkeys(value.get('id') if isinstance(value, dict) else value for value in values))
        return [self.meta(attachment_id) for attachment_id in ids]

    def read(self, attachment_id):
        meta = self.meta(attachment_id)
        return {**meta, 'data': base64.b64encode(self.path(meta).read_bytes()).decode('ascii')}

    def delete(self, attachment_ids):
        for attachment_id in attachment_ids:
            if isinstance(attachment_id, str) and ID_PATTERN.match(attachment_id):
                shutil.rmtree(self.root / attachment_id, ignore_errors=True)


def task_attachment_ids(task):
    """Every attachment a card refers to: its brief, each run, the queued follow-up and follow-up comments."""
    groups = [task.get('attachments') or [], (task.get('nextRun') or {}).get('attachments') or []]
    groups += [run.get('attachments') or [] for run in task.get('runs', [])]
    groups += [comment.get('attachments') or [] for comment in task.get('comments', [])]
    return {item['id'] for group in groups for item in group if isinstance(item, dict) and item.get('id')}


def describe(store, items):
    """Prompt lines naming each attachment with its absolute path."""
    lines = []
    for item in items:
        size = item['size'] / 1024
        kind = '圖片' if item['mime'] in IMAGE_TYPES else '檔案'
        lines.append(f"- {item['name']}（{kind}，{size:.0f} KB）：{store.path(item)}")
    return '\n'.join(lines)
