// Runs with `claude plugin test <mod folder>`: the board service is mocked beneath the plugin.
import { test, expect, mock } from 'claude-code/testing'

const PAGE = "<html><script>const TOKEN='fixture-token';</script></html>"
const STATE = {
  automatic: true, connected: true, activeId: null,
  tools: { codex: { available: true }, claude: { available: true } },
  approvals: [{ id: 'claude:perm-1', tool: 'claude', method: 'claude/can_use_tool', params: { toolName: 'Bash', input: { command: 'node -e 1' }, threadId: 's' } }],
  tasks: [
    { id: 't1', title: '測試任務一', status: 'todo', priority: 'high', tool: 'claude', model: 'haiku', version: 1, error: '', nextRun: null },
    { id: 't2', title: 'Codex 任務', status: 'in_review', priority: 'medium', tool: 'codex', model: '', version: 2, error: '' },
    { id: 't3', title: '被阻擋的卡片', status: 'todo', priority: 'medium', tool: 'claude', model: 'sonnet', effort: 'high', version: 1, error: '', dependsOn: ['t2'], plan: { name: '計畫甲', key: 'b' } },
    { id: 'session:x', readOnly: true, tool: 'codex', title: '唯讀同步卡片', status: 'backlog', priority: 'medium' },
    { id: 'session:claude:y', readOnly: true, tool: 'claude', title: '唯讀 Claude 卡片', status: 'backlog', priority: 'medium' },
  ],
}
const PANE_PROPS = { title: '任務看板', isFocused: false, bodyColumns: 90, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 40 }, view: {} }

test('new task reuses project folders, permits new names, and accepts or cancels a folder choice', async ($, on) => {
  mock.clock(on)
  let cancelled = false
  const state = { ...STATE, tasks: [
    ...STATE.tasks,
    { id: 'p1', title: '既有專案', project: '唯一專案', cwd: 'C:\\專案 中文', status: 'backlog' },
    { id: 'p2', title: '路徑一', project: '多路徑專案', cwd: 'C:\\甲', status: 'backlog' },
    { id: 'p3', title: '路徑二', project: '多路徑專案', cwd: 'C:\\乙', status: 'backlog' },
  ] }
  on('http.fetch', async (_$, e) => {
    const data = e.url.endsWith('47824/') ? PAGE : e.url.endsWith('/api/state') ? JSON.stringify(state)
      : e.url.includes('/api/models') ? '{"models":[]}'
        : e.url.endsWith('/api/folders/select') ? JSON.stringify(cancelled ? { id: 'job', status: 'cancelled' } : { id: 'job', status: 'selected', path: 'C:\\選擇 資料夾' }) : '{}'
    return { value: { status: 200, ok: true, headers: {}, text: data } }
  })
  const ui = await $.ui.mount({ plugin: 'taskboard-pane', surface: 'desktop', component: 'Pane', requestId: 'taskboard', props: PANE_PROPS,
    viewport: { columns: 120, rows: 60, isFullscreen: true } })
  await $.ui.press({ plugin: 'taskboard-pane', key: 'refresh', surface: 'desktop' })
  expect(Boolean(await ui.find({ text: /^列管/ }))).toBe(true)
  expect(Boolean(await ui.find({ text: /積壓/ }))).toBe(false)
  await $.ui.press({ plugin: 'taskboard-pane', key: 'new-card', surface: 'desktop' })
  await $.ui.select({ plugin: 'taskboard-pane', key: 'existing-project', value: '唯一專案', surface: 'desktop' })
  expect((await ui.find({ key: 'new-project' }))?.props.value).toBe('唯一專案')
  expect((await ui.find({ key: 'new-cwd' }))?.props.value).toBe('C:\\專案 中文')
  await $.ui.select({ plugin: 'taskboard-pane', key: 'existing-project', value: '多路徑專案', surface: 'desktop' })
  expect((await ui.find({ key: 'new-cwd' }))?.props.value).toBe('')
  await $.ui.select({ plugin: 'taskboard-pane', key: 'existing-cwd', value: 'C:\\乙', surface: 'desktop' })
  expect((await ui.find({ key: 'new-cwd' }))?.props.value).toBe('C:\\乙')
  await $.ui.input({ plugin: 'taskboard-pane', key: 'new-project', text: '新專案名稱', kind: 'change', surface: 'desktop' })
  expect((await ui.find({ key: 'new-project' }))?.props.value).toBe('新專案名稱')
  expect((await ui.find({ key: 'new-cwd' }))?.props.value).toBe('')
  await $.ui.press({ plugin: 'taskboard-pane', key: 'pick-folder', surface: 'desktop' })
  expect((await ui.find({ key: 'new-cwd' }))?.props.value).toBe('C:\\選擇 資料夾')
  cancelled = true
  await $.ui.press({ plugin: 'taskboard-pane', key: 'pick-folder', surface: 'desktop' })
  expect((await ui.find({ key: 'new-cwd' }))?.props.value).toBe('C:\\選擇 資料夾')
  await $.ui.press({ plugin: 'taskboard-pane', key: 'cancel-card', surface: 'desktop' })
  await ui.unmount()
})

