/* GitHub Pages 展示資料層：只使用範例資料與本頁 localStorage，不呼叫網路或模型。 */
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const now = () => Date.now() / 1000;
  function createDemo({storage = null, key = 'taskboard-demo-v1', schedule = setTimeout} = {}) {
    let serial = 0, timers = new Map(), db;
    const makeTask = body => ({id: 'demo-' + Date.now().toString(36) + '-' + (++serial), title: '',
      description: '', project: 'TaskBoardTool 展示', cwd: '', priority: 'medium', status: 'backlog',
      tool: 'codex', model: '', effort: '', labels: [], comments: [], runs: [], nextRun: null,
      sourceId: '', sourceTool: '', workerThreadId: '', turnId: '', result: '', resultUrl: '', error: '',
      retryAt: 0, relatedIds: [], dependsOn: [], blocks: [], plan: null,
      createdAt: now(), updatedAt: now(), queuedAt: now(), version: 1, ...body});
    function seed() {
      const examples = [
        ['規劃下一次更新', 'backlog', 'claude', '寫下需求與驗收條件，再把卡片拖到待辦。'],
        ['試試模擬派工', 'todo', 'codex', '開啟卡片並按「開始執行」，數秒後會收到範例回報。'],
        ['整理操作手冊', 'in_review', 'claude', '查看範例對話、Session 心智圖，再把卡片移到已完成。'],
        ['加入工具篩選', 'done', 'codex', '這是已完成的範例任務。可以修改、新增或刪除展示卡片。']
      ];
      return {tasks: examples.map(([title, status, tool, description]) => makeTask({title, status, tool, description})),
        events: [], automatic: false, activeId: null};
    }
    try { db = JSON.parse(storage?.getItem(key) || 'null'); } catch {}
    if (!db || !Array.isArray(db.tasks) || !Array.isArray(db.events)) db = seed();
    db.activeId = null;
    for (const task of db.tasks) if (task.status === 'in_progress') task.status = 'todo';
    const persist = () => { try { storage?.setItem(key, JSON.stringify(db)); } catch {} };
    const taskById = id => { const task = db.tasks.find(t => t.id === id); if (!task) throw Error('展示卡片不存在。'); return task; };
    const event = (task, message) => db.events.unshift({id: Date.now() * 1000 + (++serial), taskId: task.id,
      title: task.title, status: task.status, message, at: now(), error: false, tool: task.tool});
    function update(task) { task.updatedAt = now(); task.version++; persist(); return clone(task); }
    function release() {
      for (const task of db.tasks) if (task.status === 'backlog' && task.dependsOn.length &&
        task.dependsOn.every(id => db.tasks.find(t => t.id === id)?.status === 'done')) task.status = 'todo';
    }
    function validateDependencies(task, ids) {
      if (!Array.isArray(ids) || ids.some(id => id === task.id || !db.tasks.some(t => t.id === id))) throw Error('前置卡片不正確。');
      const visit = (id, seen = new Set()) => {
        if (id === task.id) throw Error('前置關係不能形成循環。');
        if (seen.has(id)) return; seen.add(id);
        for (const child of taskById(id).dependsOn) visit(child, seen);
      };
      ids.forEach(id => visit(id));
    }
    function start(task) {
      if (db.activeId) throw Error('另一張展示卡片正在模擬執行。');
      task.status = 'in_progress'; db.activeId = task.id;
      const pending = task.nextRun; task.nextRun = null;
      const threadId = pending?.threadId || task.workerThreadId || 'sample-' + task.id;
      task.workerThreadId = threadId;
      task.runs.push({id: 'run-' + (++serial), kind: pending?.kind || 'initial', tool: task.tool, threadId,
        status: 'running', request: pending?.text || task.description || task.title, result: '', startedAt: now(), finishedAt: null});
      const run = task.runs.at(-1);
      event(task, '展示模式：開始模擬 ' + task.tool + ' 派工。'); update(task);
      timers.set(task.id, schedule(() => {
        timers.delete(task.id);
        if (!db.tasks.includes(task) || task.status !== 'in_progress' || task.runs.at(-1) !== run) return;
        task.status = 'in_review'; db.activeId = null;
        task.result = '## 範例回報\n\n已模擬完成「' + task.title + '」。\n\n- 請查看成果並驗收。\n- 這是固定的展示回報，沒有呼叫 AI，也沒有執行程式。';
        Object.assign(task.runs.at(-1), {status: 'completed', result: task.result, finishedAt: now()});
        event(task, '模擬執行完成，等待驗收。'); update(task);
        if (db.automatic) pump();
      }, 1800));
      return clone(task);
    }
    function pump() {
      if (!db.automatic || db.activeId) return;
      const next = db.tasks.find(t => t.status === 'todo' && t.dependsOn.every(id => db.tasks.find(x => x.id === id)?.status === 'done'));
      if (next) start(next);
    }
    function chats(tool) { return db.tasks.filter(t => t.tool === tool && t.workerThreadId).map(t => ({
      id: t.workerThreadId, title: t.title, cwd: '', updatedAt: t.updatedAt, model: '展示模型',
      sessionStatus: {label: '範例對話 · 沒有連接本機', active: false}})); }
    async function api(rawPath, method = 'GET', body = {}) {
      const path = rawPath.split('?')[0];
      if (path === '/api/state') return clone({...db, connected: true, connectionError: '', approvals: [],
        defaultWorkspace: '', version: 'demo', chats: chats('codex'), claudeChats: chats('claude'),
        chatSync: {updatedAt: now()}, claudeSync: {updatedAt: now()}, claudeGroupsAt: now(),
        tools: {codex: {label: 'Codex 展示', available: true}, claude: {label: 'Claude 展示', available: true, listSessions: true}}});
      if (path === '/api/models') return {models: [{model: 'demo', displayName: '展示模型（不呼叫 AI）', effortLevels: ['low', 'medium', 'high']}]};
      if (path === '/api/chats') return {chats: chats('codex'), claudeChats: chats('claude')};
      if (path === '/api/export') return clone({schemaVersion: 5, demo: true, ...db});
      if (path === '/api/vendor/mermaid') throw Error('展示版不載入外部 Mermaid；Session 心智圖仍可使用。');
      if (path.startsWith('/api/folders/')) throw Error('展示版無法存取本機資料夾；可在欄位輸入範例路徑。');
      if (path.startsWith('/api/chat/')) {
        const id = decodeURIComponent(path.split('/').at(-1)), task = db.tasks.find(t => t.workerThreadId === id);
        if (!task) throw Error('沒有這筆範例對話。');
        return {id, title: task.title, hasMore: false, firstPrompt: task.runs[0]?.request || task.description,
          turns: task.runs.map(r => ({id: r.id, status: r.status, items: [
            {type: 'userMessage', content: [{type: 'text', text: r.request}]},
            {type: 'agentMessage', text: r.result || '模擬執行中…', phase: 'final_answer'}]}))};
      }
      if (path === '/api/settings' && method === 'PATCH') { db.automatic = !!body.automatic; persist(); pump(); return clone(db); }
      if (path === '/api/tasks' && method === 'POST') {
        if (!String(body.title || '').trim()) throw Error('請填寫任務標題。');
        const task = makeTask(body); validateDependencies(task, body.dependsOn || []); db.tasks.push(task); persist(); pump(); return clone(task);
      }
      const match = /^\/api\/tasks\/([^/]+)(?:\/(.*))?$/.exec(path);
      if (match) {
        const task = taskById(match[1]), operation = match[2];
        if (body.version !== undefined && body.version !== task.version) throw Error('卡片已有更新，請重新開啟。');
        if (operation === 'start') {
          if (!body.force && task.dependsOn.some(id => db.tasks.find(t => t.id === id)?.status !== 'done')) throw Error('前置卡片尚未完成。');
          return start(task);
        }
        if (operation === 'stop') { task.status = 'backlog'; db.activeId = null; if (task.runs.length) Object.assign(task.runs.at(-1), {status: 'interrupted', finishedAt: now()}); return update(task); }
        if (operation === 'comment') { task.comments.push({text: String(body.text || ''), at: now(), author: '展示訪客'}); return update(task); }
        if (operation === 'followup') { task.nextRun = {threadId: body.threadId || '', text: body.text, kind: body.threadId ? 'followup' : 'new_session'}; task.status = 'todo'; const out = update(task); if (body.startNow) return start(task); pump(); return out; }
        if (operation === 'followup/cancel') { task.nextRun = null; task.status = 'backlog'; return update(task); }
        if (!operation && method === 'DELETE') {
          if (task.id === db.activeId) db.activeId = null;
          db.tasks = db.tasks.filter(t => t.id !== task.id);
          for (const other of db.tasks) { other.relatedIds = other.relatedIds.filter(id => id !== task.id); other.dependsOn = other.dependsOn.filter(id => id !== task.id); }
          persist(); return {ok: true};
        }
        if (!operation && method === 'PATCH') {
          if (body.dependsOn) validateDependencies(task, body.dependsOn);
          for (const name of ['title', 'description', 'project', 'cwd', 'priority', 'status', 'tool', 'model', 'effort', 'labels', 'resultUrl', 'relatedIds', 'dependsOn']) if (name in body) task[name] = clone(body[name]);
          for (const other of db.tasks) if (other.id !== task.id) {
            other.relatedIds = other.relatedIds.filter(id => id !== task.id);
            if (task.relatedIds.includes(other.id)) other.relatedIds.push(task.id);
            other.blocks = db.tasks.filter(t => t.dependsOn.includes(other.id)).map(t => t.id);
          }
          release(); const out = update(task); pump(); return out;
        }
      }
      if (path === '/api/plans') throw Error('展示版暫不支援計畫 JSON 匯入，請直接新增卡片。');
      if (path === '/api/import-chat') throw Error('展示對話已連結至範例卡片，請直接開啟卡片。');
      throw Error('展示版不支援此操作：' + path);
    }
    // 給「待審核」範例一筆可檢視的對話。
    for (const task of db.tasks) if (task.status === 'in_review' && !task.runs.length) {
      task.workerThreadId = 'sample-' + task.id;
      task.runs.push({id: 'sample-run', kind: 'initial', tool: task.tool, threadId: task.workerThreadId,
        request: task.description, result: '## 範例回報\n\n操作手冊已整理。這是展示資料，請試試驗收與心智圖。',
        status: 'completed', startedAt: now() - 60, finishedAt: now()});
      task.result = task.runs[0].result;
    }
    persist();
    return {api, reset() { db = seed(); persist(); }, snapshot: () => clone(db)};
  }
  root.TaskboardDemo = {createDemo};
  if (typeof document !== 'undefined') {
    let storage; try { storage = root.localStorage; } catch {}
    root.__TASKBOARD_DEMO__ = createDemo({storage, key: 'taskboard-demo-v1:' + location.pathname});
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('demo-reset').onclick = () => { if (confirm('重設這個瀏覽器的展示卡片？')) { root.__TASKBOARD_DEMO__.reset(); location.reload(); } };
    });
  }
})(globalThis);
