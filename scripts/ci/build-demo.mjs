import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const out = path.resolve(root, process.argv[2] || 'work/pages');
if (!out.startsWith(root + path.sep)) throw Error('展示輸出必須位於專案內。');
let html = fs.readFileSync(path.join(root, 'outputs/taskboard/index.html'), 'utf8');
const apiSignature = "async function api(path,method='GET',data){";
if (html.split(apiSignature).length !== 2) throw Error('看板 API 入口已改變，請更新展示建置器。');
html = html.replace(apiSignature, apiSignature + 'if(window.__TASKBOARD_DEMO__)return window.__TASKBOARD_DEMO__.api(path,method,data);');
html = html.replaceAll('__BOARD_USER__', '展示訪客').replaceAll('__BOARD_TOKEN__', 'demo-no-credentials');
html = html.replace('</head>', '<script src="./demo.js"></script></head>');
html = html.replace('<main class="main">', `<main class="main"><section class="banner" aria-label="展示模式">
  <strong>TaskBoardTool 互動展示</strong> · 範例資料只儲存在這個瀏覽器。派工與回報皆為模擬，不連接 AI 或本機檔案。
  <div class="link-row"><button id="demo-reset" type="button">重設範例</button>
  <a href="https://github.com/chielinHsu/TaskBoardTool#readme" target="_blank" rel="noopener">下載完整本機版</a>
  <a href="https://github.com/chielinHsu/TaskBoardTool/blob/main/docs/user-guide.md" target="_blank" rel="noopener">操作手冊</a></div></section>`);
if (!html.includes('id="demo-reset"')) throw Error('看板 main 入口已改變。');
html = html.replaceAll('Codex 已連線', 'Codex 展示模式').replaceAll('Claude Code 可用', 'Claude Code 展示模式')
  .replaceAll('本機 Codex sessions', '範例 Codex 對話').replaceAll('個 App sessions', '筆範例對話')
  .replaceAll('本機未封存的 Codex sessions 與 Claude App 的 Code sessions 每 15 秒自動同步至看板，並標示來源工具。', '此處只顯示模擬派工產生的範例對話，不會讀取本機 sessions。')
  .replaceAll('把想法排進佇列，讓 Codex 或 Claude Code 幫你逐一完成。', '新增卡片、拖曳狀態、試試模擬派工與 Session 心智圖。');
html = html.replace('id="import-plan"', 'id="import-plan" disabled title="展示版請直接新增卡片"')
  .replace('id="pick-folder"', 'id="pick-folder" disabled title="展示版不存取本機資料夾"')
  .replaceAll('資料保存在這台電腦。', '展示資料保存在此瀏覽器。');
html = html.replace(/\$\('session-sync'\)\.textContent=codexText[^;]+;/,
  "$('session-sync').textContent='範例對話與回報皆為模擬；不連接本機 App、檔案或 AI。可開啟卡片試試 Session 心智圖。';");
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'index.html'), html, 'utf8');
fs.copyFileSync(path.join(root, 'sites/demo/demo.js'), path.join(out, 'demo.js'));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log('展示版已建置：' + out);
