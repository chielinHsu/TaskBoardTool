#!/usr/bin/env node
// 五級 agent 的實際載入驗證與效能比較。
// 預設只顯示計畫，不呼叫任何模型。實際執行需同時：
//   1. 加上 --run
//   2. 設定環境變數 <ENV_PREFIX>_BENCH_AUTHORIZED=1（代表使用者已明確授權消耗額度）
// 結果寫入 Git 忽略的 .ai/bench/，記錄實際 model、effort、時間、tokens 與費用；缺資料寫 n/a。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { TIERS, ENV_PREFIX } = await import(pathToFileURL(path.join(ROOT, '.claude', 'hooks', 'model_router.mjs')).href);

const args = process.argv.slice(2);
const RUN = args.includes('--run');
const only = (args.find((a) => a.startsWith('--agent=')) || '').slice('--agent='.length);
const budgetArg = (args.find((a) => a.startsWith('--max-budget-usd=')) || '').slice('--max-budget-usd='.length);
const BUDGET = budgetArg || '0.50';
if(!/^\d+(?:\.\d{1,2})?$/.test(BUDGET)||Number(BUDGET)<=0)throw Error('Invalid budget');
if(only && !TIERS.some(t=>t.agent===only))throw Error('Unknown agent');
const AUTHORIZED = process.env[`${ENV_PREFIX}_BENCH_AUTHORIZED`] === '1';

// 參數只含 ASCII 旗標，Windows 上 shell 執行 claude.cmd 時不需另外跳脫。
// 唯讀、低成本、可在任何狀態下執行的固定任務；不修改專案。
const TASK = '只讀任務：讀取 AI_CONTEXT.md，以繁體中文一句話說明本專案用途。不要修改任何檔案，不要執行命令。';

const plan = TIERS.filter((t) => !only || t.agent === only).map((t) => ({
  agent: t.agent,
  expectedModel: t.model,
  expectedEffort: t.effort,
  command: ['claude', '-p', '--agent', t.agent, '--output-format', 'json', '--max-budget-usd', BUDGET, '--no-session-persistence', '--permission-mode', 'plan'],
}));

const quote = (s) => (/[\s"]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);
console.log(`bench 計畫（${plan.length} 個 agent，每次預算上限 USD ${BUDGET}）：`);
console.log(`任務經 stdin 傳入：${TASK}`);
for (const p of plan) console.log(`- ${p.agent}（預期 ${p.expectedModel}／${p.expectedEffort}）\n    ${p.command.map(quote).join(' ')}`);

if (!RUN) {
  console.log('\n只顯示計畫，未執行。實際執行會消耗模型額度：取得使用者授權後，設定');
  console.log(`  ${ENV_PREFIX}_BENCH_AUTHORIZED=1 並加上 --run（可用 --agent=<name> 只測一個）。`);
  process.exit(0);
}
if (!AUTHORIZED) {
  console.error(`\n拒絕執行：缺少 ${ENV_PREFIX}_BENCH_AUTHORIZED=1（需使用者明確授權消耗額度）。`);
  process.exit(2);
}

const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['claude'], { encoding: 'utf8' });
if (which.status !== 0) {
  console.error('找不到 claude CLI，無法執行實際載入驗證。');
  process.exit(3);
}

const na = (v) => (v === undefined || v === null || v === '' ? 'n/a' : v);
const rows = [];
for (const p of plan) {
  const started = Date.now();
  const res = spawnSync(p.command[0], p.command.slice(1), { cwd: ROOT, input: TASK, encoding: 'utf8', timeout: 300000, shell: process.platform === 'win32', maxBuffer: 16 * 1024 * 1024 });
  const elapsedMs = Date.now() - started;
  let data = null;
  try { data = JSON.parse(res.stdout); } catch { /* 保留 n/a */ }
  const modelUsage = data?.modelUsage || {};
  const models = Object.keys(modelUsage);
  const usage = data?.usage || {};
  const row = {
    agent: p.agent,
    expectedModel: p.expectedModel,
    expectedEffort: p.expectedEffort,
    actualModels: models.length ? models.join(',') : 'n/a',
    actualEffort: na(data?.effort),
    exitCode: res.status,
    elapsedMs,
    durationApiMs: na(data?.duration_api_ms),
    inputTokens: na(usage.input_tokens),
    outputTokens: na(usage.output_tokens),
    cacheReadTokens: na(usage.cache_read_input_tokens),
    costUsd: na(data?.total_cost_usd),
    isError: na(data?.is_error),
    modelMatches: models.length ? models.some((m) => m.toLowerCase().includes(p.expectedModel)) : 'n/a',
  };
  rows.push(row);
  console.log(`\n${p.agent}: exit ${row.exitCode}, ${elapsedMs} ms, models ${row.actualModels}, effort ${row.actualEffort}, tokens in/out ${row.inputTokens}/${row.outputTokens}, cost ${row.costUsd}`);
}

const outDir = path.join(ROOT, '.ai', 'bench');
fs.mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = path.join(outDir, `model-routing-${stamp}.json`);
fs.writeFileSync(outFile, JSON.stringify({ createdAt: new Date().toISOString(), task: TASK, budgetUsd: BUDGET, rows }, null, 2));
console.log(`\n結果已寫入 ${path.relative(ROOT, outFile)}。主 session 的 model 可能也出現在 modelUsage；effort 若 CLI 未回報則為 n/a。`);
