import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const {routing, validateChanges, validateReview, autoEligible, canMerge} = createRequire(import.meta.url)('../scripts/ci/ai-policy.cjs');
const {prepareReview, finalizeReview} = createRequire(import.meta.url)('../scripts/ci/github-automation.cjs');
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
  const good = {enabled: 'true', approved: true, reviewedSha: 'a', currentSha: 'a', ciSha: 'a', ciConclusion: 'success', draft: false, sameRepo: true,
    base: 'develop', reviewedBase: 'develop', baseSha: 'base-a', reviewedBaseSha: 'base-a', eligible: true};
  assert.equal(canMerge(good), true);
  for (const base of ['main', 'release/1.0', 'feature/parent']) assert.equal(canMerge({...good, base, reviewedBase: base}), true);
  for (const bad of [{currentSha: 'b'}, {ciSha: 'b'}, {approved: false}, {ciConclusion: 'failure'}, {draft: true}, {sameRepo: false}, {eligible: false}, {enabled: 'false'},
    {base: 'main'}, {base: ''}, {reviewedBase: undefined}, {baseSha: 'base-b'}, {baseSha: ''}, {reviewedBaseSha: undefined}]) assert.equal(canMerge({...good, ...bad}), false);
});
test('GitHub 合併綁定審查 SHA，拒絕推送競態與失敗的最新 CI', async () => {
  const saved = {...process.env};
  Object.assign(process.env, {AI_RESULT: JSON.stringify({approved: true, summary: '測試與需求符合', findings: []}),
    PR_NUMBER: '8', REVIEWED_SHA: 'head-a', REVIEWED_BASE_REF: 'main', REVIEWED_BASE_SHA: 'base-a', REVIEW_ENGINE: 'codex', AI_AUTO_MERGE: 'true'});
  try {
    const calls = [], context = {repo: {owner: 'test', repo: 'board'}};
    let head = 'head-a', conclusion = 'success', base = 'main', baseSha = 'base-a';
    let ciBranch = 'feature/test', ciBase = 'main', ciBaseSha = 'base-a', ciPr = 8, headRepo = 'test/board';
    const github = {rest: {pulls: {
      get: async () => ({data: {state: 'open', head: {ref: 'feature/test', sha: head, repo: {full_name: headRepo}}, base: {ref: base, sha: baseSha, repo: {full_name: 'test/board'}}, draft: false}}),
      createReview: async args => calls.push(['review', args.commit_id, args.event]),
      listFiles: () => {},
      merge: async args => { calls.push(['merge', args.sha]); return {data: {merged: true}}; }
    }, actions: {
      listWorkflowRuns: async () => ({data: {workflow_runs: [{id: 2, head_branch: ciBranch, head_sha: 'head-a', conclusion,
        pull_requests: [{number: ciPr, base: {ref: ciBase, sha: ciBaseSha}}]}, {id: 1, head_sha: 'head-a', conclusion: 'success'}]}}),
      createWorkflowDispatch: async args => calls.push(['deploy', args.workflow_id])
    }}, paginate: async () => [{filename: 'sites/demo/demo.js', status: 'modified'}]};
    const core = {notice() {}, setFailed: message => {throw Error(message);}};
    await finalizeReview({github, context, core});
    assert.deepEqual(calls, [['review', 'head-a', 'COMMENT'], ['merge', 'head-a'], ['deploy', 'pages.yml']]);
    calls.length = 0; head = 'head-b';
    await assert.rejects(finalizeReview({github, context, core}), /舊審查/); assert.deepEqual(calls, []);
    head = 'head-a'; conclusion = 'failure';
    await finalizeReview({github, context, core}); assert.deepEqual(calls, [['review', 'head-a', 'COMMENT']]);
    conclusion = 'success'; calls.length = 0;
    base = 'develop';
    await assert.rejects(finalizeReview({github, context, core}), /變更目標/); assert.deepEqual(calls, []);
    process.env.REVIEWED_BASE_REF = 'develop'; ciBase = 'develop';
    await finalizeReview({github, context, core});
    assert.deepEqual(calls, [['review', 'head-a', 'COMMENT'], ['merge', 'head-a']]);
    calls.length = 0; baseSha = 'base-b';
    await assert.rejects(finalizeReview({github, context, core}), /舊審查/); assert.deepEqual(calls, []);
    baseSha = 'base-a';
    for (const mismatch of ['branch', 'target', 'base-sha', 'pr', 'fork']) {
      ciBranch = mismatch === 'branch' ? 'other' : 'feature/test';
      ciBase = mismatch === 'target' ? 'main' : 'develop';
      ciBaseSha = mismatch === 'base-sha' ? 'stale' : 'base-a';
      ciPr = mismatch === 'pr' ? 99 : 8;
      headRepo = mismatch === 'fork' ? 'external/fork' : 'test/board';
      calls.length = 0;
      await finalizeReview({github, context, core});
      assert.deepEqual(calls, [['review', 'head-a', 'COMMENT']], mismatch);
    }
  } finally { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env, saved); }
});

