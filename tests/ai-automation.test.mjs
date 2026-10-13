import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {routing, validateChanges, validateReview, autoEligible, canMerge} = createRequire(import.meta.url)('../scripts/ci/ai-policy.cjs');
const {finalizeReview} = createRequire(import.meta.url)('../scripts/ci/github-automation.cjs');
test('單一工具與雙工具的路由不混用', () => {
  assert.deepEqual(routing('claude'), {mode: 'claude', implementer: 'claude', reviewer: 'claude'});
  assert.deepEqual(routing('codex'), {mode: 'codex', implementer: 'codex', reviewer: 'codex'});
  assert.deepEqual(routing('both'), {mode: 'both', implementer: 'claude', reviewer: 'codex'});
  assert.throws(() => routing('off'));
});
test('拒絕路徑穿越、認證、CI 修改、重複與過大檔案', () => {
  for (const path of ['../x', '.github/workflows/ci.yml', 'outputs/taskboard/.data/token', 'tests/../secret.py', 'tests/x.py\n'])
    assert.throws(() => validateChanges({summary: '測試', files: [{path, content: ''}]}));
  assert.throws(() => validateChanges({summary: '測試', files: [{path: 'README.md', content: 'x'.repeat(200001)}]}));
  assert.equal(autoEligible([{filename: 'outputs/taskboard/server.py'}]), false);
  assert.equal(autoEligible([{filename: 'sites/demo/demo.js'}]), true);
});
test('核准必须无問題；最新 SHA 與 CI 通過才可合併', () => {
  assert.throws(() => validateReview({approved: true, summary: '有問題', findings: ['缺測試']}));
  assert.throws(() => validateReview({approved: 'true', summary: '格式錯誤', findings: []}));
  const good = {enabled: 'true', approved: true, reviewedSha: 'a', currentSha: 'a', ciSha: 'a', ciConclusion: 'success', draft: false, sameRepo: true, base: 'main', eligible: true};
  assert.equal(canMerge(good), true);
  for (const bad of [{currentSha: 'b'}, {ciSha: 'b'}, {approved: false}, {ciConclusion: 'failure'}, {draft: true}, {sameRepo: false}, {eligible: false}, {enabled: 'false'}]) assert.equal(canMerge({...good, ...bad}), false);
});
test('GitHub 合併綁定審查 SHA，拒絕推送競態與失敗的最新 CI', async () => {
  const saved = {...process.env};
  Object.assign(process.env, {AI_RESULT: JSON.stringify({approved: true, summary: '測試與需求符合', findings: []}),
    PR_NUMBER: '8', REVIEWED_SHA: 'head-a', REVIEW_ENGINE: 'codex', AI_AUTO_MERGE: 'true'});
  try {
    const calls = [], context = {repo: {owner: 'test', repo: 'board'}};
    let head = 'head-a', conclusion = 'success';
    const github = {rest: {pulls: {
      get: async () => ({data: {state: 'open', head: {sha: head, repo: {full_name: 'test/board'}}, base: {ref: 'main'}, draft: false}}),
      createReview: async args => calls.push(['review', args.commit_id, args.event]),
      listFiles: () => {},
      merge: async args => { calls.push(['merge', args.sha]); return {data: {merged: true}}; }
    }, actions: {
      listWorkflowRuns: async () => ({data: {workflow_runs: [{id: 2, head_sha: 'head-a', conclusion}, {id: 1, head_sha: 'head-a', conclusion: 'success'}]}}),
      createWorkflowDispatch: async args => calls.push(['deploy', args.workflow_id])
    }}, paginate: async () => [{filename: 'sites/demo/demo.js', status: 'modified'}]};
    const core = {notice() {}, setFailed: message => {throw Error(message);}};
    await finalizeReview({github, context, core});
    assert.deepEqual(calls, [['review', 'head-a', 'COMMENT'], ['merge', 'head-a'], ['deploy', 'pages.yml']]);
    calls.length = 0; head = 'head-b';
    await assert.rejects(finalizeReview({github, context, core}), /舊審查/); assert.deepEqual(calls, []);
    head = 'head-a'; conclusion = 'failure';
    await finalizeReview({github, context, core}); assert.deepEqual(calls, [['review', 'head-a', 'COMMENT']]);
  } finally { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
});
