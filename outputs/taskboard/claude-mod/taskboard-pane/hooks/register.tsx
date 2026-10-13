// Claude Code App mod: the Caspar taskboard as a docked pane plus the /taskboard command.
// It is a native view over the same loopback service the web board and the Codex embed use;
// nothing here reaches the model or writes files. Mods draw with Box/Text/Button/Input/Select only
// (no web view), so this is the in-app entry Claude Code offers; the full page stays at http://127.0.0.1:47824.
import { atom, read, update } from 'claude-code'
import type { Register, EngineInterface as Engine } from 'claude-code'

import type { BoardApproval, BoardSnapshot, BoardTask, Draft, ModelOption } from '../types'

const PANE = 'taskboard'
const BASE = 'http://127.0.0.1:47824'
const PAGE_URL = 'http://localhost:47824' // Link elements accept https or http://localhost only; the service allows this Host
const POLL_MS = 5000
const TOOL_LABEL: Record<string, string> = { codex: 'Codex', claude: 'Claude Code' }
const STATUS_LABEL: Record<string, string> = { backlog: '列管', todo: '待辦', in_progress: '進行中', in_review: '待審核', done: '已完成' }
const STATUS_ORDER = ['in_progress', 'in_review', 'todo', 'backlog', 'done']
const PRIORITY: Record<string, string> = { low: '低', medium: '中', high: '高', urgent: '緊急' }
const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 }

const EMPTY: BoardSnapshot = {
  status: 'idle', error: '', updatedAt: 0, activeId: null, automatic: true, codexConnected: false,
  claudeAvailable: false, codexSessions: 0, claudeSessions: 0, tasks: [], projects: {}, approvals: [],
}
const EMPTY_DRAFT: Draft = { open: false, title: '', description: '', tool: 'codex', model: '', priority: 'medium', status: 'backlog', cwd: '', project: '' }
const snapshot = atom({ plugin: 'taskboard-pane', key: 'snapshot' } as const, EMPTY)
const draft = atom({ plugin: 'taskboard-pane', key: 'draft' } as const, EMPTY_DRAFT)
const models = atom({ plugin: 'taskboard-pane', key: 'models' } as const, {} as Record<string, ModelOption[]>)
const paneOpen = atom({ plugin: 'taskboard-pane', key: 'paneOpen' } as const, false)

async function openPane($: Engine, focus = false): Promise<boolean> {
  const opened = await $.ui.open(focus ? { id: PANE, title: '任務看板', focus: true } : { id: PANE, title: '任務看板' })
  await update($, paneOpen, () => !!opened.isPlaced)
  return !!opened.isPlaced
}

let token = ''
let poll: { cancel: () => void } | null = null
let folderPoll: { cancel: () => void } | null = null
const run = (work: () => Promise<unknown>) => work().then(() => undefined, () => undefined)

// A toast is a courtesy: a host without one (the test kit, a headless run) must never fail an action.
function say($: Engine, text: string): void {
  try { void $.ui.toast(text) } catch { /* no toast on this host */ }
}

