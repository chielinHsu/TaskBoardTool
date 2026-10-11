#!/usr/bin/env node
// 把本專案的 Claude Code 看板 mod（claude-mod/taskboard-pane）安裝成全域 mod：
//   1. 複製到 ~/.claude/mods/taskboard-pane（與 usage-bar、agents-panel 等 mod 同一位置）
//   2. 把該全域路徑登記到 ~/.claude/settings.json → env.CLAUDE_CODE_PLUGIN_DIRS
// 之後每個 Claude Code session（含 Claude App 啟動的）都會載入，不依賴專案放在哪裡，
// 也不再是只有建立 mod 的那個 session 才看得到。專案更新後重跑一次即同步副本。
//
// 用法（在任何目錄）：
//   node outputs/taskboard/setup-claude-mod.mjs              # 同步副本、補齊設定、檢查前置條件
//   node outputs/taskboard/setup-claude-mod.mjs --check      # 唯讀：只回報，有缺項時結束碼 1
//   node outputs/taskboard/setup-claude-mod.mjs --no-validate    # 略過 claude plugin validate
//
// 只改 settings.json 的 env.CLAUDE_CODE_PLUGIN_DIRS 與 CLAUDE_CODE_PLUGIN_DIR_WATCH，其餘鍵值原樣保留；
// 副本只覆寫來源有的檔案，保留引擎寫入的 .claude-plugin/types/ 與 tsconfig.json；
// 寫入前分別備份到 work/claude-settings-backups、work/claude-mod-backups（不進 Git）。
// 不安裝任何軟體、不登入、不碰官方安裝檔，也不耗模型額度。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const checkOnly = args.has('--check') || args.has('-Check');
const skipValidate = args.has('--no-validate');
const isWindows = process.platform === 'win32';

const taskboardRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(taskboardRoot, '..', '..');
const modSource = path.join(taskboardRoot, 'claude-mod', 'taskboard-pane');
const claudeHome = path.join(os.homedir(), '.claude');
const modTarget = path.join(claudeHome, 'mods', 'taskboard-pane');
const settingsPath = path.join(claudeHome, 'settings.json');
const settingsBackupRoot = path.join(repoRoot, 'work', 'claude-settings-backups');
const modBackupRoot = path.join(repoRoot, 'work', 'claude-mod-backups');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

const problems = [];
const notes = [];
let changed = false;
const log = (line) => console.log(line);