test('pane shows tasks with tool badges and approvals; buttons call the board API', async ($, on) => {
  mock.clock(on)
  const calls: { url: string; method?: string; body?: string; token?: string }[] = []
  on('http.fetch', async (_$, e) => {
    calls.push({ url: e.url, method: e.init?.method, body: e.init?.body, token: e.init?.headers?.['X-Board-Token'] })
    if (e.url.endsWith('47824/')) return { value: { status: 200, ok: true, headers: {}, text: PAGE } }
    if (e.url.endsWith('/api/state')) return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(STATE) } }
    if (e.url.includes('/api/models')) return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ models: e.url.includes('tool=claude') ? [{ model: 'haiku', displayName: 'Haiku' }] : [{ model: 'gpt-fixture', displayName: 'GPT fixture' }] }) } }
    if (e.url.endsWith('/api/plans') && e.init?.method === 'POST') { const plan = JSON.parse(e.init.body || '{}'); return { value: { status: 201, ok: true, headers: {}, text: JSON.stringify({ planId: 'p1', name: plan.name, order: plan.items.map((i: any) => i.key), tasks: plan.items.map((i: any, n: number) => ({ id: 'pt' + n, title: i.title, tool: i.tool || 'claude', model: 'sonnet', effort: 'medium', status: 'backlog', dependsOn: i.dependsOn || [], plan: { key: i.key } })) }) } } }
    if (e.url.endsWith('/api/tasks') && e.init?.method === 'POST') return { value: { status: 201, ok: true, headers: {}, text: JSON.stringify({ id: 'new1', ...JSON.parse(e.init.body || '{}') }) } }
    return { value: { status: 200, ok: true, headers: {}, text: '{"ok":true}' } }
  })
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'taskboard-pane', surface, component: 'Pane', requestId: 'taskboard', props: PANE_PROPS,
      viewport: { columns: 120, rows: 50, isFullscreen: true } })
    await $.ui.press({ plugin: 'taskboard-pane', key: 'refresh', surface })
    expect(Boolean(await ui.find({ text: /測試任務一/ }))).toBe(true)
    expect(Boolean(await ui.find({ text: /\[Claude Code\]/ }))).toBe(true)
    expect(Boolean(await ui.find({ text: /\[Codex\]/ }))).toBe(true)
    expect(Boolean(await ui.find({ text: /唯讀同步卡片/ }))).toBe(false) // read-only session cards stay in the web board
    expect(Boolean(await ui.find({ text: /Codex 1 · Claude Code 1/ }))).toBe(true)
    expect(Boolean(await ui.find({ text: /請求核准工具：Bash/ }))).toBe(true)
    expect(Boolean(await ui.find({ text: /等待前置：Codex 任務/ }))).toBe(true)
    expect(Boolean(await ui.find({ key: 'start-t3' }))).toBe(false) // blocked cards get no start button
    await $.ui.press({ plugin: 'taskboard-pane', key: 'force-t3', surface })
    expect(calls.some(c => c.url.endsWith('/api/tasks/t3/start') && c.body === '{"force":true}')).toBe(true) // the explicit override
    expect(Boolean(await ui.find({ text: /sonnet\/high · 計畫甲 · b/ }))).toBe(true)
    await $.ui.press({ plugin: 'taskboard-pane', key: 'accept-claude:perm-1', surface })
    expect(calls.some(c => c.url.endsWith('/api/approvals/claude%3Aperm-1') && c.method === 'POST' && c.body === '{"decision":"accept"}')).toBe(true)
    await $.ui.press({ plugin: 'taskboard-pane', key: 'start-t1', surface })
    expect(calls.some(c => c.url.endsWith('/api/tasks/t1/start') && c.method === 'POST')).toBe(true)
    await $.ui.press({ plugin: 'taskboard-pane', key: 'done-t2', surface })
    expect(calls.some(c => c.url.endsWith('/api/tasks/t2') && c.method === 'PATCH' && c.body === '{"version":2,"status":"done"}')).toBe(true)
    expect(calls.filter(c => c.url.endsWith('/api/state')).every(c => c.token === 'fixture-token')).toBe(true)
    // Create a card from the pane: open the form, fill it, pick Claude Code and its model, submit.
    const check = async (cond: boolean, label: string) => { if (!cond) { const texts = (await ui.findAll({ type: 'Input' })).map(t => t.key + '=' + JSON.stringify(t.props.value)).join(','); throw new Error('FAILED ' + label + ' inputs=' + texts + ' calls=' + JSON.stringify(calls.map(c => (c.method || 'GET') + ' ' + c.url + ' ' + (c.body || '')))) } }
    await $.ui.press({ plugin: 'taskboard-pane', key: 'new-card', surface })
    await check(Boolean(await ui.find({ key: 'new-title' })), 'form opened')
    await $.ui.input({ plugin: 'taskboard-pane', key: 'new-title', text: '窗格建立的卡片', kind: 'change', surface })
    await $.ui.input({ plugin: 'taskboard-pane', key: 'new-description', text: '驗收：列出檔案', kind: 'change', surface })
    await $.ui.select({ plugin: 'taskboard-pane', key: 'new-tool', value: 'claude', surface })
    // The catalogue is cached in $.state across redraws (and across this loop's surfaces), so assert the offered options, not a fetch.
    const modelSelect = await ui.find({ key: 'new-model' })
    await check(JSON.stringify(modelSelect?.props.options ?? []).includes('"haiku"'), 'claude models offered')
    await $.ui.select({ plugin: 'taskboard-pane', key: 'new-model', value: 'haiku', surface })
    await $.ui.select({ plugin: 'taskboard-pane', key: 'new-priority', value: 'high', surface })
    await $.ui.select({ plugin: 'taskboard-pane', key: 'new-status', value: 'todo', surface })
    await $.ui.press({ plugin: 'taskboard-pane', key: 'create-card', surface })
    const created = calls.find(c => c.url.endsWith('/api/tasks') && c.method === 'POST')
    await check(Boolean(created), 'task POSTed')
    expect(JSON.parse(created!.body || '{}')).toEqual({ title: '窗格建立的卡片', description: '驗收：列出檔案', tool: 'claude', model: 'haiku', priority: 'high', status: 'todo' })
    await check(!(await ui.find({ key: 'new-title' })), 'form closed after create')
    // An empty title never reaches the service.
    const before = calls.length
    await $.ui.press({ plugin: 'taskboard-pane', key: 'new-card', surface })
    await $.ui.press({ plugin: 'taskboard-pane', key: 'create-start', surface })
    await check(!calls.slice(before).some(c => c.url.endsWith('/api/tasks') && c.method === 'POST'), 'empty title not posted')
    await $.ui.press({ plugin: 'taskboard-pane', key: 'cancel-card', surface })
    await ui.unmount()
    calls.length = 0
  }
})

