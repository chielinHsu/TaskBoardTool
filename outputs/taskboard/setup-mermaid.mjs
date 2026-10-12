#!/usr/bin/env node
// 下載看板渲染 Mermaid 圖用的固定版本函式庫到 outputs/taskboard/vendor/（已 gitignore，不進 Git）。
// 看板回報裡的 ```mermaid 區塊會經 GET /api/vendor/mermaid 懶載入這份檔案；網頁版與 Codex App 內嵌版同一路徑。
//
// 用法（在任何目錄）：
//   node outputs/taskboard/setup-mermaid.mjs           # 缺少或雜湊不符時下載並核對
//   node outputs/taskboard/setup-mermaid.mjs --check   # 唯讀：只回報，未就緒時結束碼 1
//
// 版本、來源、位元組數與 SHA-256 寫死在 MERMAID；下載內容不符時刪除下載內容與舊檔、不安裝並以結束碼 1 報錯。
// 寫入 vendor/mermaid.min.js 與 vendor/mermaid.json（安裝紀錄，服務端用來核對檔案完整性）。
// 只連 cdn.jsdelivr.net，不執行下載內容，不安裝其他套件，不改真實任務資料。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

// 11.17.2：2026-08-25 發布；11.6.0～11.16.0 有已公開的 XSS／HTML／CSS 注入與 DoS 公告（CVE-2025-54881 等），皆於此版前修補。
export const MERMAID = Object.freeze({
  version: '11.17.2',
  url: 'https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js',
  size: 3572661,
  sha256: '581ed7d74bd9048d0e3a91363927d72ef22942d7722546b27f7cc29e35390eb8',
});

export const vendorDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vendor');
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const files = (dir) => ({ script: path.join(dir, 'mermaid.min.js'), manifest: path.join(dir, 'mermaid.json') });

export function inspect(dir = vendorDir, pin = MERMAID) {
  const { script, manifest } = files(dir);
  if (!fs.existsSync(script)) return { ok: false, reason: 'missing', message: `尚未安裝：${script}` };
  const actual = sha256(fs.readFileSync(script));
  if (actual !== pin.sha256) return { ok: false, reason: 'hash', message: `雜湊不符：預期 ${pin.sha256}，實得 ${actual}` };
  let record = null;
  try { record = JSON.parse(fs.readFileSync(manifest, 'utf8')); } catch { /* reported below */ }
  if (record?.sha256 !== pin.sha256 || record?.version !== pin.version) return { ok: false, reason: 'manifest', message: `安裝紀錄缺少或與 ${pin.version} 不符：${manifest}` };
  return { ok: true, reason: 'ok', message: `Mermaid ${pin.version} 已安裝且雜湊相符：${script}` };
}

function discard(dir) {
  const { script, manifest } = files(dir);
  for (const file of [script + '.part', script, manifest]) fs.rmSync(file, { force: true });
}

export async function install({ dir = vendorDir, pin = MERMAID, fetchImpl = fetch, log = console.log } = {}) {
  const before = inspect(dir, pin);
  if (before.ok) { log(before.message); return { changed: false }; }
  log(`${before.message}\n下載 ${pin.url}（${pin.size} bytes）…`);
  const response = await fetchImpl(pin.url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error(`下載失敗：HTTP ${response.status} ${pin.url}`);
  const data = Buffer.from(await response.arrayBuffer());
  const actual = sha256(data);
  if (data.length !== pin.size || actual !== pin.sha256) {
    discard(dir);
    throw Error(`下載內容與固定版本不符，已刪除下載內容與舊檔，未安裝。預期 ${pin.sha256}（${pin.size} bytes），實得 ${actual}（${data.length} bytes）。`);
  }
  const { script, manifest } = files(dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(script + '.part', data);
  fs.renameSync(script + '.part', script);
  const record = { name: 'mermaid', version: pin.version, source: pin.url, size: pin.size, sha256: pin.sha256, installedAt: new Date().toISOString() };
  fs.writeFileSync(manifest, JSON.stringify(record, null, 2) + '\n');
  const after = inspect(dir, pin);
  if (!after.ok) { discard(dir); throw Error('寫入後核對失敗：' + after.message); }
  log(`已安裝 Mermaid ${pin.version}：${script}`);
  return { changed: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = new Set(process.argv.slice(2));
  try {
    if (args.has('--check') || args.has('-Check')) {
      const state = inspect();
      console.log(state.ok ? state.message : `${state.message}\n請執行：node outputs/taskboard/setup-mermaid.mjs`);
      process.exitCode = state.ok ? 0 : 1;
    } else {
      await install();
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
