// 最小 CDP 客戶端：啟動 headless Chrome、連線第一個 page target、evaluate。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME_EXE || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export async function launch(url, { port = 9555, width = 1920, height = 1080, extraArgs = [] } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'promo-chrome-'));
  const args = [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--disable-gpu-vsync', '--disable-frame-rate-limit',
    '--allow-file-access-from-files', '--hide-scrollbars', '--force-device-scale-factor=1', ...extraArgs, url,
  ];
  const proc = spawn(CHROME, args, { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      targets = await res.json();
      if (targets.some(t => t.type === 'page')) break;
    } catch { }
    await new Promise(r => setTimeout(r, 200));
  }
  const page = targets.find(t => t.type === 'page');
  if (!page) throw new Error('no page target');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map(); const listeners = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method) listeners.forEach(l => l(m));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression, { awaitPromise = true, timeout } = {}) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, timeout });
    if (r.exceptionDetails) throw new Error('page exception: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const close = async () => { try { ws.close(); } catch { } proc.kill(); await new Promise(r => setTimeout(r, 500)); try { rmSync(profile, { recursive: true, force: true }); } catch { } };
  return { send, evaluate, close, on: l => listeners.push(l) };
}
