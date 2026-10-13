# 交接（2026-10-12）：回報渲染 Markdown 與 Mermaid 圖（網頁版與 Codex 內嵌版）

## 正在做
使用者要求看板回報能渲染 Markdown 與 Mermaid（流程圖、循序圖、類別圖），網頁版（47824／Browser 窗格）與 Codex App 內嵌版都要支援，函式庫由安裝腳本下載、不進 Git。已實作、驗證，commit 1921dac 已 push 並快轉合併 main（origin/main 同步），正式服務已是 1.8.0。

## 本輪已完成
- 版本：使用者原建議 11.6.0；查 GitHub 公告 11.6.0～11.16.0 有 XSS（CVE-2025-54881／54880）、HTML／CSS 注入、DoS，經使用者同意改 11.17.2（2026-08-25，3,572,661 bytes，SHA-256 581ed7d7…390eb8，jsDelivr data API 取得後實際下載核對相符）。
- `outputs/taskboard/setup-mermaid.mjs`：寫死版本／URL／大小／雜湊；`--check` 唯讀；不符刪除下載與舊檔、結束碼 1；寫 `vendor/mermaid.min.js`＋`vendor/mermaid.json`（安裝紀錄）。`install`／`inspect` 可注入 fetch 測試。`.gitignore` 加 `outputs/taskboard/vendor/`（CRLF 與原檔一致）。
- server.py：`VENDOR`、`vendor_mermaid()`（安裝紀錄 SHA-256 再核對、mtime／大小快取；缺檔 404、不符 409，訊息含安裝指令）、`GET /api/vendor/mermaid` 在 check_api 之後；CSP 未改；API 1.8.0。
- index.html：`/* taskboard-markdown:start/end */` 區段——只建元素與文字節點（標題、巢狀清單、表格、引用、hr、程式碼區塊、粗體／斜體／行內程式碼、連結只顯示文字＋title；>200k 字或巢狀 >8 層退純文字）。已關閉的 ```mermaid 區塊先顯示原始碼，再 `api('/api/vendor/mermaid')` 懶載入、script.textContent 注入；`securityLevel:'strict'`、`suppressErrorRendering`、theme base，themeVariables 由 CSS token 經 getComputedStyle 轉 hex（半透明色合成到 paper）；SVG 經 template 惰性解析＋`mermaidClean` 移除 script／iframe／img／animate 等、on* 屬性、非 # 的 href／src、javascript: 值；SVG 以主題＋原始碼快取（60 筆）；根元素 style／data-host-theme 或系統明暗變更時重新上色；失敗退回原始碼＋原因、失敗 30 秒內不重抓。套用：run 回報、session 最近回報、聊天紀錄進度與回報（使用者訊息純文字）、狀態列表完成訊息、`#task-result`（mdRender 同文字跳過）。
- `.claude/launch.json` 加 `taskboard-isolated`（py -3、47999、work/preview-isolated、--no-connect），驗證用不碰正式服務。
- 測試：`tests/taskboard-markdown.test.mjs` 11 項（假 DOM，innerHTML 被呼叫即失敗；跳脫、`<script>`／`<img onerror>`、mermaid 內嵌 HTML、無函式庫退回、未關閉 fence、清理器、配色）、`tests/taskboard-mermaid-setup.test.mjs` 5 項（雜湊不符／HTTP 失敗／安裝紀錄）、`tests/test_taskboard_vendor.py` 6 項（token／Origin、缺檔、不符、快取、CSP 無 unsafe-eval）；三個版本斷言改 1.8.0。
- 文件：architecture（前後 Mermaid 圖）、ADR-019、changelog、current-status、project-rules（不加框架的例外條件）、AI_CONTEXT（技術棧、目錄、測試指令、不變條件、Context Routing、API 1.8.0）、README 安裝段落。

