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

test('polling an unchanged board writes no snapshot, so an open Select is not redrawn shut; a change still lands', async ($, on) => {
  const clock = mock.clock(on)
  let state: any = STATE
  let polls = 0
  on('http.fetch', async (_$, e) => {
    if (e.url.endsWith('/api/state')) polls++
    const data = e.url.endsWith('47824/') ? PAGE : e.url.endsWith('/api/state') ? JSON.stringify(state) : '{}'
    return { value: { status: 200, ok: true, headers: {}, text: data } }
  })
  // Every write of an atom the pane read redraws the pane; count the writes of the board snapshot.
  const writes: string[] = []
  on('state.set', async (_$, e: any, next: any) => { writes.push(String(e.key)); return next(e) })
  on('ui.open', () => ({ value: { isPlaced: true } } as any))
  on('command.run', () => ({ text: '' } as any))
  const ui = await $.ui.mount({ plugin: 'taskboard-pane', surface: 'desktop', component: 'Pane', requestId: 'taskboard', props: PANE_PROPS,
    viewport: { columns: 120, rows: 60, isFullscreen: true } })
  await $.command.run({ command: 'taskboard', args: '' } as any)
  await clock.settle()
  const firstWrites = writes.filter(k => k === 'snapshot').length
  expect(firstWrites).toBe(1)
  await clock.advance(30000) // six polls of the same board
  expect(polls).toBeGreaterThan(5)
  expect(writes.filter(k => k === 'snapshot').length).toBe(firstWrites)
  // A new card (or a new approval) is a change: it is written and drawn.
  state = { ...STATE, tasks: [...STATE.tasks, { id: 't9', title: '輪詢後的新卡片', status: 'backlog', priority: 'low', tool: 'codex', version: 1 }] }
  await clock.advance(5000)
  expect(writes.filter(k => k === 'snapshot').length).toBe(firstWrites + 1)
  expect(Boolean(await ui.find({ text: /輪詢後的新卡片/ }))).toBe(true)
  // While the new-task form is open, the board's changes wait; a new approval does not.
  await $.ui.press({ plugin: 'taskboard-pane', key: 'new-card', surface: 'desktop' })
  const opened = writes.filter(k => k === 'snapshot').length
  state = { ...state, tasks: [...state.tasks, { id: 't10', title: '表單開著時的新卡片', status: 'backlog', priority: 'low', tool: 'codex', version: 1 }] }
  await clock.advance(15000)
  expect(writes.filter(k => k === 'snapshot').length).toBe(opened)
  expect(Boolean(await ui.find({ text: /表單開著時的新卡片/ }))).toBe(false)
  expect(Boolean(await ui.find({ key: 'existing-project' }))).toBe(true)
  state = { ...state, approvals: [...STATE.approvals, { id: 'claude:perm-2', tool: 'claude', method: 'claude/can_use_tool', params: { toolName: 'Write', input: {} } }] }
  await clock.advance(5000)
  expect(Boolean(await ui.find({ text: /請求核准工具：Write/ }))).toBe(true)
  await clock.advance(10000)
  const beforeClose = writes.filter(k => k === 'snapshot').length
  await $.ui.press({ plugin: 'taskboard-pane', key: 'cancel-card', surface: 'desktop' })
  expect(writes.filter(k => k === 'snapshot').length).toBe(beforeClose) // already drawn with the approval: nothing new
  await ui.unmount()
})

