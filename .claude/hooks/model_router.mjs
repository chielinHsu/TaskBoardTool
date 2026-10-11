#!/usr/bin/env node
// Claude Code UserPromptSubmit hook：依需求內容建議 agent／model／effort。
// 只提供建議，不會切換主 session 的模型或 effort；主 agent 讀取實際內容後重新判斷。
// 不呼叫任何外部模型或 API；任何錯誤都靜默結束（exit 0），不阻斷正常需求。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// 專案設定（本機任務看板）。修改分數規則時同步 MODEL_ROUTING.md 與 scripts/ai/check-model-routing.mjs 的案例。
// ---------------------------------------------------------------------------
export const ENV_PREFIX = 'TASKBOARD_ROUTER';

export const TIERS = [
  { agent: 'fast-worker', model: 'haiku', effort: 'low' },
  { agent: 'developer', model: 'sonnet', effort: 'medium' },
  { agent: 'developer-deep', model: 'sonnet', effort: 'high' },
  { agent: 'architect', model: 'opus', effort: 'high' },
  { agent: 'architect-deep', model: 'opus', effort: 'xhigh' },
];

// 每項取命中規則的最高分，不累加；未命中時用 base。
export const PROFILE = {
 risk:{base:2,rules:[
  [5,/(刪除.*(資料庫|卡片|profile)|覆寫|部署|發布|force.?push|強制推送)/i,'不可逆資料或外部發布'],
  [4,/(權限|授權|認證|token|capability|CSP|sandbox|CDP|SQLite|migration|資料完整性|跨模組|架構|並行生命週期)/i,'安全、資料與生命週期'],
  [3,/(HTTP|API|排程|scheduler|拖曳)/i,'資料流與執行狀態'],
  [1,/(錯字|typo)/i,'文字修正']]},
 complexity:{base:2,rules:[
  [5,/(全面重寫|重構整個|新架構)/i,'廣泛重構'],
  [4,/(跨模組|多個檔案|整合|integration|並行|race|iframe|主題同步|啟動器)/i,'跨執行環境整合'],
  [3,/(新增|實作|API|測試案例)/i,'一般功能'],[1,/(錯字|typo)/i,'文字修正']]},
 reasoning:{base:2,rules:[
  [5,/(證明|最壞情況|安全模型|一致性模型)/i,'嚴謹推導'],
  [4,/(根因|分析|為什麼|設計|競爭條件|race|比較方案)/i,'分析與設計'],[3,/(除錯|錯誤|失敗|bug)/i,'一般除錯']]},
 uncertainty:{base:2,rules:[
  [5,/(偶發|原因不明|無法重現|intermittent|flaky)/i,'不穩定原因'],[4,/(不確定|未知|調查|平台限制|Windows.*版本)/i,'平台相容性未知']]},
 highVerification:/(Appearance|明暗|自訂色彩|截圖|視覺|畫面|重開|冷啟動|重新啟動|效能|performance)/i,
 lowVerification:/(文件|docs?\b|README|markdown|\.md\b|錯字|typo)/i,
 moduleHints:/(outputs\/taskboard\/|scripts\/ai\/|tests\/|模組|module)/i,
 crossModuleHints:/(跨模組|整個專案|全專案|架構|前後端|cross.?module)/i
};