test('an unreachable board service is reported in the pane instead of failing the draw', async ($, on) => {
  mock.clock(on)
  on('http.fetch', async () => { throw new Error('ECONNREFUSED 127.0.0.1:47824') })
  const ui = await $.ui.mount({ plugin: 'taskboard-pane', surface: 'desktop', component: 'Pane', requestId: 'taskboard', props: PANE_PROPS,
    viewport: { columns: 100, rows: 40, isFullscreen: true } })
  await $.ui.press({ plugin: 'taskboard-pane', key: 'refresh', surface: 'desktop' })
  expect(Boolean(await ui.find({ text: /無法連線看板服務/ }))).toBe(true)
  await ui.unmount()
})

test('the import_plan tool files a plan through the board API and reports the created cards', async ($, on) => {
  mock.clock(on)
  const posted: string[] = []
  on('http.fetch', async (_$, e) => {
    if (e.url.endsWith('47824/')) return { value: { status: 200, ok: true, headers: {}, text: PAGE } }
    if (e.url.endsWith('/api/plans')) { posted.push(e.init?.body || ''); const plan = JSON.parse(e.init?.body || '{}'); return { value: { status: 201, ok: true, headers: {}, text: JSON.stringify({ planId: 'p9', name: plan.name, order: ['a', 'b'], tasks: [
      { id: 'x1', title: 'A', tool: 'claude', model: 'sonnet', effort: 'medium', status: 'backlog', dependsOn: [], plan: { key: 'a' } },
      { id: 'x2', title: 'B', tool: 'codex', model: '', effort: '', status: 'backlog', dependsOn: ['x1'], plan: { key: 'b' } }] }) } } }
    if (e.url.endsWith('/api/state')) return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(STATE) } }
    return { value: { status: 200, ok: true, headers: {}, text: '{}' } }
  })
  const out = await $.tool.call({ tool: 'mcp__taskboard-pane__import_plan', name: '功能甲', items: [{ key: 'a', title: 'A', role: 'developer' }, { key: 'b', title: 'B', tool: 'codex', dependsOn: ['a'] }] } as any)
  expect(posted.length).toBe(1)
  expect(JSON.parse(posted[0]).items[1].dependsOn).toEqual(['a'])
  expect(JSON.stringify(out)).toContain('已建立 2 張卡片')
  expect(JSON.stringify(out)).toContain('a → b')
})