function normalise(p) {
  const full = path.resolve(p.replace(/^~(?=$|[\\/])/, os.homedir()));
  const slashed = full.replace(/\\/g, '/').replace(/\/+$/, '');
  return isWindows ? slashed.toLowerCase() : slashed;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function listFiles(root, relative = '') {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

function commandVersion(command, versionArgs = ['--version']) {
  const result = spawnSync(command, versionArgs, { encoding: 'utf8', shell: isWindows, timeout: 20000 });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || result.stderr || '').trim().split(/\r?\n/)[0];
}

// 1. 確認 mod 來源
let manifest;
try {
  manifest = readJson(path.join(modSource, '.claude-plugin', 'plugin.json'));
} catch (error) {
  console.error(`找不到 mod 來源或 plugin.json 無法解析：${modSource}\n${error.message}`);
  process.exit(2);
}
if (manifest.name !== 'taskboard-pane') {
  console.error(`mod 身分不符：預期 taskboard-pane，實際 ${manifest.name}`);
  process.exit(2);
}
log(`mod 來源：${modSource}（${manifest.name} ${manifest.version}）`);
log(`全域安裝位置：${modTarget}`);

// 2. 同步副本到 ~/.claude/mods/taskboard-pane（略過引擎寫入的檔案）
const engineWritten = (rel) => rel.startsWith('.claude-plugin/types/') || rel === 'tsconfig.json';
const sourceFiles = listFiles(modSource).filter((rel) => !engineWritten(rel));
if (fs.existsSync(modTarget)) {
  const targetManifestPath = path.join(modTarget, '.claude-plugin', 'plugin.json');
  if (fs.existsSync(targetManifestPath)) {
    let targetManifest;
    try { targetManifest = readJson(targetManifestPath); } catch { targetManifest = {}; }
    if (targetManifest.name && targetManifest.name !== 'taskboard-pane') {
      console.error(`${modTarget} 已存在但不是 taskboard-pane（${targetManifest.name}），停止以免覆寫他人 mod。`);
      process.exit(2);
    }
  }
}
const outdated = sourceFiles.filter((rel) => {
  const dest = path.join(modTarget, rel);
  return !fs.existsSync(dest) || sha256(dest) !== sha256(path.join(modSource, rel));
});
const stale = fs.existsSync(modTarget)
  ? listFiles(modTarget).filter((rel) => !engineWritten(rel) && !sourceFiles.includes(rel))
  : [];
if (!outdated.length) {
  log(`副本與來源一致（${sourceFiles.length} 個檔案）。`);
} else {
  changed = true;
  log(`副本需更新 ${outdated.length} 個檔案${checkOnly ? '' : '，將複製'}：${outdated.join('、')}`);
  if (!checkOnly) {
    let backup = null;
    for (const rel of outdated) {
      const src = path.join(modSource, rel);
      const dest = path.join(modTarget, rel);
      if (fs.existsSync(dest)) {
        backup ??= path.join(modBackupRoot, `${stamp}-global`);
        const backupFile = path.join(backup, rel);
        fs.mkdirSync(path.dirname(backupFile), { recursive: true });
        fs.copyFileSync(dest, backupFile);
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      if (sha256(src) !== sha256(dest)) {
        console.error(`複製後雜湊不符：${rel}${backup ? `，備份：${backup}` : ''}`);
        process.exit(2);
      }
    }
    log(`副本已更新${backup ? `，覆寫前備份：${backup}` : ''}。`);
  }
}
if (stale.length) notes.push(`副本內有來源沒有的檔案（未刪除）：${stale.join('、')}`);

// 3. 讀取使用者 settings.json，登記全域路徑
let settings = {};
let settingsExisted = false;
if (fs.existsSync(settingsPath)) {
  settingsExisted = true;
  try {
    settings = readJson(settingsPath);
  } catch (error) {
    console.error(`無法解析 ${settingsPath}：${error.message}\n請先手動修正，本腳本不會覆寫損壞的設定。`);
    process.exit(2);
  }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    console.error(`${settingsPath} 頂層不是物件，停止。`);
    process.exit(2);
  }
}
if (settings.env && (typeof settings.env !== 'object' || Array.isArray(settings.env))) {
  console.error(`${settingsPath} 的 env 不是物件，停止。`);
  process.exit(2);
}
const env = { ...(settings.env || {}) };
const existingRaw = typeof env.CLAUDE_CODE_PLUGIN_DIRS === 'string' ? env.CLAUDE_CODE_PLUGIN_DIRS : '';
const existingDirs = existingRaw.split(path.delimiter).map((item) => item.trim()).filter(Boolean);
const wanted = normalise(modTarget);
const sourceKey = normalise(modSource);
const alreadyListed = existingDirs.some((item) => normalise(item) === wanted);
const sourceListed = existingDirs.filter((item) => normalise(item) === sourceKey);
const watchEnabled = env.CLAUDE_CODE_PLUGIN_DIR_WATCH === '1';

let settingsChanged = false;
if (alreadyListed) {
  log('CLAUDE_CODE_PLUGIN_DIRS 已包含全域路徑。');
} else {
  settingsChanged = true;
  log(`CLAUDE_CODE_PLUGIN_DIRS 缺少全域路徑${checkOnly ? '' : '，將加入'}。`);
}
if (sourceListed.length) {
  settingsChanged = true;
  log(`CLAUDE_CODE_PLUGIN_DIRS 另列有專案來源路徑${checkOnly ? '' : '，將移除以免重複載入'}：${sourceListed.join('、')}`);
}
if (!watchEnabled) {
  settingsChanged = true;
  log(`CLAUDE_CODE_PLUGIN_DIR_WATCH 未設為 1${checkOnly ? '' : '，將設定'}。`);
}
if (settingsChanged) changed = true;

if (settingsChanged && !checkOnly) {
  const kept = existingDirs.filter((item) => normalise(item) !== sourceKey && normalise(item) !== wanted);
  env.CLAUDE_CODE_PLUGIN_DIRS = [...kept, modTarget.replace(/\\/g, '/')].join(path.delimiter);
  env.CLAUDE_CODE_PLUGIN_DIR_WATCH = '1';
  const next = { ...settings, env };
  if (settingsExisted) {
    fs.mkdirSync(settingsBackupRoot, { recursive: true });
    const backup = path.join(settingsBackupRoot, `${stamp}-settings.json`);
    fs.copyFileSync(settingsPath, backup);
    log(`已備份原設定：${backup}`);
  } else {
    fs.mkdirSync(claudeHome, { recursive: true });
  }
  fs.writeFileSync(settingsPath, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  const verify = readJson(settingsPath);
  const verifyDirs = String(verify.env?.CLAUDE_CODE_PLUGIN_DIRS || '').split(path.delimiter);
  if (!verifyDirs.some((item) => normalise(item) === wanted) || verify.env?.CLAUDE_CODE_PLUGIN_DIR_WATCH !== '1') {
    console.error('寫入後核對失敗，請檢查 settings.json 與備份。');
    process.exit(2);
  }
  log(`已更新：${settingsPath}`);
}

// 4. 回報舊的 session 專屬 dev-mods 副本（只回報，不刪除）
const devMods = path.join(claudeHome, 'dev-mods');
if (fs.existsSync(devMods)) {
  for (const entry of fs.readdirSync(devMods, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(devMods, entry.name, 'taskboard-pane', '.claude-plugin', 'plugin.json');
    if (fs.existsSync(candidate)) {
      notes.push(`dev-mods 仍有 session 專屬副本：${path.dirname(path.dirname(candidate))}（只在 session ${entry.name} 載入；該 session 會同時載入兩份，確認全域版可用後可手動刪除）`);
    }
  }
}

// 5. 前置條件
const nodeMajor = Number(process.versions.node.split('.')[0]);
log(`Node：v${process.versions.node}${nodeMajor >= 22 ? '' : '（需 22 以上才有原生 WebSocket，Codex 整合 helper 會失敗）'}`);
if (nodeMajor < 22) problems.push('Node 版本低於 22');

const python = commandVersion('python');
log(`Python：${python || '找不到 python（看板服務 server.py 需要 Python 3）'}`);
if (!python) problems.push('缺少 Python');

const claude = commandVersion('claude');
log(`Claude Code CLI：${claude || '找不到 claude（Claude 派工不可用；mod 本身由 App 載入，不受影響）'}`);
if (!claude) notes.push('Claude 派工需要 claude CLI 並先執行 claude auth login');

const codex = commandVersion('codex');
const codexBin = isWindows ? path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin') : '';
const codexCached = codexBin && fs.existsSync(codexBin);
log(`Codex CLI：${codex || (codexCached ? `PATH 無 codex，但有快取 ${codexBin}` : '找不到（Codex 派工與專用視窗不可用；只用 Claude 可忽略）')}`);
if (!codex && !codexCached) notes.push('Codex 側需要 Microsoft Store Codex App；start-app.ps1 沒有它會直接結束，只跑網頁版請用 start.ps1');

const launchJson = path.join(repoRoot, '.claude', 'launch.json');
log(`.claude/launch.json：${fs.existsSync(launchJson) ? '存在（Claude App Browser 窗格可附掛 http://127.0.0.1:47824）' : '缺少'}`);
if (!fs.existsSync(launchJson)) problems.push('缺少 .claude/launch.json');

const dataDir = path.join(taskboardRoot, '.data');
log(`看板資料 .data：${fs.existsSync(dataDir) ? '已存在' : '尚未建立（第一次啟動服務時建立，為空白看板；資料庫不在 Git 內）'}`);

// 6. 靜態驗證來源 mod（不耗額度）
if (!skipValidate && claude) {
  const result = spawnSync('claude', ['plugin', 'validate', modSource], {
    encoding: 'utf8', shell: isWindows, timeout: 120000,
    env: { ...process.env, CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: '1' },
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`.trim().split(/\r?\n/).slice(-3).join(' | ');
  if (result.status === 0) log(`claude plugin validate：通過（${output}）`);
  else { log(`claude plugin validate：失敗（${output}）`); problems.push('claude plugin validate 失敗'); }
}

// 7. 總結
for (const note of notes) log(`注意：${note}`);
for (const problem of problems) log(`缺項：${problem}`);
if (checkOnly) {
  log(changed ? '檢查結果：副本或 settings.json 需要更新（唯讀模式未修改）。' : '檢查結果：全域 mod 與 settings.json 已就緒。');
  process.exit(changed || problems.length ? 1 : 0);
}
log('');
log('後續步驟：');
log('  1. 設定只對新啟動的 Claude Code session 生效：關閉並重開 Claude App（或開新 session）。');
log('  2. 新 session 內窗格會自動開啟；關閉後輸入 /taskboard 重開。已開啟且已載入全域版的 session，儲存副本後會熱重載。');
log('  3. 看板服務：powershell -NoProfile -ExecutionPolicy Bypass -File outputs/taskboard/start.ps1（Codex 專用視窗改用 start-app.ps1）。');
log('  4. 之後 git pull 更新專案後，重跑本腳本同步全域副本；舊的 update-claude-mod.ps1 只服務 dev-mods 副本。');
process.exit(problems.length ? 1 : 0);