// ---------------------------------------------------------------------------
// 通用引擎（各專案相同）。
// ---------------------------------------------------------------------------
const READ_ONLY_INTENT = /(查詢|查一下|列出|找出|找到|搜尋|在哪|哪裡|哪個檔|是什麼|有哪些|摘要|總結|整理清單|顯示|看一下|讀取|統計|count|list|find|search|where|which file|show|summari[sz]e|grep)/i;
const MODIFY_INTENT = /(修改|新增|加入|實作|修正|修復|重構|刪除|移除|改成|改為|調整|更新|部署|發布|建立|寫入|commit|push|fix|implement|refactor|add|remove|delete|update|change|create|write|deploy|migrate)/i;
const ANALYSIS_INTENT = /(分析|設計|為什麼|原因|根因|評估|比較|建議|規劃|計畫|審查|review|analy[sz]e|design|why|evaluate|plan|propose|architecture|架構)/i;
const FAILURE_SIGNAL = /(\[router:fail\]|還是不行|仍然失敗|依然失敗|又失敗|還是失敗|仍然錯誤|還是錯|沒有用|沒用|still (fail|broken|not working)|doesn'?t work|didn'?t work)/i;
const SUCCESS_SIGNAL = /(\[router:resolved\]|已解決|解決了|成功了|可以了|修好了|通過了|works now|fixed now|resolved)/i;
const RESET_SIGNAL = /\[router:reset\]/i;
const IGNORE_PATTERNS = [
  /^\s*\//, // slash command
  /^\s*!/, // shell passthrough
  /<task-notification>/i,
  /<system-reminder>/i,
  /<ci-monitor-event>/i,
  /<command-(name|message|args)>/i,
  /^\s*\[Artifact comment/i,
  /^\s*<[a-z-]+-event\b/i,
];
const FILE_PATH = /(?:[\w.-]+[\\/])+[\w.-]+\.[a-z0-9]{1,6}|\b[\w-]+\.(?:m?js|cjs|ts|py|ps1|sql|json|jsonc|md|css|html|toml|yaml|yml)\b/gi;

function env(name) {
  return process.env[`${ENV_PREFIX}_${name}`];
}

export function shouldIgnore(prompt) {
  if (typeof prompt !== 'string') return true;
  const text = prompt.trim();
  if (!text) return true;
  return IGNORE_PATTERNS.some((re) => re.test(text));
}

function scoreAxis(axis, text) {
  let best = { score: axis.base, reason: null };
  let matched = false;
  for (const [score, re, label] of axis.rules) {
    if (re.test(text)) {
      if (!matched || score > best.score) best = { score, reason: label };
      matched = true;
    }
  }
  return best;
}

export function detectScope(text) {
  const files = new Set((text.match(FILE_PATH) || []).map((f) => f.toLowerCase()));
  if (PROFILE.crossModuleHints.test(text)) return 'cross-module';
  if (files.size >= 3) return 'cross-module';
  if (files.size >= 2) return 'module';
  if (files.size === 1) return 'single-file';
  if (PROFILE.moduleHints.test(text)) return 'module';
  return 'unknown';
}

export function verificationCost(text, scope) {
  if (PROFILE.highVerification.test(text)) return 'high';
  if (scope === 'cross-module') return 'high';
  if (PROFILE.lowVerification.test(text) && !MODIFY_INTENT.test(text.replace(PROFILE.lowVerification, ''))) return 'low';
  if (PROFILE.lowVerification.test(text)) return 'low';
  return 'medium';
}

export function classify(prompt) {
  const text = String(prompt).slice(0, 8000);
  const risk = scoreAxis(PROFILE.risk, text);
  const complexity = scoreAxis(PROFILE.complexity, text);
  const reasoning = scoreAxis(PROFILE.reasoning, text);
  const uncertainty = scoreAxis(PROFILE.uncertainty, text);
  const scope = detectScope(text);
  const verification = verificationCost(text, scope);
  const readOnly = READ_ONLY_INTENT.test(text) && !MODIFY_INTENT.test(text);
  const analysis = ANALYSIS_INTENT.test(text);
  return {
    scores: {
      complexity: complexity.score,
      risk: risk.score,
      reasoning: reasoning.score,
      uncertainty: uncertainty.score,
    },
    scope,
    verification,
    readOnly,
    analysis,
    reasons: [
      risk.reason && `風險：${risk.reason}`,
      complexity.reason && `複雜度：${complexity.reason}`,
      reasoning.reason && `推理：${reasoning.reason}`,
      uncertainty.reason && `不確定性：${uncertainty.reason}`,
    ].filter(Boolean),
  };
}

// 依 MODEL_ROUTING.md 的五條規則判斷，回傳 TIERS 索引。
export function baseTier(c) {
  const s = c.scores;
  // 唯讀查詢不改變系統，主題敏感也不提高動作風險；範圍不明時只接受低複雜度查詢。
  if (c.readOnly && !c.analysis && (c.scope !== 'unknown' || s.complexity <= 2)) return { tier: 0, rule: 1 };
  if (s.risk >= 4 && (s.reasoning >= 5 || s.uncertainty >= 4)) return { tier: 4, rule: 2 };
  if (s.risk >= 4) return { tier: 3, rule: 3 };
  if (s.complexity >= 4 || s.reasoning >= 4 || s.uncertainty >= 4 || c.verification === 'high') return { tier: 2, rule: 4 };
  return { tier: 1, rule: 5 };
}

export function emptyState() {
  return { version: 1, failures: 0, floor: null, maxed: false, lastTier: null, updatedAt: null, attempts: [] };
}

// 升降級：兩次失敗訊號升一級並保留下限；成功或 reset 清除。
export function applyState(prompt, state, tier) {
  const incoming=state && typeof state==='object' ? state : {};
  const validTier=value=>Number.isInteger(value)&&value>=0&&value<TIERS.length?value:null;
  const next={...emptyState(),failures:Number.isInteger(incoming.failures)&&incoming.failures>=0&&incoming.failures<2?incoming.failures:0,floor:validTier(incoming.floor),lastTier:validTier(incoming.lastTier),maxed:incoming.maxed===true,attempts:Array.isArray(incoming.attempts)?incoming.attempts.filter(x=>typeof x==='string').slice(-32):[]};
  const events = [];
  let effective = tier;
  if (RESET_SIGNAL.test(prompt) || SUCCESS_SIGNAL.test(prompt)) {
    if (next.failures || next.floor !== null) events.push('resolved: 重置失敗次數與升級下限');
    Object.assign(next, emptyState());
  } else if (FAILURE_SIGNAL.test(prompt)) {
    const attempt=prompt.match(/\[router:fail\]\s*attempt=([^;\n]+);\s*evidence=([^;\n]+);\s*change=([^;\n]+)/i);
    const signature=attempt ? hash('method:'+attempt[3].trim().toLowerCase()) : null;
    const attemptId=attempt ? hash('id:'+attempt[1].trim()) : null;
    if(!signature || next.attempts.includes(signature) || next.attempts.includes(attemptId))return {state:next,tier:Math.max(tier,next.floor??-1),events:['ignored: 缺少證據、調整方法或重複同一嘗試／方法']};
    next.attempts=[...next.attempts,signature,attemptId].slice(-32);
    // 失敗回報延續同一問題：以該問題目前的等級計算，不因回報文字簡短而降級。
    effective = Math.max(tier, Number.isInteger(next.lastTier) ? next.lastTier : -1);
    next.failures += 1;
    events.push(`failure: 記錄第 ${next.failures} 次失敗回報`);
    if (next.failures >= 2) {
      const current = Math.max(effective, Number.isInteger(next.floor) ? next.floor : -1);
      if (current >= TIERS.length - 1) {
        next.maxed = true;
        next.floor = TIERS.length - 1;
        events.push('maxed: 已在最高級，請整理證據、已排除假設與缺少資訊交由使用者決定');
      } else {
        next.floor = current + 1;
        events.push(`escalated: 升級下限設為 ${TIERS[next.floor].agent}`);
      }
      next.failures = 0;
    }
  }
  const floor = Number.isInteger(next.floor) ? next.floor : -1;
  const finalTier = Math.max(effective, floor);
  next.lastTier = finalTier;
  return { state: next, tier: finalTier, events };
}

export function route(prompt, state = emptyState()) {
  const c = classify(prompt);
  const base = baseTier(c);
  const applied = applyState(String(prompt), state, base.tier);
  const t = TIERS[applied.tier];
  return {
    recommendation: { agent: t.agent, model: t.model, effort: t.effort },
    rule: base.rule,
    baseAgent: TIERS[base.tier].agent,
    scores: c.scores,
    scope: c.scope,
    verificationCost: c.verification,
    readOnly: c.readOnly,
    reasons: c.reasons,
    escalation: {
      failures: applied.state.failures,
      floor: Number.isInteger(applied.state.floor) ? TIERS[applied.state.floor].agent : null,
      maxed: applied.state.maxed,
      events: applied.events,
    },
    state: applied.state,
  };
}

// ---------------------------------------------------------------------------
// 狀態檔：依專案與 session 隔離。
// ---------------------------------------------------------------------------
function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16);
}