## 驗證
- VERIFIED：實際下載＋核對＋`--check`；靜態掃描 bundle 只有 lodash 的 `self||Function("return this")()` 短路分支。`py -3 -m py_compile`、`node --check`（app-panel、app-injector、setup-mermaid）、index.html 兩段 inline script 解析；Python 67 測試；Node Markdown 11＋安裝 5＋主題 7。
- VERIFIED（Browser 窗格、隔離服務 47999）：以 `/api/claude-turns` 建一張鏡像卡，詳情中流程圖／循序圖／類別圖渲染、無效圖退回原始碼並附解析錯誤；暗色→亮色即時重新上色；惡意標籤（img onerror、javascript: 連結、iframe srcdoc、svg onload、init 指令改 securityLevel）`__xss`=0、無主動元素；聊天紀錄（暫時替換頁面 api 回傳假對話）回報與進度渲染、使用者訊息純文字；無 console 錯誤。
- PARTIALLY VERIFIED（內嵌）：同一 Chromium 以 srcdoc 套用 injector 相同 CSP meta、`__CASPAR_EMBED_RPC__` 與相同路徑白名單的 postMessage RPC：經 RPC 取得 `/api/vendor/mermaid`、securitypolicyviolation 0 筆、Appearance 主題訊息（暗色＋紫 accent）重新上色。
- VERIFIED（合併後、正式服務 1.8.0）：主 checkout 執行 `node tests/taskboard-app.test.mjs` 4 項 PASS；真實 Codex 內嵌 frame 以暫時離屏 DOM 畫流程圖＋循序圖皆 rendered，線框色＝App accent（rgb(166,125,242)），CSP 違規 0，未寫卡片（探測腳本在 scratchpad，未進 Git）。
- NOT VERIFIED：3.7 MB 經 CDP evaluate＋postMessage 的耗時；Claude App mod 窗格是原生元件，不渲染 Markdown。
- 實際失敗（合併後）：我給的 stop／start 指令是相對路徑，使用者終端機在 worktree，服務一度從 worktree 以空資料庫（worktree `outputs/taskboard/.data`，gitignore、仍留著）啟動，已用絕對路徑換回主 checkout；App 開著時服務重啟，frame 重新載入新頁面後 RPC 無回應（`api()` 10 秒以上無回覆、畫面連線中斷），使用者重開 App 與服務後恢復，原因未查明。
- 實際失敗：Git Bash heredoc／sed 處理中文與反引號出錯（改用 Write；sed 曾把 .gitignore 換行弄成混合，已以 printf 重寫為 CRLF）；Python 3.9 讀超長中文行的腳本誤報 Non-UTF-8，加 coding 宣告後正常；測試初版兩處斷言錯（含括號的連結本就不成立、半透明合成值 4a），已修正測試。

## 下一步
1. 查 App 開著時服務重啟後 frame RPC 無回應的根因（app-injector bindingCalled／loadFrame 流程、是否與 3.7 MB 回應有關），可用 scratchpad 探測方式在 frame 主世界呼叫 `api()`。
2. 給使用者的指令一律用絕對路徑（終端機可能在 worktree）。
3. 確認後可刪 worktree 的 `outputs/taskboard/.data`（誤啟動留下的空資料庫）。

## 相關檔案
outputs/taskboard/setup-mermaid.mjs、server.py（vendor_mermaid、dispatch）、index.html（taskboard-markdown 區段、套用處、.md CSS）、.gitignore、.claude/launch.json、tests/taskboard-markdown.test.mjs、tests/taskboard-mermaid-setup.test.mjs、tests/test_taskboard_vendor.py、docs 四檔、AI_CONTEXT.md、project-rules.md、README.md。

## 不要動
真實 .data／profile／認證；正式 47824 服務與專用 App 除非使用者要求；不提交 vendor/；不放寬 CSP。stage 明列路徑，禁止 git add .／-A。

## 未提交變更
無（本檔與狀態文件的驗證更新隨後提交）。ignore 的本機產物：worktree 與主 checkout 的 `outputs/taskboard/vendor/`、worktree 的 `work/preview-isolated` 與 `outputs/taskboard/.data`。

## 假設與未驗證事項
真實內嵌已實測可渲染；假設 Mermaid 之後版本升級時同步改腳本四個固定值。
