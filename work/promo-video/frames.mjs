// 匯出指定時間點的影格 PNG（視覺檢查用）
import { launch } from './cdp-lib.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const times = process.argv.slice(2).map(Number);
const out = resolve(process.env.OUT || 'frames'); mkdirSync(out, { recursive: true });
const b = await launch(pathToFileURL(resolve(process.env.PAGE || 'promo.html')).href);
try {
  await b.send('Runtime.enable'); await b.send('Page.enable');
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
  await b.evaluate('window.__ready'); await b.evaluate("document.body.classList.add('record')");
  for (const t of times) {
    await b.evaluate(`window.__seek(${t})`);
    const { data } = await b.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } });
    const f = `${out}/t${t.toFixed(2).replace('.', '_')}.png`; writeFileSync(f, Buffer.from(data, 'base64')); console.log('wrote', f);
  }
} finally { await b.close(); }