async function api($: Engine, path: string, method = 'GET', body?: unknown): Promise<any> {
  if (!token) {
    const page = await $.http.fetch(BASE + '/')
    if (!page.ok) throw new Error('看板服務未啟動（start.ps1 或桌面 Codex 捷徑）')
    const found = /const TOKEN='([^']+)'/.exec(page.text)
    if (!found) throw new Error('無法從看板頁面取得 API token')
    token = found[1]
  }
  const response = await $.http.fetch(BASE + path, {
    method,
    headers: { 'X-Board-Token': token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (response.status === 403) token = '' // the service restarted with a new token; re-read next time
  let data: any
  try { data = JSON.parse(response.text) } catch { throw new Error('看板回應不是 JSON（HTTP ' + response.status + '）') }
  if (!response.ok) throw new Error(String(data?.error || 'HTTP ' + response.status))
  return data
}

function toTask(t: any): BoardTask {
  return {
    id: String(t.id), title: String(t.title || ''), status: String(t.status || 'backlog'), priority: String(t.priority || 'medium'),
    tool: String(t.tool || 'codex'), model: String(t.model || ''), effort: String(t.effort || ''), version: Number(t.version || 0),
    errorText: String(t.error || ''), queued: !!t.nextRun, dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.map(String) : [],
    plan: t.plan && typeof t.plan === 'object' ? String(t.plan.name || '') + (t.plan.key ? ' · ' + String(t.plan.key) : '') : '',
  }
}

function toApproval(a: any): BoardApproval {
  const tool = String(a.tool || 'codex')
  const params = a.params || {}
  const title = tool === 'claude'
    ? 'Claude Code 請求核准工具：' + String(params.toolName || '')
    : String(a.method || '').includes('fileChange') ? 'Codex 請求核准檔案變更'
      : String(a.method || '').includes('requestUserInput') ? 'Codex 需要你的回答（請到完整看板）' : 'Codex 請求核准操作'
  const detail = tool === 'claude' ? JSON.stringify(params.input ?? {}) : JSON.stringify(params.command ?? params.reason ?? params.changes ?? params)
  return { id: String(a.id), tool, title, detail: detail.slice(0, 400) }
}

async function refresh($: Engine): Promise<void> {
  try {
    const state = await api($, '/api/state')
    const now = await $.clock.now()
    const all: any[] = Array.isArray(state.tasks) ? state.tasks : []
    const projects: Record<string, string[]> = Object.create(null)
    for (const t of all) {
      const name = String(t.project || '個人任務'), cwd = String(t.cwd || '')
      projects[name] ??= []
      if (cwd && !projects[name].some(p => p.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() === cwd.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase())) projects[name].push(cwd)
    }
    const next: BoardSnapshot = {
      status: 'ok', error: '', updatedAt: now, activeId: state.activeId ?? null, automatic: !!state.automatic,
      codexConnected: !!state.connected, claudeAvailable: !!state.tools?.claude?.available,
      codexSessions: all.filter(t => t.readOnly && (t.tool || 'codex') === 'codex').length,
      claudeSessions: all.filter(t => t.readOnly && t.tool === 'claude').length,
      // Same order as the scheduler: priority first, then first into the todo queue (creation time for older cards).
      tasks: all.filter(t => !t.readOnly)
        .sort((a, b) => (PRIORITY_RANK[b.priority] ?? 1) - (PRIORITY_RANK[a.priority] ?? 1) || ((a.queuedAt || a.createdAt || 0) - (b.queuedAt || b.createdAt || 0)))
        .map(toTask),
      projects, approvals: (Array.isArray(state.approvals) ? state.approvals : []).map(toApproval),
    }
    await update($, snapshot, () => next)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await update($, snapshot, previous => ({ ...previous, status: 'error', error: message }))
  }
}

async function loadModels($: Engine, tool: string): Promise<void> {
  try {
    const data = await api($, tool === 'codex' ? '/api/models' : '/api/models?tool=' + encodeURIComponent(tool))
    const list: ModelOption[] = (Array.isArray(data.models) ? data.models : []).map((m: any) => ({ model: String(m.model), label: String(m.displayName || m.model) }))
    await update($, models, previous => ({ ...previous, [tool]: list }))
  } catch (error) {
    say($, (TOOL_LABEL[tool] || tool) + ' 模型清單讀取失敗：' + (error instanceof Error ? error.message : String(error)))
  }
}

async function act($: Engine, label: string, run: () => Promise<unknown>): Promise<boolean> {
  let ok = true
  try {
    await run()
    say($, label)
  } catch (error) {
    ok = false
    say($, '失敗：' + (error instanceof Error ? error.message : String(error)))
  }
  await refresh($)
  return ok
}

async function createCard($: Engine, start: boolean): Promise<void> {
  const form = await read($, draft)
  if (form.folderBusy) { say($, '請先完成或取消資料夾選擇。'); return }
  if (!form.title.trim()) { say($, '請先填寫任務標題。'); return }
  const body: Record<string, unknown> = {
    title: form.title.trim(), description: form.description.trim(), tool: form.tool, model: form.model,
    priority: form.priority, status: start ? 'todo' : form.status,
  }
  if (form.cwd.trim()) body.cwd = form.cwd.trim()
  if (form.project.trim()) body.project = form.project.trim()
  const ok = await act($, start ? '卡片已建立並交給 ' + (TOOL_LABEL[form.tool] || form.tool) : '卡片已建立', async () => {
    const task = await api($, '/api/tasks', 'POST', body)
    if (start) await api($, '/api/tasks/' + task.id + '/start', 'POST', {})
  })
  if (ok) await update($, draft, previous => ({ ...EMPTY_DRAFT, open: false, tool: previous.tool, cwd: previous.cwd, project: previous.project }))
}

// The Claude App keeps its sidebar groups in app state (no file the board could read), so the mod
// relays {sessionId → group} through the app's own session connector; the board uses it as the project name.
let groupSync: { cancel: () => void } | null = null
let lastGroups = ''
async function syncGroups($: Engine): Promise<void> {
  try {
    const result = await $.mcp.call('ccd_session_mgmt', 'list_sessions', { limit: 500 })
    const text = result.content.find(block => block.type === 'text')?.text ?? ''
    if (result.isError || !text) return
    const rows = JSON.parse(text)
    if (!Array.isArray(rows)) return
    const sessions = rows.filter((r: any) => r && typeof r.sessionId === 'string' && r.group && r.group.name)
      .map((r: any) => ({ sessionId: r.sessionId, group: { id: String(r.group.id || ''), name: String(r.group.name) } }))
    const fingerprint = JSON.stringify(sessions)
    if (fingerprint === lastGroups) return
    await api($, '/api/claude-groups', 'POST', { sessions })
    lastGroups = fingerprint
  } catch { /* the connector may be absent (terminal session) or the board down; the next tick retries */ }
}

// Every turn of this session is mirrored to the board as a run of one card (the session's first prompt
// creates it, in 進行中; the turn's end moves it to 待審核). A CLI the board launched itself carries
// TASKBOARD_DISPATCHED and relays nothing: its adapter already records the run, and a turn end that
// arrived after that run finished would otherwise come back as a second, mirrored run. Relaying never
// blocks or alters the turn.
async function mirror($: Engine, payload: Record<string, unknown>): Promise<void> {
  try {
    if (await $.env.get('TASKBOARD_DISPATCHED').catch(() => undefined) === '1') return
    const sessionId = await $.session.id()
    const cwd = await $.session.cwd().catch(() => '')
    const model = await $.session.model().catch(() => '')
    const result = await api($, '/api/claude-turns', 'POST', { tool: 'claude', sessionId, cwd, model, ...payload })
    await refresh($)
    if (payload.event === 'start' && result?.wantsBrief) void draftBrief($, sessionId, cwd, model, String(result.briefSource || payload.text || ''))
  } catch { /* the board may be down; the next turn relays again */ }
}

// The card's 需求簡介／驗收條件 are drafted once, from the session's FIRST prompt (the board sends it back as
// briefSource), by a cheap completion (haiku, low effort). The board keeps the draft only while nobody edited
// the brief by hand, and later prompts of the session never rewrite it; a failed or empty draft leaves the
// first prompt itself as the brief. Drafting never blocks the turn.
async function draftBrief($: Engine, sessionId: string, cwd: string, model: string, source: string): Promise<void> {
  if (!source.trim()) return
  try {
    const reply = await $.model.complete({
      model: 'haiku', effort: 'low', maxTokens: 800, timeoutMs: 60000,
      system: '你是任務看板的助理。使用者在 Claude Code 對話中送出了第一句需求，請把它整理成任務卡片的「需求簡介」與「驗收條件」。用繁體中文，只輸出以下格式，不加其他標題、前言或結語：\n需求簡介\n（2–4 句，說明要完成什麼、範圍與限制）\n\n驗收條件\n- （可檢查的條目，3–6 條）',
      prompt: source.slice(0, 6000),
    })
    if (!reply.isAnswered || !reply.text.trim()) return
    await api($, '/api/claude-turns', 'POST', { tool: 'claude', sessionId, cwd, model, event: 'brief', description: reply.text.trim() })
    await refresh($)
  } catch { /* drafting is best-effort; the first prompt stays as the brief */ }
}

function startPolling($: Engine): void {
  poll?.cancel()
  poll = $.clock.every(POLL_MS, () => { void refresh($) })
  groupSync?.cancel()
  groupSync = $.clock.every(60000, () => { void syncGroups($) })
  void syncGroups($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'taskboard', description: '開啟 Caspar 任務看板側邊窗格（Codex／Claude Code 共用）' })
    await $.tool.register({
      name: 'import_plan',
      description: '把展開後的功能事項匯入 Caspar 任務看板：每個事項成為一張列管卡片。Claude Code 事項以 role（fast-worker／developer／developer-deep／architect／architect-deep，依 MODEL_ROUTING.md 評分）自動對應模型與推理強度，或直接給 model／effort；dependsOn 以 key 指定前置事項，前置卡片全部驗收完成後被阻擋的卡片自動排入待辦；排程一次只執行一張。回傳建立的卡片 ID 與順序。',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '計畫名稱（功能名）' },
          project: { type: 'string' }, cwd: { type: 'string', description: '工作資料夾完整路徑' },
          tool: { type: 'string', enum: ['codex', 'claude'], description: '預設執行工具' },
          items: { type: 'array', items: { type: 'object', properties: {
            key: { type: 'string' }, title: { type: 'string' }, description: { type: 'string', description: '需求與驗收條件' },
            tool: { type: 'string', enum: ['codex', 'claude'] },
            role: { type: 'string', enum: ['fast-worker', 'developer', 'developer-deep', 'architect', 'architect-deep'] },
            model: { type: 'string' }, effort: { type: 'string', enum: ['low', 'medium', 'high', 'xhigh', 'max'] },
            dependsOn: { type: 'array', items: { type: 'string' }, description: '前置事項的 key' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            status: { type: 'string', enum: ['backlog', 'todo'] }, labels: { type: 'array', items: { type: 'string' } },
          }, required: ['title'] } },
        },
        required: ['name', 'items'],
      },
    })
    // An app-hosted session reports no surface at session.start (only the REPL does), so always
    // ask; the surface answers whether it placed the pane, and only then is polling worth running.
    void (async () => {
      if (await openPane($)) {
        startPolling($)
        await refresh($)
      }
    })()
    return next(e)
  })

  on('tool.call', { tool: 'mcp__taskboard-pane__import_plan' }, async ($, e) => {
    const { tool: _tool, tool_use_id: _id, agentId: _agent, ...plan } = e as Record<string, unknown>
    try {
      const result = await api($, '/api/plans', 'POST', plan)
      await refresh($)
      const lines = (result.tasks as any[]).map(t => '- ' + (t.plan?.key ?? t.id) + ' → ' + t.id + ' [' + (TOOL_LABEL[t.tool] || t.tool) + (t.model ? ' ' + t.model : '') + (t.effort ? '/' + t.effort : '') + '] ' + t.title + '（' + (STATUS_LABEL[t.status] || t.status) + '；前置：' + ((t.dependsOn as string[]).join('、') || '無') + '）')
      const text = '計畫「' + result.name + '」（' + result.planId + '）已建立 ' + lines.length + ' 張卡片，依賴順序 ' + (result.order as string[]).join(' → ') + '：\n' + lines.join('\n')
      return { result: { content: [{ type: 'text', text }], isError: false } }
    } catch (error) {
      return { deny: '匯入計畫失敗：' + (error instanceof Error ? error.message : String(error)) }
    }
  })

  on('turn.start', async ($, e, next) => {
    void mirror($, { event: 'start', turnId: e.turnId, text: e.text })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) void mirror($, { event: 'complete', turnId: e.turnId, answer: e.answer, reason: e.reason, aborted: e.isAborted })
    return next(e)
  })

  on('command.run', { command: 'taskboard' }, async $ => {
    await openPane($, true)
    startPolling($)
    await refresh($)
    return { text: '任務看板窗格已開啟；完整網頁版：' + PAGE_URL }
  })

  on('ui.close', { id: PANE }, async ($, e, next) => {
    if (e.origin.kind !== 'plugin') { poll?.cancel(); poll = null; groupSync?.cancel(); groupSync = null }
    await update($, paneOpen, () => false)
    return next(e)
  })

  // While the pane is closed, a one-press (hotkey 9 from an empty composer) reopen sits above the prompt.

  // The above-prompt site is shared by every mod: draw the other mods' band (next) and add one row,
  // instead of taking the whole site. Needs the mods above this one to call next(e) as well (usage-bar does).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (await read($, paneOpen)) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    let others: unknown = null
    try { others = await next(e) } catch { others = null }
    const row = (
      <Box flexDirection="row" gap={1}>
        <Button key="open-taskboard" hotkey="9" plain onPress={() => run(async () => { if (await openPane($, true)) { startPolling($); await refresh($) } })}>▦ 任務看板</Button>
        <Text dimColor>按 9 或 /taskboard 重新開啟窗格</Text>
      </Box>
    )
    if (!others) return row
    return (
      <Box flexDirection="column">
        {row}
        {others as any}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link, Input, Select } = $.ui.resolve(e)
    const board = await read($, snapshot)
    const form = await read($, draft)
    const catalogue = await read($, models)
    const columns = Math.max(24, e.props?.bodyColumns ?? e.viewport?.columns ?? 60)
    const rows = Math.max(8, (e.viewport?.rows ?? 30) - 6)
    const grouped = STATUS_ORDER.map(status => [status, board.tasks.filter(t => t.status === status)] as const)
    const byId = new Map(board.tasks.map(t => [t.id, t]))
    const blockedBy = (t: BoardTask) => t.dependsOn.filter(id => byId.get(id)?.status !== 'done')
    const perColumn = Math.max(2, Math.floor((rows - 8 - board.approvals.length * 3 - (form.open ? 12 : 0)) / STATUS_ORDER.length))
    const toolAvailable = form.tool === 'claude' ? board.claudeAvailable : board.codexConnected
    const modelOptions = [{ value: '', label: '沿用 ' + (TOOL_LABEL[form.tool] || form.tool) + ' 設定' }, ...(catalogue[form.tool] || []).map(m => ({ value: m.model, label: m.label }))]
    if (form.model && !modelOptions.some(o => o.value === form.model)) modelOptions.push({ value: form.model, label: form.model + '（目前不可用）' })
    const setDraft = (patch: Partial<Draft>) => update($, draft, previous => ({ ...previous, ...patch }))
    const projectOptions = Object.keys(board.projects || {}).sort((a, b) => a.localeCompare(b, 'zh-TW')).map(value => ({ value, label: value }))
    const paths = (board.projects || {})[form.project.trim()] || []
    const setProject = (project: string) => {
      const choices = (board.projects || {})[project.trim()] || []
      const oldPaths = (board.projects || {})[form.project.trim()] || []
      return setDraft({ project, cwd: choices.length === 1 ? choices[0] : oldPaths.includes(form.cwd) ? '' : form.cwd })
    }
    const pickFolder = async () => {
      if (form.folderBusy) return
      await setDraft({ folderBusy: true })
      let job: any
      const settle = async () => {
        const current = await read($, draft)
        if (!current.open || !current.folderBusy) { await api($, '/api/folders/' + job.id + '/cancel', 'POST', {}); job.status = 'cancelled' }
        if (job.status === 'pending') return
        folderPoll?.cancel(); folderPoll = null
        const patch: Partial<Draft> = { folderBusy: false }
        if (job.status === 'selected' && current.open && current.project === form.project && current.cwd === form.cwd) patch.cwd = job.path
        if (job.status === 'error') say($, job.error || '資料夾選擇失敗')
        await setDraft(patch)
      }
      try {
        job = await api($, '/api/folders/select', 'POST', { initialPath: form.cwd })
        if (job.status !== 'pending') { await settle(); return }
        folderPoll?.cancel()
        let reading = false
        folderPoll = $.clock.every(500, () => {
          if (reading) return
          reading = true
          void (async () => {
            try { job = await api($, '/api/folders/' + job.id); await settle() }
            catch (error) { folderPoll?.cancel(); folderPoll = null; await setDraft({ folderBusy: false }); say($, String(error)) }
            finally { reading = false }
          })()
        })
      } catch (error) { await setDraft({ folderBusy: false }); say($, String(error)) }
    }
    // One awaited chain per handler: the host settles a press once the work it started is done.

    return (
      <Box flexDirection="column" width={columns} gap={1}>
        <Box flexDirection="row" gap={2} flexWrap="wrap">
          <Text bold>任務看板</Text>
          <Text color={board.codexConnected ? 'green' : 'yellow'}>Codex {board.codexConnected ? '已連線' : '未連線'}</Text>
          <Text color={board.claudeAvailable ? 'green' : 'yellow'}>Claude Code {board.claudeAvailable ? '可用' : '不可用'}</Text>
          <Text dimColor>{board.automatic ? '自動派工' : '手動派工'}</Text>
        </Box>
        {board.status === 'error' && <Text color="red">無法連線看板服務：{board.error}</Text>}
        {board.status === 'idle' && <Text dimColor>正在讀取看板…</Text>}
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          <Button key="new-card" variant="primary" onPress={() => run(async () => { await setDraft({ open: !form.open }); if (!form.open && !catalogue[form.tool]) await loadModels($, form.tool) })}>{form.open ? '收起新增' : '＋ 新增任務'}</Button>
          <Button key="refresh" onPress={() => run(async () => { await refresh($); await syncGroups($) })}>重新整理</Button>
          <Button key="automatic" onPress={() => { void act($, board.automatic ? '已切換手動派工' : '已切換自動派工', () => api($, '/api/settings', 'PATCH', { automatic: !board.automatic })) }}>
            {board.automatic ? '改為手動' : '改為自動'}
          </Button>
          <Link href={PAGE_URL} label="完整看板（瀏覽器）" />
        </Box>
        {form.open && (
          <Box flexDirection="column" borderStyle="round" paddingX={1}>
            <Text bold>新增任務</Text>
            <Input key="new-title" label="標題" placeholder="例如：為網站加入深色模式" value={form.title} autoFocus
              onInput={value => run(() => setDraft({ title: value }))} onSubmit={value => run(() => setDraft({ title: value }))} />
            <Input key="new-description" label="需求與驗收條件" placeholder="一句話描述要完成什麼、怎麼驗收（多行請用完整看板）" value={form.description}
              onInput={value => run(() => setDraft({ description: value }))} onSubmit={value => run(() => setDraft({ description: value }))} />
            <Select key="new-tool" label="執行工具" value={form.tool} options={[{ value: 'codex', label: 'Codex' }, { value: 'claude', label: 'Claude Code' }]}
              onSelect={value => run(async () => { await setDraft({ tool: value, model: '' }); if (!catalogue[value]) await loadModels($, value) })} />
            <Select key="new-model" label="負責模型" value={form.model} options={modelOptions} onSelect={value => run(() => setDraft({ model: value }))} />
            <Select key="new-priority" label="優先級" value={form.priority} options={Object.entries(PRIORITY).map(([value, label]) => ({ value, label }))} onSelect={value => run(() => setDraft({ priority: value }))} />
            <Select key="new-status" label="放入" value={form.status} options={[{ value: 'backlog', label: '列管' }, { value: 'todo', label: '待辦（自動派工會領取）' }]} onSelect={value => run(() => setDraft({ status: value }))} />
            <Select key="existing-project" label="既有專案" value={projectOptions.some(o => o.value === form.project) ? form.project : ''}
              options={[{ value: '', label: '選擇既有專案，或在下方輸入新名稱' }, ...projectOptions]} onSelect={value => run(() => setProject(value))} />
            <Input key="new-project" label="專案名稱" placeholder="選擇既有專案或輸入新名稱" value={form.project}
              onInput={value => run(() => setProject(value))} onSubmit={value => run(() => setProject(value))} />
            {paths.length > 1 && <Select key="existing-cwd" label="專案工作資料夾" value={form.cwd} options={paths.map(value => ({ value, label: value }))} onSelect={value => run(() => setDraft({ cwd: value }))} />}
            <Input key="new-cwd" label="工作資料夾" placeholder="留白：自動建立獨立任務資料夾" value={form.cwd}
              onInput={value => run(() => setDraft({ cwd: value }))} onSubmit={value => run(() => setDraft({ cwd: value }))} />
            <Button key="pick-folder" onPress={() => run(pickFolder)}>{form.folderBusy ? '選擇中…' : '選擇資料夾…'}</Button>
            {!toolAvailable && <Text color="yellow">{TOOL_LABEL[form.tool]} 目前無法使用，卡片可先建立，但無法開始執行。</Text>}
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button key="create-card" variant="primary" onPress={() => { void createCard($, false) }}>建立卡片</Button>
              <Button key="create-start" onPress={() => { void createCard($, true) }}>建立並開始執行</Button>
              <Button key="cancel-card" plain onPress={() => run(() => setDraft({ ...EMPTY_DRAFT, open: false }))}>取消</Button>
            </Box>
          </Box>
        )}
        <Text dimColor>同步 session：Codex {board.codexSessions} · Claude Code {board.claudeSessions}（完整清單在網頁版）</Text>
        {board.approvals.length > 0 && (
          <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
            <Text bold color="yellow">等待你核准（{board.approvals.length}）</Text>
            {board.approvals.slice(0, 3).map(a => (
              <Box key={'ap-' + a.id} flexDirection="column">
                <Text>{a.title}</Text>
                <Text dimColor wrap="truncate-end">{a.detail}</Text>
                <Box flexDirection="row" gap={1}>
                  <Button key={'accept-' + a.id} variant="primary" onPress={() => { void act($, '已核准', () => api($, '/api/approvals/' + encodeURIComponent(a.id), 'POST', { decision: 'accept' })) }}>核准這一次</Button>
                  <Button key={'decline-' + a.id} onPress={() => { void act($, '已拒絕', () => api($, '/api/approvals/' + encodeURIComponent(a.id), 'POST', { decision: 'decline' })) }}>拒絕</Button>
                </Box>
              </Box>
            ))}
          </Box>
        )}
        {grouped.map(([status, tasks]) => (
          <Box key={'col-' + status} flexDirection="column">
            <Text bold>{STATUS_LABEL[status]} <Text dimColor>({tasks.length})</Text></Text>
            {tasks.length === 0 && <Text dimColor>　—</Text>}
            {tasks.slice(0, perColumn).map(t => (
              <Box key={'task-' + t.id} flexDirection="row" gap={1} flexWrap="wrap">
                <Text color={t.tool === 'claude' ? 'magenta' : 'cyan'}>[{TOOL_LABEL[t.tool] || t.tool}]</Text>
                <Text wrap="truncate-end">{t.title}</Text>
                <Text dimColor>{PRIORITY[t.priority] || t.priority}{t.model ? ' · ' + t.model : ''}{t.effort ? '/' + t.effort : ''}{t.plan ? ' · ' + t.plan : ''}{t.queued ? ' · 已排後續需求' : ''}{t.errorText ? ' · 需要處理' : ''}{t.id === board.activeId ? ' · 執行中' : ''}</Text>
                {blockedBy(t).length > 0 && status !== 'done' && <Text color="yellow">等待前置：{blockedBy(t).map(id => (byId.get(id)?.title || id).slice(0, 12)).join('、')}</Text>}
                {status === 'todo' && !board.activeId && blockedBy(t).length > 0 && (
                  <Button key={'force-' + t.id} plain dimColor onPress={() => { void act($, '已略過前置，交給 ' + (TOOL_LABEL[t.tool] || t.tool), () => api($, '/api/tasks/' + t.id + '/start', 'POST', { force: true })) }}>略過前置執行</Button>
                )}
                {status === 'todo' && !board.activeId && blockedBy(t).length === 0 && (
                  <Button key={'start-' + t.id} plain onPress={() => { void act($, '已交給 ' + (TOOL_LABEL[t.tool] || t.tool), () => api($, '/api/tasks/' + t.id + '/start', 'POST', {})) }}>開始執行</Button>
                )}
                {status === 'backlog' && blockedBy(t).length === 0 && (
                  <Button key={'queue-' + t.id} plain onPress={() => { void act($, '已移到待辦', () => api($, '/api/tasks/' + t.id, 'PATCH', { version: t.version, status: 'todo' })) }}>移到待辦</Button>
                )}
                {status === 'in_progress' && t.id === board.activeId && (
                  <Button key={'stop-' + t.id} plain onPress={() => { void act($, '已送出停止請求', () => api($, '/api/tasks/' + t.id + '/stop', 'POST', {})) }}>停止</Button>
                )}
                {status === 'in_review' && (
                  <Button key={'done-' + t.id} plain onPress={() => { void act($, '已驗收完成', () => api($, '/api/tasks/' + t.id, 'PATCH', { version: t.version, status: 'done' })) }}>驗收完成</Button>
                )}
              </Box>
            ))}
            {tasks.length > perColumn && <Text dimColor>　…還有 {tasks.length - perColumn} 張，請看完整看板</Text>}
          </Box>
        ))}
        <Text dimColor>窗格可新增卡片與派工；後續需求、關聯、對話閱讀請用完整看板。</Text>
      </Box>
    )
  })
}