test('a Claude card without a project is listed as 未分組; other cards stay 個人任務', async ($, on) => {
  mock.clock(on)
  const state = { ...STATE, tasks: [
    { id: 'c1', title: '沒有群組的 Claude 卡片', status: 'backlog', tool: 'claude', project: '' },
    { id: 'c2', title: '沒有專案的 Codex 卡片', status: 'backlog', tool: 'codex', project: '' },
    { id: 'c3', title: '群組卡片', status: 'backlog', tool: 'claude', project: '交易工具' },
  ] }
  on('http.fetch', async (_$, e) => {
    const data = e.url.endsWith('47824/') ? PAGE : e.url.endsWith('/api/state') ? JSON.stringify(state) : '{"models":[]}'
    return { value: { status: 200, ok: true, headers: {}, text: data } }
  })
  const ui = await $.ui.mount({ plugin: 'taskboard-pane', surface: 'desktop', component: 'Pane', requestId: 'taskboard', props: PANE_PROPS,
    viewport: { columns: 120, rows: 60, isFullscreen: true } })
  await $.ui.press({ plugin: 'taskboard-pane', key: 'refresh', surface: 'desktop' })
  await $.ui.press({ plugin: 'taskboard-pane', key: 'new-card', surface: 'desktop' })
  const values = ((await ui.find({ key: 'existing-project' }))?.props.options ?? []).map((o: any) => o.value)
  expect(values.includes('未分組')).toBe(true)
  expect(values.includes('個人任務')).toBe(true)
  expect(values.includes('交易工具')).toBe(true)
  await ui.unmount()
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

// The App's two connectors, answered from memory: list_groups, then list_sessions per group.
const GROUPS = [{ id: 'cg-1', name: '交易工具', session_count: 1 }, { id: 'cg-2', name: '股魚魚缸網頁', session_count: 1 }, { id: 'cg-3', name: '空群組', session_count: 0 }]
const MEMBERS: Record<string, any[]> = {
  'cg-1': [{ sessionId: 'local_a', title: 'A', group: { id: 'cg-1', name: '交易工具' } }],
  'cg-2': [{ sessionId: 'local_c', title: 'C', group: { id: 'cg-2', name: '股魚魚缸網頁' } }],
}
const text = (value: unknown, isError = false) => ({ value: { isError, content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value) }] } })
function appConnectors(on: any, calls: any[] = []) {
  on('mcp.call', async (_$: any, e: any) => {
    calls.push(e)
    if (e.server === 'ccd_sidebar' && e.tool === 'list_groups') return text(GROUPS)
    if (e.server === 'ccd_session_mgmt' && e.tool === 'list_sessions') return text(MEMBERS[e.args.group] ?? [])
    return text('unknown tool', true)
  })
}

test('the mod relays Claude App sidebar groups to the board as session projects, one group at a time', async ($, on) => {
  const clock = mock.clock(on)
  const posted: string[] = []
  const calls: any[] = []
  appConnectors(on, calls)
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
  // never one list_sessions for every session: its result is too large and comes back as a "saved to a file" note
  const reads = calls.filter(c => c.tool === 'list_sessions')
  expect(reads.map(c => c.args.group)).toEqual(['cg-1', 'cg-2']) // the empty group is not read
  expect(reads.every(c => c.args.limit >= 1 && c.args.limit <= 100)).toBe(true)
  await $.ui.press({ plugin: 'taskboard-pane', key: 'refresh', surface: 'desktop' })
  expect(posted.length).toBe(1) // unchanged mapping is not re-sent…
  await clock.advance(300000)
  await $.ui.press({ plugin: 'taskboard-pane', key: 'refresh', surface: 'desktop' })
  expect(posted.length).toBeGreaterThan(1) // …until five minutes on, as proof the groups are still fresh
  await ui.unmount()
})

test('a group read that fails reaches the board as an error, never as all-ungrouped', async ($, on) => {
  const clock = mock.clock(on)
  const posted: any[] = []
  let answer: (e: any) => any = () => text('No app window has reported groups yet', true)
  on('mcp.call', async (_$, e) => answer(e))
  on('http.fetch', async (_$, e) => {
    if (e.url.endsWith('/api/claude-groups')) posted.push(JSON.parse(e.init?.body || '{}'))
    return { value: { status: 200, ok: true, headers: {}, text: e.url.endsWith('47824/') ? PAGE : e.url.endsWith('/api/state') ? JSON.stringify(STATE) : '{}' } }
  })
  const ui = await $.ui.mount({ plugin: 'taskboard-pane', surface: 'desktop', component: 'Pane', requestId: 'taskboard', props: PANE_PROPS,
    viewport: { columns: 100, rows: 40, isFullscreen: true } })
  await $.ui.press({ plugin: 'taskboard-pane', key: 'refresh', surface: 'desktop' })
  await clock.settle()
  expect(posted.length).toBe(1)
  expect(posted[0].sessions).toBe(undefined)
  expect(posted[0].error).toContain('No app window has reported groups yet')
  // a result too large for the engine arrives as plain text, not JSON: an error, not an empty mapping
  answer = e => e.tool === 'list_groups' ? text(GROUPS) : text('Error: result (178,962 characters across 4,852 lines) exceeds maximum allowed tokens. Output has been saved to C:\\x.txt')
  await $.ui.press({ plugin: 'taskboard-pane', key: 'refresh', surface: 'desktop' })
  expect(posted.length).toBe(2)
  expect(posted[1].sessions).toBe(undefined)
  expect(posted[1].error).toContain('exceeds maximum allowed tokens')
  // a session without the App's connectors (a terminal CLI) has nothing to tell and says nothing
  answer = () => { throw new Error('no MCP server named ccd_sidebar') }
  await $.ui.press({ plugin: 'taskboard-pane', key: 'refresh', surface: 'desktop' })
  expect(posted.length).toBe(2)
  await ui.unmount()
})