test('CI 審查支援其他目標分支、明確 PR 派工與多個 PR 的對應', async () => {
  const savedMode = process.env.AI_MODE, cwd = process.cwd();
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'taskboard-ai-review-'));
  process.chdir(scratch); process.env.AI_MODE = 'both';
  try {
    const repo = {full_name: 'test/board'};
    const pr = {number: 8, state: 'open', draft: false, user: {login: 'owner'},
      head: {ref: 'feature/test', sha: 'head-a', repo}, base: {ref: 'release/1.0', sha: 'base-a', repo}};
    const link = {number: 8, base: {ref: 'release/1.0', sha: 'base-a'}};
    const outputs = {}, notices = [];
    let candidates = [pr], files = [{filename: 'sites/demo/demo.js'}], permission = 'admin';
    const source = {conclusion: 'success', head_repository: repo, head_sha: 'head-a', head_branch: 'feature/test', workflow_id: 1, pull_requests: [link]};
    const context = {repo: {owner: 'test', repo: 'board'}, actor: 'owner', payload: {workflow_run: source}};
    const github = {rest: {
      repos: {getCollaboratorPermissionLevel: async () => ({data: {permission}}), listPullRequestsAssociatedWithCommit() {}},
      actions: {getWorkflow: async () => ({data: {path: '.github/workflows/ci.yml'}})},
      pulls: {get: async args => ({data: args.mediaType ? 'diff for release/1.0' : pr}), listFiles() {}}
    }, paginate: async method => method === github.rest.pulls.listFiles ? files : candidates};
    const core = {setOutput: (name, value) => {outputs[name] = value;}, notice: value => notices.push(value)};
    const run = async () => {
      for (const key of Object.keys(outputs)) delete outputs[key];
      await prepareReview({github, context, core});
    };
    await run();
    assert.equal(outputs.pr, 8); assert.equal(outputs.base_ref, 'release/1.0'); assert.equal(outputs.base_sha, 'base-a');
    assert.match(outputs.prompt, /work\/ai\/base/); assert.match(outputs.prompt, /release\/1\.0/);
    assert.equal(fs.readFileSync('work/ai/review.diff', 'utf8'), 'diff for release/1.0');
    candidates = [pr, {...pr, number: 9, base: {...pr.base, ref: 'main'}}];
    await run(); assert.equal(outputs.pr, 8);
    source.pull_requests = [];
    await run(); assert.equal(outputs.pr, undefined); assert.match(notices.at(-1), /唯一對應/);
    context.payload = {inputs: {pr_number: '8'}};
    await run(); assert.equal(outputs.pr, 8);
    permission = 'read';
    await assert.rejects(run(), /維護者/);
    context.payload = {workflow_run: source}; candidates = [pr];
    await run(); assert.equal(outputs.pr, undefined);
    permission = 'admin';
    pr.head.repo = {full_name: 'external/fork'};
    await run(); assert.equal(outputs.pr, undefined);
    pr.head.repo = repo; files = [{filename: 'outputs/taskboard/server.py'}];
    await run(); assert.equal(outputs.pr, undefined);
    files = [{filename: 'sites/demo/demo.js'}]; pr.draft = true;
    await run(); assert.equal(outputs.pr, undefined);
    pr.draft = false; source.pull_requests = [link]; link.base.sha = 'old-base';
    await run(); assert.equal(outputs.pr, undefined);
    link.base.sha = 'base-a'; source.conclusion = 'failure';
    await run(); assert.equal(outputs.pr, undefined);
    source.conclusion = 'success'; source.head_repository = {full_name: 'external/fork'};
    await run(); assert.equal(outputs.pr, undefined);
  } finally {
    process.chdir(cwd); fs.rmSync(scratch, {recursive: true, force: true});
    if (savedMode === undefined) delete process.env.AI_MODE; else process.env.AI_MODE = savedMode;
  }
});