test('the mod relays Claude App sidebar groups to the board as session projects', async ($, on) => {
  const clock = mock.clock(on)
  const posted: string[] = []
  on('mcp.call', async (_$, e) => {
    if (e.server === 'ccd_session_mgmt' && e.tool === 'list_sessions') return { value: { isError: false, content: [{ type: 'text', text: JSON.stringify([
      { sessionId: 'local_a', title: 'A', group: { id: 'cg-1', name: '交易工具' } },
      { sessionId: 'local_b', title: 'B', group: null },
      { sessionId: 'local_c', title: 'C', group: { id: 'cg-2', name: '股魚魚缸網頁' } }]) }] } }
    return { value: { isError: true, content: [] } }
  })
  on('http.fetch', async (_$, e) => {
    if (e.url.endsWith('47824/')) return { value: { status: 200, ok: true, headers: {}, text: PAGE } }
    if (e.url.endsWith('/api/claude-groups')) { posted.push(e.init?.body || ''); return { value: { status: 200, ok: true, headers: {}, text: '{"ok":true}' } } }
    if (e.url.endsWith('/api/state')) return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(STATE) } }
    return { value: { status: 200, ok: true, headers: {}, text: '{}' } }
  })
  const ui = await $.ui.mount({ plugin: 'taskboard-pane', surface: 'desktop', component: 'Pane', requestId: 'taskboard', props: PANE_PROPS,
    viewport: { columns: 100, rows: 40, isFullscreen: true } })
  await $.ui.press({ plugin: 'taskboard-pane', key: 'refresh', surface: 'desktop' })
  await clock.settle()
  expect(posted.length).toBe(1)
  const body = JSON.parse(posted[0])
  expect(body.sessions.map((s: any) => s.sessionId)).toEqual(['local_a', 'local_c'])
  expect(body.sessions[0].group.name).toBe('交易工具')
  await $.ui.press({ plugin: 'taskboard-pane', key: 'refresh', surface: 'desktop' })
  expect(posted.length).toBe(1) // unchanged mapping is not re-sent
  await ui.unmount()
})

test('a reopen button with hotkey 9 sits above the prompt only while the pane is closed, beneath other bands', async ($, on) => {
  mock.clock(on)
  on('http.fetch', async () => ({ value: { status: 200, ok: true, headers: {}, text: '{}' } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ plugin: 'taskboard-pane', surface, component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 80, scroll: { offset: 0, bodyRows: 6 }, view: {} } as any,
      viewport: { columns: 100, rows: 40, isFullscreen: true } })
    const button = await band.find({ key: 'open-taskboard' })
    expect(Boolean(button)).toBe(true)
    expect(button?.props.hotkey).toBe('9')
    await band.unmount()
  }
})
