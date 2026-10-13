'use strict';
const modes = new Set(['claude', 'codex', 'both']);
function routing(mode) {
  if (!modes.has(mode)) throw Error('AI_MODE 必須設定為 claude、codex 或 both。');
  return {mode, implementer: mode === 'codex' ? 'codex' : 'claude', reviewer: mode === 'claude' ? 'claude' : 'codex'};
}
function permittedPath(name) {
  if (name === '.ai/handoff.md') return true;
  return typeof name === 'string' && /^[\w.\-/\u0080-\uffff]+$/.test(name) &&
    !name.split('/').some(p => !p || p === '.' || p === '..' || p.startsWith('.')) &&
    (['README.md', 'AI_CONTEXT.md'].includes(name) ||
      /^(docs\/.+\.md|tests\/[^/]+\.(py|mjs)|sites\/demo\/[^/]+\.(js|css|html)|outputs\/taskboard\/[^/]+\.(py|js|mjs|html))$/.test(name));
}
function validateChanges(raw) {
  const out = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!out || typeof out.summary !== 'string' || !out.summary.trim() || out.summary.length > 4000 || !Array.isArray(out.files) || !out.files.length || out.files.length > 30) throw Error('AI 修改結果格式不正確。');
  const names = new Set(); let bytes = 0;
  for (const file of out.files) {
    if (!permittedPath(file.path) || names.has(file.path) || typeof file.content !== 'string') throw Error('不允許的檔案路徑或內容：' + file.path);
    names.add(file.path); bytes += Buffer.byteLength(file.content);
  }
  if (bytes > 200000) throw Error('單次 AI 修改超過 200 KB，請拆分需求。');
  return out;
}
function validateReview(raw) {
  const out = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!out || typeof out.approved !== 'boolean' || typeof out.summary !== 'string' || !out.summary.trim() || out.summary.length > 4000 || !Array.isArray(out.findings) || out.findings.some(f => typeof f !== 'string' || f.length > 2000)) throw Error('AI 審查結果格式不正確。');
  if (out.approved && out.findings.length) throw Error('存在問題的審查不能核准。');
  return out;
}
function autoEligible(files) {
  return files.length > 0 && files.every(f => permittedPath(f.filename || f.path) &&
    (f.status !== 'renamed' || permittedPath(f.previous_filename)) &&
    !['AI_CONTEXT.md', 'outputs/taskboard/server.py', 'outputs/taskboard/claude_adapter.py', 'outputs/taskboard/tool_adapters.py'].includes(f.filename || f.path));
}
function canMerge({approved, reviewedSha, currentSha, ciSha, ciConclusion, draft, sameRepo, base, eligible, enabled}) {
  return enabled === 'true' && approved === true && reviewedSha === currentSha && ciSha === currentSha &&
    ciConclusion === 'success' && !draft && sameRepo && base === 'main' && eligible === true;
}
module.exports = {routing, permittedPath, validateChanges, validateReview, autoEligible, canMerge};
