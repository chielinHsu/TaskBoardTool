/* Native panel integration inspired by chuspeeism/dashi-taskboard (Apache-2.0).
 * Only our injected elements are changed; the original workspace stays mounted. */
(function installCasparTaskboard() {
  if(!document.head || !document.body){document.addEventListener('DOMContentLoaded',installCasparTaskboard,{once:true});return;}
  if (window.__casparTaskboard) return;
  const boardUrl = new URL(window.__CASPAR_TASKBOARD_URL__ || 'http://127.0.0.1:47824/?embed=1');
  if (boardUrl.protocol !== 'http:' || boardUrl.hostname !== '127.0.0.1') throw Error('Only loopback boards are supported');
  const ENTRY = 'caspar-taskboard-entry', TEXT_ENTRY = 'caspar-taskboard-sidebar-entry', PANEL = 'caspar-taskboard-panel', STYLE = 'caspar-taskboard-style';
  let active = false, frameLoaded = false, destroyed = false, scheduled = false, autoOpened = false, capability = '', themeKey = '';
  const css = document.createElement('style');
  css.id = STYLE;
  css.textContent = `#${PANEL}{position:fixed;z-index:45;background:var(--color-surface,var(--app-color-background-surface));overflow:hidden;-webkit-app-region:no-drag}#${PANEL}[hidden]{display:none!important}#${PANEL} iframe{border:0;width:100%;height:100%;display:block}#${ENTRY}{-webkit-app-region:no-drag}#${ENTRY}[data-selected]{color:var(--color-text-primary)}#${ENTRY}[data-selected]::before{opacity:1}:root[data-caspar-taskboard-open] nav[data-app-navigation-rail] button[data-selected]:not(#${ENTRY}){background:transparent;--button-text-color:var(--color-text-tertiary)}:root[data-caspar-taskboard-open] nav[data-app-navigation-rail] button[data-selected]:not(#${ENTRY})::before{opacity:0}`;
  document.head.append(css);
  css.textContent+=`#${TEXT_ENTRY}{min-height:36px}#${TEXT_ENTRY} button{width:100%;gap:8px;border-radius:8px;-webkit-app-region:no-drag}#${TEXT_ENTRY} button[aria-current=page]{background:var(--color-background-secondary-soft-hover);color:var(--color-text-primary)}#${TEXT_ENTRY} svg{width:18px;height:18px;flex-shrink:0}`;
  // Resolve host tokens to concrete colors before crossing the opaque iframe.
  const themeProbe=document.createElement('span');
  themeProbe.style.cssText='position:fixed;visibility:hidden;pointer-events:none';
  document.body.append(themeProbe);
  function theme() {
    const root=getComputedStyle(document.documentElement);
    const color=(names,fallback)=>{
      const value=names.map(name=>root.getPropertyValue(name).trim()).find(value=>value && CSS.supports('color',value));
      themeProbe.style.color=value||fallback;
      return getComputedStyle(themeProbe).color;
    };
    const mode=document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light';
    const dark=mode==='dark';
    return {mode,colors:{
      bg:color(['--color-surface','--app-color-background-surface'],dark?'#181818':'#fff'),
      paper:color(['--color-surface-elevated-secondary'],dark?'#2d2d2d':'#fff'),
      ink:color(['--color-text-primary'],dark?'#fff':'#0d0d0d'),
      muted:color(['--color-text-secondary'],dark?'#aaa':'#666'),
      line:color(['--color-border','--color-token-border-default'],dark?'#444':'#ddd'),
      accent:color(['--codex-base-accent','--app-color-accent-blue'],dark?'#339cff':'#0285ff'),
      'on-accent':color(['--color-text-info-solid'],dark?'#000':'#fff'),
      hover:color(['--color-background-secondary-soft-hover'],dark?'#ffffff14':'#0000000a'),
      column:color(['--color-surface-secondary'],dark?'#141414':'#f7f7f7'),
      danger:color(['--color-text-danger-soft'],dark?'#ff8583':'#b14f45'),
      warning:color(['--color-text-caution'],dark?'#ffd240':'#946932'),
      success:color(['--app-color-text-success'],dark?'#40c977':'#286c5b')
    },font:root.getPropertyValue('--font-sans').trim()||root.fontFamily,fontSize:root.getPropertyValue('--font-ui-size').trim()||'14px'};
  }
  function syncTheme(force=false) {
    const value=theme(), key=JSON.stringify(value);
    if(!force && key===themeKey)return;
    themeKey=key;
    const panel=document.getElementById(PANEL);
    if(panel)panel.style.backgroundColor=value.colors.bg;
    if(capability)panel?.querySelector('iframe')?.contentWindow?.postMessage({type:'caspar-board-theme',capability,theme:value},'*');
  }
  function visible(element) {
    if (!element || element.checkVisibility?.({checkVisibilityCSS:true,contentVisibilityAuto:true}) === false) return false;
    const r = element.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  }
  const rail = () => [...document.querySelectorAll('nav[data-app-navigation-rail]')].find(visible);
  function workspace() {
    // Native routes stay mounted while hidden. The first matching node may belong
    // to an inactive route and report a zero-sized rectangle after navigation.
    const navigation = rail(), shell = navigation?.closest('[data-app-shell-frame]') || document;
    for (const selector of ['.app-shell-main-content-frame','[data-app-shell-main-content-layout]','[data-app-shell-workspace-row]']) {
      const area = [...shell.querySelectorAll(selector)].find(visible);
      if (area) return area;
    }
    return null;
  }
  function geometry() {
    const area = workspace(), navigation = rail();
    if (!area || !navigation) return null;
    const r = area.getBoundingClientRect(), n = navigation.getBoundingClientRect();
    const sidebar = navigation.closest('.app-shell-left-panel');
    const left = Math.max(0, r.left, n.right, visible(sidebar) ? sidebar.getBoundingClientRect().right : 0), top = Math.max(0, r.top);
    const width = Math.max(0, Math.min(innerWidth,r.right)-left), height = Math.max(0, Math.min(innerHeight,r.bottom)-top);
    return width > 0 && height > 0 ? {left, top, width, height} : null;
  }
  function position() {
    const g = geometry(), panel = document.getElementById(PANEL);
    if (!g || !panel || !active) return;
    for (const [key,value] of Object.entries(g)) {
      const next = `${value}px`;
      if (panel.style[key] !== next) panel.style[key] = next;
    }
  }
  function ensureEntry() {
    const navigation = rail();
    if (!navigation) return;
    const existing = document.getElementById(ENTRY);
    if (existing && navigation.contains(existing)) return;
    existing?.remove();
    const buttons = [...navigation.querySelectorAll('button[data-sidebar-destination]')];
    const reference = buttons.find(b => /explore|plugin|探索|插件|外掛/i.test(b.textContent+' '+b.getAttribute('aria-label'))) || buttons.at(-1);
    if (!reference) return;
    const button = reference.cloneNode(true);
    const presentation=new Set(['data-color','data-variant','data-squircle','data-uniform','data-size','data-icon-size']);
    for (const attr of [...button.attributes]) if ((attr.name.startsWith('data-')&&!presentation.has(attr.name)) || ['id','aria-controls','aria-describedby','aria-current','aria-expanded'].includes(attr.name)) button.removeAttribute(attr.name);
    button.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    button.id = ENTRY;
    button.type = 'button';
    button.setAttribute('aria-label','任務看板');
    button.title = '任務看板';
    const label = button.querySelector('.sr-only');
    if (label) label.textContent = '任務看板';
    else {
      const text = document.createElement('span'); text.textContent = '任務看板';
      const svg = button.querySelector('svg'); button.replaceChildren(...(svg?[svg]:[]),text);
    }
    const svg = button.querySelector('svg');
    if (svg) { svg.setAttribute('viewBox','0 0 24 24'); svg.innerHTML = '<rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 4v16M15 4v16M6 8v5M12 8v3M18 8v7" stroke="currentColor" stroke-width="1.6" fill="none"/>'; }
    // Do not inherit a notification badge from the cloned destination.
    button.querySelectorAll('.absolute').forEach(element=>element.remove());
    button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open();});
    if(active){button.setAttribute('data-selected','true');button.setAttribute('aria-current','page');}
    reference.after(button);
  }
  function ensureTextEntry() {
    const sidebar=rail()?.closest('.app-shell-left-panel');
    if(!sidebar)return;
    const candidates=[...sidebar.querySelectorAll('button.sidebar-item,a.sidebar-item,.sidebar-item[role="button"]')].filter(el=>(/^(New chat|新聊天|新增聊天|新建聊天)$/.test((el.textContent||'').trim()) || /^(New chat|新聊天|新增聊天|新建聊天)$/.test(el.getAttribute('aria-label')||'')) && visible(el));
    const reference=candidates.find(el=>el.classList.contains('sidebar-item'));
    if(!reference?.parentElement)return;
    const existing=document.getElementById(TEXT_ENTRY);
    if(existing && existing.parentElement===reference.parentElement.parentElement && visible(existing))return;
    existing?.remove();
    const row=document.createElement('div');row.id=TEXT_ENTRY;row.className=reference.parentElement.className;
    const button=document.createElement('button');button.type='button';button.className=reference.className;button.setAttribute('aria-label','任務看板');button.title='任務看板';
    button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M9 4v16M15 4v16M6 8v5M12 8v3M18 8v7" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><span>任務看板</span>';
    if(active)button.setAttribute('aria-current','page');
    button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open();});
    row.append(button);reference.parentElement.after(row);
  }
  function createFrame() {
    const frame = document.createElement('iframe');
    frame.title = 'Caspar 的任務看板'; frame.src = 'about:blank'; frame.name = 'caspar-board-'+crypto.randomUUID();
    frame.setAttribute('allow','clipboard-write');
    frame.setAttribute('sandbox','allow-scripts allow-forms allow-modals allow-downloads allow-popups');
    return frame;
  }
  function ensurePanel() {
    if (document.getElementById(PANEL)) return;
    const panel = document.createElement('section');
    panel.id = PANEL; panel.hidden = !active; panel.setAttribute('aria-label','任務看板工作區');
    // prepare() resets readiness before document replacement. A delayed native
    // load event must not clear an authenticated ready message from that document.
    panel.append(createFrame()); document.body.append(panel);
  }
  // Page.setDocumentContent keeps the frame's JS realm (document.open semantics): a second board document
  // would hit "TOKEN already declared" and leave the old script running without its message listener.
  // A replaced iframe gets a fresh realm; until prepare() its messages carry no accepted capability.
  function resetFrame() {
    const old = document.querySelector(`#${PANEL} iframe`);
    if (!old) return null;
    const frame = createFrame();
    capability = ''; frameLoaded = false;
    old.replaceWith(frame);
    return frame.name;
  }
  function open() {
    ensureEntry(); ensureTextEntry(); ensurePanel(); active = true;
    document.documentElement.setAttribute('data-caspar-taskboard-open','true');
    const entry = document.getElementById(ENTRY);
    entry?.setAttribute('data-selected','true'); entry?.setAttribute('aria-current','page');
    document.querySelector(`#${TEXT_ENTRY} button`)?.setAttribute('aria-current','page');
    document.getElementById(PANEL).hidden = false; position();
    syncTheme(true);
  }
  function close() {
    active = false; document.documentElement.removeAttribute('data-caspar-taskboard-open');
    const entry = document.getElementById(ENTRY); entry?.removeAttribute('data-selected'); entry?.removeAttribute('aria-current');
    document.querySelector(`#${TEXT_ENTRY} button`)?.removeAttribute('aria-current');
    const panel = document.getElementById(PANEL); if(panel) panel.hidden = true;
  }
  function refresh() {
    scheduled = false; if(destroyed) return;
    ensureEntry(); ensureTextEntry();
    syncTheme();
    observeWorkspace();
    if(active) { ensurePanel(); position(); }
    if(!autoOpened && window.__CASPAR_TASKBOARD_AUTOOPEN__ && document.getElementById(ENTRY) && geometry()?.width>100) {autoOpened=true;open();}
  }
  function schedule() { if(!scheduled && !destroyed){scheduled=true;requestAnimationFrame(refresh);} }
  const observer = new MutationObserver(records=>{
    if(records.some(r=>r.target !== css && !r.target.closest?.(`#${ENTRY},#${TEXT_ENTRY},#${PANEL}`) &&
      (r.type==='childList' || r.target.matches?.('[data-app-shell-frame],[data-app-shell-workspace-row],.app-shell-left-panel,nav[data-app-navigation-rail],.app-shell-main-content-frame,[data-app-shell-main-content-layout]') || r.target.querySelector?.('[data-app-shell-main-content-layout]')))) schedule();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','data-state','data-theme','data-color-scheme']});
  // Chat rows are div[role=button], not button.sidebar-item.
  function nativeNavigation(e) {
    if(e.type==='keydown' && !['Enter',' '].includes(e.key))return;
    if(!e.target.closest?.(`#${ENTRY},#${TEXT_ENTRY}`) && e.target.closest?.('nav[data-app-navigation-rail] button,button.sidebar-item,a.sidebar-item,.sidebar-item[role="button"]')) close();
  }
  document.addEventListener('click',nativeNavigation,true);
  document.addEventListener('keydown',nativeNavigation,true);
  const resizeObserver = new ResizeObserver(schedule);
  let observedArea=null, observedNavigation=null;
  function observeWorkspace() {
    const area=workspace(), navigation=rail();
    if(area===observedArea && navigation===observedNavigation)return;
    observedArea=area;observedNavigation=navigation;
    resizeObserver.disconnect();resizeObserver.observe(document.documentElement);
    if(area)resizeObserver.observe(area);
    if(navigation)resizeObserver.observe(navigation);
  }
  observeWorkspace();
  window.addEventListener('resize',schedule);
  const timer = setInterval(refresh,2000);
  function frameMessage(event) {
    const frame=document.querySelector(`#${PANEL} iframe`), message=event.data;
    if(!frame || event.source!==frame.contentWindow || event.origin!=='null' || !capability || message?.capability!==capability) return;
    if(message.type==='caspar-board-ready'){frameLoaded=true;syncTheme(true);}
    if(message.type==='caspar-board-api' && typeof window.__casparBoardRpc==='function') window.__casparBoardRpc(JSON.stringify({...message.payload,capability}));
  }
  window.addEventListener('message',frameMessage);
  window.__casparTaskboard = {
    open,close,
    prepare:value=>{capability=value;frameLoaded=false;},
    resetFrame,
    respond:reply=>{document.querySelector(`#${PANEL} iframe`)?.contentWindow?.postMessage({type:'caspar-board-response',capability,reply},'*');},
    status:()=>({entryPresent:!!document.getElementById(ENTRY),textEntryPresent:!!document.getElementById(TEXT_ENTRY),active,frameLoaded,frameName:document.querySelector(`#${PANEL} iframe`)?.name,frameUrl:boardUrl.href,geometry:geometry(),theme:theme()}),
    destroy:()=>{destroyed=true;close();observer.disconnect();resizeObserver.disconnect();clearInterval(timer);themeProbe.remove();window.removeEventListener('message',frameMessage);window.removeEventListener('resize',schedule);document.removeEventListener('click',nativeNavigation,true);document.removeEventListener('keydown',nativeNavigation,true);[ENTRY,TEXT_ENTRY,PANEL,STYLE].forEach(id=>document.getElementById(id)?.remove());delete window.__casparTaskboard;}
  };
  refresh();
})();