test('a turn relays the App groups too, at most once a minute, so they arrive while the pane is closed', async ($, on) => {
  const clock = mock.clock(on)
  const calls: any[] = []
  appConnectors(on, calls)
  on('http.fetch', async (_$, e) => ({ value: { status: 200, ok: true, headers: {}, text: e.url.endsWith('47824/') ? PAGE : e.url.endsWith('/api/state') ? JSON.stringify(STATE) : '{"mirrored":true}' } }))
  on('session.id', () => ({ value: 'sess-groups' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  const groupReads = () => calls.filter(c => c.tool === 'list_groups').length
  await $.turn.start({ text: '第一句', turnId: 'turn-1' })
  await clock.settle()
  await $.turn.start({ text: '第二句', turnId: 'turn-2' })
  await clock.settle()
  expect(groupReads()).toBe(1)
  await clock.advance(61000)
  await $.turn.start({ text: '第三句', turnId: 'turn-3' })
  await clock.settle()
  expect(groupReads()).toBe(2)
})

test('turns typed in this session are mirrored to the board as the runs of one card', async ($, on) => {
  const clock = mock.clock(on)
  const posted: any[] = []
  on('http.fetch', async (_$, e) => {
    if (e.url.endsWith('47824/')) return { value: { status: 200, ok: true, headers: {}, text: PAGE } }
    if (e.url.endsWith('/api/claude-turns')) { const body = JSON.parse(e.init?.body || '{}'); posted.push(body); return { value: { status: 200, ok: true, headers: {}, text: body.event === 'start' ? '{"mirrored":true,"created":true,"wantsBrief":true,"briefSource":"幫我裝任務看板"}' : '{"mirrored":true}' } } }
    if (e.url.endsWith('/api/state')) return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify(STATE) } }
    return { value: { status: 200, ok: true, headers: {}, text: '{}' } }
  })
  on('session.id', () => ({ value: 'sess-test' }))
  on('session.cwd', () => ({ value: 'C:\test' }))
  on('session.model', () => ({ value: 'opus' }))
  const asked: any[] = []
  on('model.complete', (_$, e) => { asked.push(e); return { value: { isAnswered: true, text: '需求簡介\n裝好任務看板。\n\n驗收條件\n- App 可開啟看板', usage: {} } } })
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  await $.turn.start({ text: '幫我裝任務看板', turnId: 'turn-1' })
  await $.turn.complete({ turnId: 'turn-1', answer: '已安裝', durationMs: 10, isAborted: false, reason: 'answer' })
  await clock.settle()
  expect([...posted.map(p => p.event)].sort()).toEqual(['brief', 'complete', 'start'])
  expect(posted[0].event).toBe('start')
  expect(posted[0].text).toBe('幫我裝任務看板')
  expect(posted[0].turnId).toBe('turn-1')
  expect(typeof posted[0].cwd).toBe('string')
  expect(typeof posted[0].sessionId).toBe('string')
  const complete = posted.find(p => p.event === 'complete')
  expect(complete.answer).toBe('已安裝')
  expect(complete.aborted).toBe(false)
  // the brief is drafted once from the first prompt by a cheap haiku completion and sent back to the board
  expect(asked.length).toBe(1)
  expect(JSON.stringify(asked[0])).toContain('haiku')
  expect(JSON.stringify(asked[0])).toContain('幫我裝任務看板')
  expect(posted.find(p => p.event === 'brief').description).toContain('驗收條件')
  expect(posted.every(p => p.tool === 'claude' && p.sessionId === posted[0].sessionId)).toBe(true)
})

test('a CLI the board dispatched relays none of its turns', async ($, on) => {
  const clock = mock.clock(on)
  const posted: any[] = []
  on('http.fetch', async (_$, e) => {
    if (e.url.endsWith('/api/claude-turns')) posted.push(JSON.parse(e.init?.body || '{}'))
    return { value: { status: 200, ok: true, headers: {}, text: e.url.endsWith('47824/') ? PAGE : '{}' } }
  })
  on('env.get', (_$, e) => ({ value: e.name === 'TASKBOARD_DISPATCHED' ? '1' : undefined }))
  on('session.id', () => ({ value: 'sess-board' }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  await $.turn.start({ text: '看板派的需求', turnId: 'turn-1' })
  await $.turn.complete({ turnId: 'turn-1', answer: '', durationMs: 10, isAborted: false, reason: 'error' })
  await clock.settle()
  expect(posted).toEqual([])
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
