/* 真實瀏覽器驗證 Pages 子路徑、展示 CRUD、派工與窄螢幕；沒有本機 API。 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || path.resolve('work/browser/node_modules/playwright'));
const directory = path.resolve('work/pages');
const requests = [];
const server = http.createServer((req, res) => {
  requests.push(req.url);
  const name = req.url === '/TaskBoardTool/' ? 'index.html' : req.url.replace(/^\/TaskBoardTool\//, '');
  if (!['index.html', 'demo.js'].includes(name)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8');
  res.end(fs.readFileSync(path.join(directory, name)));
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch(process.env.CHROME_BIN ? {executablePath: process.env.CHROME_BIN} : {});
  try {
    const page = await browser.newPage({viewport: {width: 1440, height: 1000}}), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const url = `http://127.0.0.1:${server.address().port}/TaskBoardTool/`;
    await page.goto(url);
    await page.locator('.card').first().waitFor();
    assert.equal(await page.locator('.card').count(), 4);
    await page.getByRole('button', {name: '＋ 新增任務', exact: true}).click();
    await page.locator('#task-title').fill('瀏覽器展示驗證');
    await page.locator('#task-description').fill('驗收條件：新增、保存、重新載入、模擬派工。');
    await page.locator('#save-task').click();
    await page.getByRole('button', {name: '瀏覽器展示驗證', exact: true}).waitFor();
    await page.reload();
    await page.getByRole('button', {name: '瀏覽器展示驗證', exact: true}).click();
    await page.locator('#start-task').click();
    await page.waitForFunction(() => document.querySelector('#stat-review')?.textContent === '2');
    await page.getByRole('button', {name: '瀏覽器展示驗證', exact: true}).click();
    await page.locator('#task-status').selectOption('done');
    await page.locator('#save-task').click();
    await page.waitForFunction(() => document.querySelector('#stat-done')?.textContent === '2');
    await page.locator('[data-view="chats"]').click();
    await page.locator('.chat-row').first().waitFor();
    assert.ok(await page.locator('.chat-row').count() >= 2);
    await page.locator('[data-view="board"]').click();
    const card = page.locator('.card').filter({has: page.getByRole('button', {name: '規劃下一次更新', exact: true})});
    const source = await card.boundingBox(), target = await page.locator('.column[data-status="todo"]').boundingBox();
    await page.mouse.move(source.x + 30, source.y + 35); await page.mouse.down();
    await page.mouse.move(target.x + 70, target.y + 130, {steps: 20}); await page.mouse.up();
    await page.waitForFunction(() => [...document.querySelectorAll('.column[data-status="todo"] .card-title')].some(n => n.textContent === '規劃下一次更新'));
    await page.getByRole('button', {name: '整理操作手冊', exact: true}).click();
    await page.locator('#open-map').click();
    await page.locator('#map-dialog[open] svg').waitFor();
    await page.locator('#close-map').click(); await page.locator('#close-dialog').click();
    const output = process.env.DEMO_QA_DIR;
    if (output) { fs.mkdirSync(output, {recursive: true}); await page.screenshot({path: path.join(output, 'desktop.png'), fullPage: true}); }
    await page.setViewportSize({width: 375, height: 812});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (output) await page.screenshot({path: path.join(output, 'mobile.png'), fullPage: true});
    assert.deepEqual(errors, []);
    assert.equal(requests.some(url => url.startsWith('/api/') || url.includes('127.0.0.1:47824')), false);
    console.log('PASS: Pages 子路徑、CRUD、重新載入、模擬派工、拖曳、對話、心智圖、375px 與零 API 請求');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