export function statePath(projectDir, sessionId) {
  const root = env('STATE_DIR') || path.join(os.tmpdir(), 'claude-model-router');
  return path.join(root, hash(path.resolve(projectDir || '.').toLowerCase()), `${hash(sessionId || 'no-session')}.json`);
}

export function readState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || parsed.version !== 1) return emptyState();
    return parsed;
  } catch {
    return emptyState();
  }
}

export function writeState(file, state) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
    fs.renameSync(tmp, file);
    return true;
  } catch {
    return false;
  }
}

export function formatContext(result, saved) {
  const payload = {
    recommendation: result.recommendation,
    rule: result.rule,
    baseAgent: result.baseAgent,
    scores: result.scores,
    scope: result.scope,
    verificationCost: result.verificationCost,
    reasons: result.reasons,
    escalation: result.escalation,
    stateSaved: saved,
  };
  return [
    '<model-router>',
    '建議僅供參考：此 hook 不會切換主 session 的模型或 effort。請讀取實際內容後依 MODEL_ROUTING.md 重新判斷；小任務直接處理，不為分級而開 agent。',
    JSON.stringify(payload),
    '</model-router>',
  ].join('\n');
}

export function handle(rawInput) {
  if (env('DISABLED') === '1') return null;
  let input;
  try {
    input = JSON.parse(rawInput);
  } catch {
    return null;
  }
  if (!input || typeof input !== 'object') return null;
  if (input.hook_event_name && input.hook_event_name !== 'UserPromptSubmit') return null;
  if (shouldIgnore(input.prompt)) return null;
  const projectDir = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const file = statePath(projectDir, input.session_id);
  const result = route(input.prompt, readState(file));
  const saved = writeState(file, result.state);
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: formatContext(result, saved),
    },
  };
}

async function main() {
  let raw = '';
  try {
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      raw += chunk;
      if (raw.length > 1_000_000) break;
    }
    const out = handle(raw);
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {
    // 不阻斷使用者需求。
  }
  process.exitCode = 0;
}

const invokedDirectly = (() => {
  try {
    return process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();
if (invokedDirectly) main();

export const __filename = fileURLToPath(import.meta.url);
