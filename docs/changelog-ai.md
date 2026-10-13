# AI 工作紀錄

## 2026-10-13：看板自己派的 Claude run 不再被誤鏡像成「Claude App 對話」

- 使用者回報：在卡片上用「開新對話」送後續需求，結果失敗。查證根因是 CLI 未登入（`claude auth status` 顯示 loggedIn=false，OAuth 過期且無法 refresh），與看板無關，請使用者執行 `claude auth login`。同一張卡片多出一筆「Claude App 對話 · 回合發生錯誤」：全域 mod 也會載入到看板啟動的 `claude -p` 子程序，`mirror_turn` 只在看板 run 仍執行中時略過鏡像；該 run 因登入失敗提早結束，約 5 秒後 mod 的 `turn.complete` 才送達，於是被記成一筆新的鏡像 run。
- claude_adapter.py：派工與 initialize 探測的子程序環境加 `TASKBOARD_DISPATCHED=1`。register.tsx：`mirror()` 遇到這個變數就不送事件（`$.env.get` 失敗時仍照常鏡像）。server.py：沒有進行中鏡像 run 的 `complete`，如果卡片最後一筆是同 session 的看板 run，就回 `board-run` 並捨棄，讓舊版 mod 副本也不會誤鏡像；同 session 的新 `start`（例如在終端機 `claude --resume`）仍照常鏡像。測試：test_taskboard_mirror.py 新增 1 項、taskboard.test.ts 新增 1 項。全域 mod 副本已用 setup-claude-mod.mjs 同步。
- VERIFIED：py_compile、Python 71 項、mod validate、mod test 8 項。NOT VERIFIED：真實派工端到端（需 CLI 重新登入，並重啟正式服務載入 server.py）。實際失敗：初版沒有接住 `$.env.get` 的例外，測試環境未 mock 時整個鏡像被跳過，原本的鏡像測試失敗，已改用 `.catch`。
- 同日續（登入與服務）：使用者授權後重啟正式服務（stop.ps1＋start.ps1 -NoBrowser，同 checkout、同 .data，1.9.0，400 張卡）；使用者自行完成 `claude auth login`，`claude auth status` 為 loggedIn=true。重試的卡片截圖只剩一筆看板 run，沒有多出鏡像 run（間接觀察，當時 CLI 仍未登入）。
- 同日續（重開列又不見）：使用者問關閉窗格後「▦ 任務看板／按 9」為何又不見。Observed Fact：`~/.claude/mods/usage-bar/hooks/register.tsx` 整個資料夾時間為 10/05，`AbovePrompt` 只在 hasSurvey 時呼叫 `next`，10/11 依使用者要求加的往下交已被舊版蓋回（原因未查明）；載入順序 usage-bar → disk-status → taskboard-pane。依使用者選擇不再改 usage-bar，改 setup-claude-mod.mjs：全域路徑一律排在 `CLAUDE_CODE_PLUGIN_DIRS` 第一個（`--check` 會回報不在第一個），寫入後核對第一個是全域路徑。已執行：settings.json 備份至 work/claude-settings-backups，只有 `CLAUDE_CODE_PLUGIN_DIRS` 改變。NOT VERIFIED：「排越前面越先畫」依 10/11 的觀察推論，需新 session 或 `/reload-plugins` 後由使用者確認重開列出現。
- 實際失敗：`/reload-plugins` 後 session 環境已是新順序（taskboard-pane 第一），使用者關掉窗格後重開列仍未出現；plugin-authoring 型別只說明 prepend／user／append／builtin／core 五層由外到內，同層 mod 的先後未記載，排序推論不成立（順序保留）。依使用者選擇改 usage-bar（專案外，原檔備份在 work/usage-bar-backups）：`AbovePrompt` 先 `await next(e)`（失敗時當作沒有），terminal 與 desktop 兩個分支都把下層的畫面畫在用量列下方；測試「不畫引擎 band」改成「畫在用量列下方」。VERIFIED：usage-bar validate（只有既有的 author 欄位警告）、test 6/6。NOT VERIFIED：App 內實際繪製，需 `/reload-plugins` 後由使用者確認。後續：使用者確認關掉窗格後重開列出現（VERIFIED）。
- 同日續（Claude 核准按鈕無效）：使用者在鏡像卡 356f63ef5f76 用開新對話要求 commit，看板跳出 PowerShell 核准（acceptEdits 只自動允許編輯，shell 指令與專案外讀檔需核准，屬設計），核准／拒絕都沒反應。證據：server.log 每次 `POST /api/approvals/claude%3A…` 都是 409；以無效 decision 探測，編碼 ID 回 409、未編碼 ID 回 400，證明程序存活、只是查不到 key。根因：頁面以 encodeURIComponent 送 `claude:<id>`，dispatch 沒有 unquote（Codex 的 ID 沒有冒號所以不受影響；既有測試直接呼叫 `board.answer` 繞過 HTTP）。另一個問題：看板在鏡像卡上執行自己的 session 時，App 的回合仍往同一張卡追加鏡像 run 並改寫 workerThreadId。server.py：approvals 路徑 `unquote`；`mirror_turn` 遇到卡片正是看板 active 卡片時回 `board-run`。測試：test_taskboard_tools.py 的核准測試改走 HTTP 並送百分比編碼 ID；test_taskboard_mirror.py 新增 1 項。VERIFIED：Python 72 項。使用者授權後重啟正式服務（PID 42468，同 checkout／.data，400 張卡）。已知殘留：卡片 356f63ef5f76 上被放棄的 commit run（new_session，session 297e2bba）仍標「running」，依規則不直接改任務資料。NOT VERIFIED：真實 Claude 核准往返（需下一次派工觸發核准）。

## 2026-10-13：卡片 Session 心智圖

- 使用者要求卡片加入 session 心智圖，快速看出卡片關聯幾個 session、每個 session 有幾次對話。index.html：`/* taskboard-session-map:start/end */` 區段（`mapSessions`、`sessionTurnCount`、`mapCounts`、`openSessionMap`、`loadMapCounts`、`renderSessionMap`、`focusMapTarget`）、`#map-dialog`、卡片頁尾 `.card-map` 按鈕、詳情 `#open-map`；run 類型／狀態文字抽成 `RUN_KIND`／`RUN_STATUS` 與詳情共用，`.run-record` 加 `data-run-index`；refresh 時心智圖依 key 比對才重畫。
- VERIFIED：inline script 解析、Node 18 項、Browser 窗格隔離 fixture 實測（計數、分色、唯讀讀回合數、點擊跳轉、明暗、375px）。NOT VERIFIED：正式服務與 Codex App 內嵌。實際失敗：Python 3.9 `write_text` 不支援 `newline` 參數，改 `write_bytes`（保持 LF）。
- 同日續（展開縮放）：`mapCollapsed`（taskId→收合的 session key）、`mapToggle`（`aria-expanded`、`data-key` 重畫後還原焦點）、`setMapCollapsed`、`applyMapZoom`／`zoomMap`（以錨點保持游標下位置、fit 不放大超過 100%）、畫布 wheel（passive:false）／keydown／pointer 拖曳平移、視窗 resize 時重新 fit；`#map-dialog.map-full[open]` 改 flex 版面。實際失敗：初版放大視窗以 `calc(100% - 72px)` 估標頭高度造成對話框捲軸，改 flex；初版焦點以 8 字元 id 前綴比對可能錯配，改 session key；Python 3.9 從 stdin 讀中文長行誤報 Non-UTF-8（改寫檔加 coding 宣告）。

## 2026-10-13：修正服務重啟後 Codex App 嵌入看板卡死，並修 CDP 連線外洩

- 使用者要求查明 App 開著時重啟服務後看板一直「連線中斷」的原因。以 App 開著重啟服務重現；CDP 唯讀探測發現 helper 有打服務、回應也送進 frame，但 frame 的 `api()` 不完成；frame 全域 TOKEN 為舊值、body 無 `embedded`，確認 `Page.setDocumentContent` 重用 realm 導致新主程式因重複宣告不執行、舊程式失去 message 監聽。
- 修正 app-panel.js（`createFrame`、`resetFrame`）與 app-injector.mjs（403→`reloadFrame`→換新 iframe 再載入；新連線先持有、失敗關閉）；taskboard-app.test.mjs 兩個動畫檢查改輪詢。實機以 worktree helper 驗證重啟服務後自動恢復、CDP 連線 2 條；App 測試視窗可見時 4 項 PASS。實際失敗：視窗被最小化時測試動畫檢查失敗；舊 helper stop 後因外洩連線不退出，手動結束 PID 30748。

## 2026-10-13：鏡像卡標題去掉 `<system-reminder>` 並跟隨 Claude App session 標題

- 使用者問為何卡片標題是 `<system-reminder>`，以及在 App 改名後卡片會怎樣。查證：本機 15 個 session 首則訊息第一個文字區塊是 App 的 worktree／暫存資料夾提示；App `local_*.json` 的 `title` 在首回合後才產生（`titleTurn: 0`），建卡時退回首句第一行；改名不同步。使用者同意採標題來源狀態。
- claude_sessions.py：`strip_reminders`（只去掉開頭完整區塊），用於 `_parse_tail` 使用者回合。server.py：`app_title`、`first_line`、`follow_app_title`、`legacy_title_source`；`mirror_turn` 的 text 去提示、建卡記 `titleSource`、每個事件跟隨；`claude_list` 同步後跟隨；`update` 改標題 → manual；API 1.9.0。tests/test_taskboard_mirror.py 新增 3 項；版本斷言改 1.9.0。文件：ADR-020、architecture（流程圖）、AI_CONTEXT、current-status。
- VERIFIED：Python 70、py_compile、Node details／drag／projects（需把真實 Python 放 PATH 前面，`python` 為失效 Store alias）、隔離 DB＋真實 session 索引重現三個 session。NOT VERIFIED：真實 App 改名端到端。同日續：正式服務已重啟為 1.9.0（使用者授權，stop.ps1＋start.ps1 -NoBrowser 絕對路徑，主 checkout、同一資料庫）：重啟後已有回合事件的鏡像卡 0fcf4c、97c1ac、37970a、f8578d 為 titleSource=app 且標題等於 App 標題；ad11df 仍是 `<system-reminder>`，等該 session（AlgoParamFineTune）下一個回合。`taskboard-sessions-app.test.mjs` 重跑：版本 1.9.0、模型清單、frame 重新載入、同步卡片與聊天紀錄皆通過，最後「卡片未改變」的 deepEqual 失敗，差異只在 `sessionStatus`（活躍 session 的訊號時間與標籤在測試期間變動，為衍生欄位），屬測試對活躍 session 的既有脆弱性。實際失敗：Python `write_text` 把 server.py 寫成 CRLF（已還原 LF）；`taskboard-sessions-app.test.mjs` 打正式舊服務失敗（版本與活躍訊號時間差），與修改無關。

## 2026-10-12：回報渲染 Markdown 與 Mermaid 圖（網頁版與 Codex 內嵌版）

- 使用者要求回報能渲染 Markdown 與 Mermaid（流程圖、循序圖、類別圖），兩種頁面都要支援，函式庫由安裝腳本下載、不進 Git。查證 11.6.0（使用者建議）有 XSS／注入公告，經使用者同意改下載 11.17.2（3,572,661 bytes，SHA-256 581ed7d7…390eb8）。
- 新增 `setup-mermaid.mjs`（固定版本／大小／雜湊、`--check` 唯讀、不符刪除）、`.gitignore` 的 `outputs/taskboard/vendor/`；server.py `vendor_mermaid()`＋`GET /api/vendor/mermaid`（沿用 check_api，缺檔 404、雜湊不符 409、mtime 快取），API 1.8.0；index.html `taskboard-markdown` 區段（標題、巢狀清單、表格、引用、分隔線、程式碼區塊、粗體／斜體／行內程式碼，連結只顯示文字＋title）、Mermaid 懶載入／Appearance 配色／重新上色／輸出清理／失敗退回原始碼，套用到 run 回報、session 最近回報、聊天紀錄的進度與回報、狀態列表完成訊息、目前執行回報。`.claude/launch.json` 加 `taskboard-isolated`（47999、work/preview-isolated、--no-connect）。
- 測試：`taskboard-markdown.test.mjs` 11 項（假 DOM，innerHTML 一用即失敗）、`taskboard-mermaid-setup.test.mjs` 5 項、`test_taskboard_vendor.py` 6 項；版本斷言改 1.8.0。
- VERIFIED：實際下載與雜湊核對、Python 67、Node 新測試 16、主題 7、node --check／py_compile、Browser 窗格隔離服務實測（流程／循序／類別圖渲染、無效圖退回、明暗與即時切換、惡意標籤無效、聊天紀錄、模擬內嵌 CSP＋RPC 零違規）。NOT VERIFIED：真實 Codex App 內嵌（正式服務仍是主 checkout 舊碼）。
- 同日續：commit 1921dac 快轉合併 main 並 push；主 checkout 複製已核對的 vendor/、正式服務 1.8.0。`taskboard-app.test.mjs` 4 項 PASS，真實內嵌 frame 畫兩張圖成功、配色等於 App accent、CSP 違規 0。實際失敗：相對路徑指令讓服務一度從 worktree 以空資料庫啟動（已換回）；App 開著時服務重啟後 frame RPC 無回應，重開 App 後恢復，原因未查明。
## 2026-10-12：Claude App 對話鏡像為看板卡片（mod turn 事件 → /api/claude-turns）

- 使用者反映唯讀同步卡片的欄位（進行中／待審核）與建立派工卡片後的列管對不上；先提出兩個方向（欄位只反映看板流程／建卡時匯入最後回合），使用者改提由 mod 自動建卡並派工；評估排程派工會用 `claude -p` 重跑同一句需求，改為鏡像 run。使用者決定：同 session 不重複建卡（每句一筆 run）、已完成卡片重開。
- server.py：`Board.mirror_turn`＋`POST /api/claude-turns`；`update` 拒絕移動鏡像執行中的卡片（同狀態 PATCH 不再撞「請用開始執行」）、`start` 拒絕 in_progress 卡片；API_VERSION 1.6.0。index.html：`mirroring(t)` 控制拖曳、徽章、詳情停用，run 標籤「Claude App 對話」。register.tsx：`mirror()`、`turn.start`／`turn.complete` hook（略過 subagent）；taskboard.test.ts 新增鏡像測試。新增 tests/test_taskboard_mirror.py；版本斷言改 1.6.0（plans、tools、sessions-app）。
- VERIFIED：py_compile、Python 57 測試、mod validate／test 7 項、隔離服務與 Browser 窗格實測進行中→待審核。後續由本 Claude App session 實測：mod turn 事件真實送達（舊碼 404 → 重啟正式服務為 1.6.0 後 200）、首句建卡進「進行中」、sourceId 等於 transcript id、唯讀卡被取代、徽章與停用控制項正確。NOT VERIFIED：真實回合結束後進待審核、DOM 測試（需專用 renderer 與可用 `python`）。
- 同日續（使用者看過鏡像卡聊天紀錄後的三點要求）：聊天紀錄回合改 `details` 摺疊（只展開最新）、你／Claude 訊息配色（`msg-user`／`msg-progress`／`msg-agent`，全用既有 token）；簡介擬稿：`brief` seed→drafted→manual、`event=brief`、`first_prompt`、手改鎖定、舊卡重播種（ADR-018）；mod `draftBrief` 用 `$.model.complete` haiku／low；服務重啟復原跳過鏡像中的卡片（實測重啟時 run 被標中止）。API 1.7.0；版本斷言改 1.7.0。新增 Python 測試 4 項、mod 鏡像測試改為含 brief。VERIFIED：Python 61、mod 7、Browser 窗格實測摺疊與配色、真實回合結束→待審核。NOT VERIFIED：真實 haiku 擬稿回寫。實際失敗：bash `python`／`py -3.12` 為失效 Store alias；Python `write_text` 把 LF 檔寫成 CRLF，已逐檔還原。已執行 `setup-claude-mod.mjs` 同步全域副本。ADR-017。
## 2026-10-12：看板名字改讀 Codex／Claude Code 登入帳號；服務識別改用 meta 標記

- 使用者問左上角「Caspar」的來源：寫死在 index.html。先改為電腦使用者名稱，使用者改要登入帳號：server.py 新增 `claude_account_name`（`~/.claude.json` 的 `oauthAccount.displayName`）、`codex_account_name`（`~/.codex/auth.json` id_token 的 `name` claim，只解碼名字與 email，不保存 token）、`board_user_name(tool)`：`embed=1` 用 Codex 帳號，其餘用 Claude Code 帳號，缺的用另一個，都沒有顯示「使用者」；送頁面時填入 `__BOARD_USER__`。
- 換名後 Codex App 畫面一直閃：app-injector.mjs 以 `html.includes('Caspar')` 辨識服務，失敗就反覆重載。index.html 加 `<meta name="taskboard-service" content="caspar-taskboard">`，app-injector.mjs、start.ps1、stop.ps1 改看它。
- VERIFIED：py_compile、node --check、.ps1 Parser 無錯誤；重啟後 47824 的 `/` 為「CasparHsu 的任務看板」、`/?embed=1` 為「Hsu Shih Lin 的任務看板」；stop-app／start-app 後 app-status `ready`、`frameLoaded: true`；Python 50 測試通過。NOT VERIFIED：Codex App 視窗實際畫面、`tests/taskboard-app.test.mjs`。已 commit 並 push（使用者授權）。

## 2026-10-12：驗收完成時清除舊的失敗訊息

- 解釋「需要處理」徽章（卡片 error 非空）與拖到已完成時重播舊錯誤的原因（Store.put 的狀態事件沿用卡片 error，PATCH done 不清除）。使用者決定：done 時清除 error；後續對話或二次修正解決後卡片要更新。
- server.py Board.update 的清除條件由 `todo` 擴為 `todo`／`done`；run 內錯誤保留。後續 run 成功覆寫 error 為既有行為，新增測試 `test_failed_run_clears_after_successful_followup_or_acceptance` 覆蓋 followup 成功與驗收兩條路徑及事件內容。
- VERIFIED：新測試修正前失敗、修正後通過，`py -3.9` 全套 50 測試通過。實際阻礙：本機 `python` 為 Store alias stub，heredoc 編輯靜默未寫入，改用編輯工具重做；`py -3.12` 無法建立程序。未 stage、commit、push。

## 2026-10-12：啟用 Codex App 任務看板入口

- 依使用者要求，執行既有 `outputs/taskboard/start-app.ps1`，重用 47824 服務並啟動專用 Codex profile／9232 renderer 與 helper；未改產品程式或真實任務資料。
- VERIFIED：專用 profile 所有權核對、左側圖示及「New chat」下方文字入口、看板載入；既有 App 整合測試四組全部通過（API、主題、圖示、reload 後單一入口與內容）。普通 Codex 視窗保留，未派工或消耗模型額度。
- 實際阻礙：沙箱無法建立命令程序，經範圍限定核准後在沙箱外執行；啟動器初次等候原生導覽列，稍後載入成功。未另做完整關閉／桌面捷徑冷啟動。啟動前工作目錄乾淨；本輪只有三份交接文件未提交。

## 2026-10-12：新電腦安裝看板；詳情「建立派工卡片」漏傳工具修正

- 新電腦（HQ 筆電）安裝：setup-claude-mod.mjs 同步 6 個檔案到 ~/.claude/mods/taskboard-pane 並登記 CLAUDE_CODE_PLUGIN_DIRS（原設定備份至 work）；install-desktop-shortcut.ps1 建立桌面 Codex.lnk；start.ps1 以 Codex runtime Python 3.12 啟動 47824。使用者 /reload-plugins 後本 session 載入 taskboard-pane（4 plugins）。
- 安裝腳本回報「找不到 Python」為誤判：cmd 下 `python` 為 9009（Store Python 3.12 登錄已失效、py -3.12 無法執行），但 start.ps1 優先用 Codex runtime Python，服務正常；Windows Store alias `python` 在 bash 也會靜默不執行腳本，改用 runtime Python 路徑。
- 使用者回報 Claude 同步卡片在詳情按「建立派工卡片」出現「請先更新聊天清單」。根因：index.html 詳情按鈕只送 threadId、未送 tool，server 預設 codex 查不到 Claude session；既有對話頁同功能已帶 tool，Codex 卡片因預設值剛好不受影響。修正：帶 `editing.sourceTool||toolOf(editing)`。Browser 窗格實測：同一卡片匯入成功、狀態可改、可拖曳（VERIFIED）。拖曳／改狀態對同步卡片本身不可用屬設計行為。

## 2026-10-11：Store 版 Claude App 的 session 路徑修正

- 使用者回報看板讀不到 Claude App sessions。逐項排除：檔案存在（51 筆）、server 環境 APPDATA 正確、同使用者同 token、程式碼與 pyc 皆現行、能力值無快取；隔離實例從 Claude shell 啟動可讀。最後以 PowerShell Target 與 GetPackageFullName 證實 Claude App 為 MSIX 套件、AppData 虛擬化，桌面啟動的服務看不到 `%APPDATA%\Claude\claude-code-sessions`。
- 修正 claude_sessions.py 候選路徑（套件 LocalCache 優先）、不可用時重新解析；claude_adapter 能力值加 `sessionRoot`；index.html 橫幅附路徑；新增 2 個單元測試；README／AI_CONTEXT／architecture 更新。
- 中途曾建議使用者重啟服務（無效，因根因在路徑不在程序狀態）；未從 Claude 工具內啟動正式服務以免繼承 CLAUDECODE 環境。待使用者 stop.ps1 後以桌面捷徑重啟驗收。
- 使用者要求一併處理偶發的排程測試：量測 `time.time()` 解析度 15.6 ms，確認是產品問題（同 tick 排入的卡片 queuedAt 相同）。新增 `queue_stamp()` 與 `queue_order` 次鍵、新增測試；全套 49 測試三次通過；ADR-016。

## 2026-10-11：看板 mod 跨 session／跨電腦安裝腳本

- 使用者問筆電 pull 後能否直接用、為何本 session 看不到看板。查明 dev-mods 快照是 session 專屬（資料夾名＝session id），mod 原始碼雖在 Git 內但不會自動載入；.data、work、settings.local 不在 Git；.codex/ 未追蹤。
- 新增 outputs/taskboard/setup-claude-mod.mjs（Node，JSON 不經 PowerShell 5.1 轉義）。第一版登記專案來源路徑；使用者要求「改成全域」，改為雜湊比對同步到 ~/.claude/mods/taskboard-pane（與 usage-bar 同位置、保留引擎寫入檔、覆寫前備份），再登記全域路徑並移除專案路徑；settings.json 只改 CLAUDE_CODE_PLUGIN_DIRS／DIR_WATCH，備份至 work、回讀核對、--check 唯讀、前置條件與 validate 回報、列出舊副本但不刪除。gitignore 引擎寫入檔。README／AI_CONTEXT／ADR-014 更新。
- 實際阻礙：自動模式以 Self-Modification 拒絕執行寫入 settings.json，未繞過；改由使用者執行。使用者執行後 --check 就緒、/reload-plugins 本 session 載入 taskboard-pane（VERIFIED）；筆電與新 session 自動開啟 NOT VERIFIED。
- 使用者授權 commit 與 push：本機 c9b3519（無 Git 身分，-c 一次性指定）。Git HTTPS OpenSSL 憑證鏈失敗，-c http.sslBackend=schannel 一次性改用 Windows 憑證庫即可連線，未改 gitconfig。origin/main 樹與上一本機提交一致，依 ADR-013 commit-tree 快照 cf3f1cf fast-forward 推送 main，回讀 tree 一致（VERIFIED）。

## 2026-10-11：TaskBoardTool 雲端發布驗證

- 使用者已明確授權指定 GitHub。修正提交 41c6fd5、發布方式說明 0c1d9bd；直接 Git push 缺認證失敗，改用已連線且有 push 權限的 GitHub 連接器，沒有複製 token 或修改全域設定。
- 空庫 README 初始化後，以 Git data API 發布 77 個已提交檔案至 main。首次雲端提交 3a092ee8f3dc89f8505d079a5b2338404b14255c；VERIFIED：API branch 回讀與 git fetch／git diff --exit-code，遠端與本機 tree 同為 bbae48d6406ac703b1521de49c8b59430e23c892。
- 最後文件檢查初次直接執行 .ps1 被系統 execution policy 阻擋，改為專案既有 powershell.exe -NoProfile -ExecutionPolicy Bypass -File 形式（只限子程序、不修改政策），Strict 0 失敗／0 警告與安裝副本 -Check 一致。
- 本機 master 與原歷史保留；雲端為獨立提交，未宣稱原歷史已推送，不強制覆寫。此發布紀錄後續亦正常更新雲端，最終 SHA 以 origin/main／API 為準。私人資料、未知 .codex/ 與備份未發布，未直接修改任務資料庫。
- Claude 安裝副本已同步且模擬測試通過；實際 App 重新載入與畫面因控制許可不足未驗證，需使用者 /reload-plugins、/taskboard；正式服務 folder API 與原生資料夾視窗實際操作仍待驗收。

## 2026-10-11：Claude App 舊安裝快照修正與 GitHub 授權

- 使用者回報 App 仍顯示「積壓」，並明確授權推送。Observed Fact：App 安裝副本非連結，register.tsx／types 與 2a2609d 相同，未包含後續修改。
- 處理：外掛升至 0.1.1，新增 update-claude-mod.ps1 與說明／ADR-012／架構流程。同步四個差異檔，更新前備份至 work（不進 Git）、更新後逐檔雜湊；再同步新測試。保留 tsconfig，不改官方 App、登入與真實任務資料。
- VERIFIED：來源／安裝副本各 6/6 模擬測試，明確斷言列管且沒有積壓；validate、同步 -Check／重複同步、PowerShell Parser、技能同步／-Check、Strict、路由 74/74 通過；77 個目前檔案常見憑證模式無命中，不是完整秘密稽核。
- 實際阻礙：Computer Use 拒絕 Claude 操作（未取得 App 控制許可），當前 App 畫面／熱載入 NOT VERIFIED，需人工 /reload-plugins、/taskboard。不能以檔案雜湊成功代替平台驗收。
- GitHub 目的地與授權已確認；41c6fd5 已提交，直接 Git push 因本機缺認證失敗，改採已授權連接器發布快照（保留 master 歷史、遠端提交獨立），完成後核對 tree SHA。未知 .codex/、真實 .data／認證／本機備份排除。
- 文件更新初次 PowerShell 5.1 管線未設 UTF-8 導致標題比對失敗且未寫檔；設定 OutputEncoding=UTF8 後重做，依實際 Git diff 檢查。

## 2026-10-11：任務 86d197a4fe25 列管／專案候選／資料夾選擇

- 本機功能提交 `24629f4` 已完成（21 檔），origin 設為使用者指定 TaskBoardTool；公開 main 推送待明確授權。首次 commit 因 Git 作者未設定失敗；確認既有作者後僅對本次命令指定 Codex <codex@local.invalid> 成功，不改全域設定。未知 `.codex/` 保留未追蹤。
- 變更：backlog 只更名「列管」；網頁 input＋datalist 與 Claude 原生窗格 Select＋Input 重用專案名稱，唯一路徑自動帶入，多路徑提供選項，新名稱在儲存後列入候選；保留手動路徑、輪詢不覆蓋草稿。
- 新增 folder_picker.py／select-folder.ps1：受既有認證與來源保護的非同步選擇／輪詢／取消 API，原生 Windows 視窗、300 秒逾時、服務關閉清理。選擇不改任務資料。新增 HTTP／程序生命週期與隔離 DOM 測試、Claude 模擬流程；README 根索引、操作說明、AI_CONTEXT、ADR-011 與架構前後圖。
- VERIFIED：後端 46/46、主題 7/7、專案三組／拖曳六組／詳情 DOM；Claude validate、6/6；Python／inline JS／Node／PowerShell 語法、git diff --check；新增表單隔離截圖檢視。76 個候選檔案與 165 個歷史 blob 常見憑證模式無命中，Git 歷史未見私人資料檔名；不稱完整秘密稽核。
- GitHub 目的地已確認：公開空庫 chielinHsu/TaskBoardTool，main、有 push 權限、ls-remote 無 ref；待外部傳送明確授權。未上傳、未重啟正式服務或直接修改真實資料庫，未知 .codex/ 保留。
- 實際失敗與修正：HTTP 測試變數遮蔽套件、iframe isolated world 讀不到主世界變數已改正；Claude PATH／shim 失敗後使用 native exe 限縮執行；Git OpenSSL 信任鏈與 sandbox schannel 失敗後單次 schannel 限縮執行成功。原生資料夾實際點選、正式服務載入與 GitHub 遠端 SHA 尚未驗證。

## 2026-10-11：任務 86d197a4fe25 GitHub 推送準備（待目的地與授權）

- Observed Fact：專案已有 Git／完整共用協作骨架，master HEAD 為 `2a2609d`，沒有設定 remote；10 個已追蹤修改檔案加新增拖曳測試，另有來源不明的未追蹤 `.codex/`。
- 處理：檢查既有拖曳／auto_review 差異、Git 歷史檔名與 71 个候選檔案的常見憑證模式；私人資料排除規則保留，`.codex/` 未納入候選。已詢問 GitHub 目的地，沒有自行建立或選擇 repository。
- VERIFIED：後端 42/42、主題 7/7、拖曳六組隔離測試、詳情 DOM 回歸、inline JS／Node 語法、git diff --check；技能同步與 -Check 一致、Strict 0 失敗／0 警告、路由 74/74。常見憑證模式無命中，Git 歷史檔名無私人資料路徑；不宣稱完整秘密稽核。
- 本次未發生測試失敗。NOT VERIFIED：GitHub 目的分支／遠端 SHA／推送；缺目的地及外部傳送明確授權。未 stage／commit／push、未改真實任務資料、未呼叫模型。

## 2026-10-11：管理看板滑鼠拖曳

- Observed Fact：已有 HTML5 drag/drop，但 `renderBoard()` 每次輪詢會重建來源卡片；使用者要求用滑鼠拉動卡片切換狀態。輪詢可能中斷原生拖曳為程式推論，未宣稱是所有原生拖曳失敗的已重現根因。
- Decision／變更：Pointer Events＋看板 pointer capture，拖曳時跳過 DOM 重建；浮動卡片、欄位提示、邊緣捲動、取消清理與版本保護。沿用 PATCH／start、驗收確認與前置限制，未改後端；README、測試命令、ADR-010、架構流程及交接更新。
- VERIFIED：隔離真實滑鼠六組檢查含 opaque iframe capability RPC；詳情回歸、主題 7/7、後端 42/42；專用 App 主題／入口／reload 回歸通過，新介面已載入。背景頁 RAF 的捲動 tick 在測試中顯式推進；未用真實卡片拖曳派工、未呼叫模型。
- 實際測試失敗：sandbox CDP EACCES → scoped escalation；無焦點漏 pointerdown／前景真實滑鼠干擾 → 背景 target＋焦點模擬；測試唯讀點擊留詳情遮罩 → 清理；窄視窗固定 x 落在看板外 → 實際右邊界；srcdoc 換程序無 frame → 與 App 相同 about:blank／Page.setDocumentContent。最終全部通過。
- 保留先前 auto_review 的 adapter／測試／文件修改及 `.codex/`；未 stage／commit／push。

## 2026-10-11：Codex 原生自動審核

- Observed Fact：看板 thread/start 固定 `approvalsReviewer=user`，續跑及 turn/start 未明確覆蓋 reviewer；使用者對例行唯讀查核被反覆詢問。官方設定文件與本機 app-server schema 均支援 auto_review。
- 變更：CodexAdapter 三個啟動邊界指定 auto_review，維持 on-request／workspace-write／networkAccess=false；延伸既有新建與續跑測試，README、架構、ADR-009 與交接記錄現況。
- VERIFIED：`python -X utf8 -m unittest discover -s tests -p 'test_taskboard_*.py'` 42/42；協定 schema 生成及欄位核對不呼叫模型。服務以原 data-dir 重新啟動，31 原 session 的 followup 恢復，原 run 留為 interrupted；10 張卡片／16 依賴／7 關聯回讀一致，automatic=true、核准待辦為 0。
- 協作結構檢查（Strict）：26 個必要檔案、skill 鏡像、38 行交接通過，0 失敗／0 警告；git diff --check 通過（VERIFIED）。
- 真實回合：2 個命令完成（exitCode=0）；1 個命令失敗（exitCode=-1），並非驗收通過。未升級、未部署、未寫遠端資料、未 commit／push；`.codex/` 原先未追蹤內容保留。
- 連線問題：服務重新載入後嵌入畫面顯示離線，API 正常；透過既有 stop-app／start-app 重新連線，app-status 回讀 ready／serviceAvailable=true／frameLoaded=true／active=true（VERIFIED）；未重跑任務。

## 2026-10-11（下午五）：窗格重開按鈕與 usage-bar 共用上方位置

- Observed Fact：鍵綁定無法綁 slash 指令或外掛窗格；AbovePrompt 位置由所有 mod 共用，使用者的 `~/.claude/mods/usage-bar` 直接回傳畫面不呼叫 `next`，看板 mod 的重開列畫不出來（測試套件只驗證元素描述，不驗證 App 繪製—實際失敗）。
- 變更：依使用者要求修改專案外的 usage-bar（`await next(e)` 後把結果畫在用量列下方，其測試改為預期往下傳，6/6）；看板 mod 加回 AbovePrompt 重開列（熱鍵 9，與其他 band 合成，窗格開著時隱藏），mod 5/5；/reload-plugins 後使用者確認按鈕出現。
- 同批未提交：人工略過前置（force／override 留言）、排程順序 queuedAt、後續需求立即執行 startNow；依使用者授權提交。

## 2026-10-11（下午四）：排程順序與後續需求立即執行

- Observed Fact：使用者要求自動派工以優先級、同級依進入待辦先後決定；後續需求要能選擇排入待辦或立即執行（看不到自動派工何時認領）。原本排程用建立時間，後續需求固定回待辦。
- 變更：`queuedAt`＋`queue_order`，進入待辦的四條路徑皆記錄；`followup(startNow)` 立即派工、失敗留待辦並回 `startError`；index.html 後續需求模式選單（卡片與對話視窗）、待辦欄排序與排隊標示；mod 窗格同序。測試 test_taskboard_queue 3 項。
- 未 stage／commit／push（待使用者授權）。

## 2026-10-11（下午三）：人工略過前置

- Observed Fact：使用者問前置待審核但想手動先跑後續卡片是否可行；原本 start 回 409、排程跳過，只能移除依賴。
- 變更：`start(force)`、API `{force:true}`、override 留言；index.html 按鈕改標籤＋確認；mod 待辦被阻擋卡片「略過前置執行」；測試新增（後端 1、mod 1、details 斷言更新）。實際失敗：shell 傳輸把 `\\n` 折成 `\n` 使頁面 JS 斷行，改以檔案腳本修復；temp 清理改容忍所有 OSError。
- 未 stage／commit／push（待使用者授權）。

## 2026-10-11（下午二）：工具篩選與 Claude App 群組

- Observed Fact：Claude 卡片專案為資料夾名、與 Codex 同列；App 側欄群組只在 App 狀態（`%APPDATA%\Claude` 無對應檔案），但 session 連接器 `list_sessions` 回傳 `sessionId=local_<id>` 與 `group.name`。
- 變更：server `set_claude_groups`／`claude_groups`／`POST /api/claude-groups`、claude_list 與 session_card 套用群組名、import_chat 沿用、state 加 `claudeGroupsAt`；index.html 工具篩選、依工具分組專案選單、橫幅群組同步狀態；mod `syncGroups`（`$.mcp.call` → 看板）於開窗格／每 60 秒／重新整理執行，未變更不重送。
- VERIFIED：後端 38/38、mod 4/4、validate、頁面語法、真實服務重啟；熱重載後 App 群組實際同步到看板（使用者確認）。依使用者授權提交。

## 2026-10-11（下午）：計畫匯入、依賴與自動釋放

- Observed Fact：使用者要求功能展開後自動建卡、Claude Code 事項依 MODEL_ROUTING 角色設定 AI 模式、有先後關係的事項建立依賴，前置完成後自動推進；ADR-005 原本排除阻塞關係。
- 變更：server `task_dependencies`／`dependsOn`／`blocks`／循環檢查／blockers／release_dependents／effort／import_plan／`ROLE_ROUTING`；claude_adapter `--effort` 與目錄驗證；失敗重試採卡片目前 model／effort；index.html 推理強度、前置卡片、徽章、匯入計畫對話框；plan_import.py；mod `import_plan` 工具與阻擋顯示；MODEL_ROUTING 新增「功能展開 → 看板計畫匯入」；ADR-008。
- VERIFIED：後端 36/36、details 真實 DOM 測試擴充通過、mod 3/3、validate 通過、真實服務 1.5.0。實際失敗：同毫秒建立的計畫卡片 createdAt 相同（改單調遞增）；失敗 run 重試沿用舊 effort 導致修正無效（改採卡片目前值）；假 CLI 目錄缺路由別名（補 sonnet／opus／haiku）；長路徑 scratchpad 腳本 Python 無法開啟（複製到 work/ 執行）。
- NOT VERIFIED：真實 `--effort` 派工、模型在 App 內實際呼叫 import_plan。未 stage／commit／push。

## 2026-10-11：Codex／Claude Code 共用看板

- Observed Fact：本機 Claude App 2.31226.1.0 與 npm Claude Code CLI 2.1.283（bin/claude.exe）。stream-json initialize 握手不送 prompt 即回傳 5 個模型；官方文件確認 --session-id／--resume／--model／--permission-mode／--permission-prompt-tool 與 launch.json url 附掛；控制協定、-p session 在 Desktop /resume、Desktop 嵌入入口均未文件化；App 程式碼 claude://code/continue 只接受 last／local_<id>。
- 變更：tool_adapters／claude_adapter／claude_sessions 新模組；server 任務與 run 帶 tool、(tool,id) 去重、handoff 新對話、nextRun 快照與取消、共用 complete_run；index.html 工具／模型選單、徽章、能力提示、跨工具後續需求、Claude 核准與 resume 指令；start.ps1、.claude/launch.json、README／AI_CONTEXT／架構／ADR-006。
- VERIFIED：後端 30/30、主題 7/7、專用 Codex App 真實 DOM details（含 Claude 項目）、語法／Strict／sync／路由；真實服務 1.4.0 的 Claude CLI 可用、真實模型清單、88＋48 sessions 同步、對話可讀、資料不變；Claude App Browser 窗格開啟看板。
- 實際失敗：重試 run kind 預期錯誤改正；程序管線／關閉 DB 例外處理；fixture 同名卡片改名；sessions UI 測試因 Codex 對話讀取 19 秒 RST 失敗，最小跨程序重現確認為 HTTP/1.0 大回應後立即關閉的 loopback 段遺失，改 HTTP/1.1 keep-alive＋16 KB 分段 flush（ADR-007）後 80/80；transcript 改檔尾視窗讀取（258 MB 0.6 秒）；專用 App helper 白名單拒絕 `?tool=` 查詢（Unsupported board request），放寬為只接受 tool 查詢並重啟 helper，前端 Codex 路徑維持無查詢。
- 真實派工（使用者授權，haiku、隔離看板）：第一次 OAuth 過期被正確記為失敗；重新登入後首次執行 18.5 秒 $0.084 完成並正確回報，同 session `--resume` 後續需求 14 秒 $0.099，真實 Bash 核准請求由看板核准後執行（`git status` 為 CLI 自動允許的唯讀指令不提示）。
- 使用者要求 App 左側可直接點選：查明 Claude Code mods 只能停靠 Pane／slash command（元件表 Box／Text／Button／Markdown／Link，無網頁內嵌；Link 僅 https 或 localhost；左側導覽清單無 API）。新增 `claude-mod/taskboard-pane`（register.tsx、types、plugin／marketplace 清單、測試），validate 通過、`claude plugin test` 2/2；複製到 session dev-mods 等待熱載入授權。
- 使用者允許熱載入後窗格未出現：App 代管 session 的 session.start 無 surface，原本的門檻跳過開窗；改一律 `$.ui.open` 並依 `isPlaced` 輪詢，熱重載後窗格實際出現（使用者截圖）—VERIFIED。
- 使用者要求窗格內直接建卡：加入 Input／Select 表單（工具切換時以 `/api/models` 載入模型，`$.state` 快取）、建立／建立並開始執行／移到待辦；toast 改為不致命；測試覆蓋填表、選工具與模型、POST body、空標題不送出；一度誤判 loadModels 未執行，實為 `$.state` 跨 surface 迴圈保留快取，改以選單選項斷言。
- NOT VERIFIED：窗格按鈕對真實任務的操作、-p session 於 Claude App /resume、Remote Control。未 stage／commit／push／發布。

## 2026-10-10：右側屬性、模型選擇、標籤與相關議題

- Observed Fact：使用者更正右側屬性，要求創建日期、負責模型、標籤與相關卡片；排除截止日期及阻塞關係，要求查上游工作流／開發上下文。
- 變更：右側欄位／日期、model/list 動態模型選單、實際新建／延續／回合 model 傳參及 run snapshot；標籤去重保存及卡片顯示；SQLite 唯一 pair 雙向關聯、移除／刪除、對端 version 保護，API 1.3.0／export 3。
- VERIFIED：17/17 後端、7/7 主題；隔離實際 DOM／模擬 RPC 的右側、日期、模型／標籤／雙向關聯、多 session、唯讀／窄螢幕。專用 App 1.3.0，真實 model/list 7 個選項、87 張 session 卡片、閱讀與原有卡片／事件／設定不變，沒有派工。
- 實際失敗：sandbox CDP EACCES，scoped escalation 通過；新增關聯測試卡片改變首卡順序，測試改為依標題定位後通過。
- 上游結論：工作流曾綁定命名流程，main 已移除 issue 欄位與 schema；開發上下文指 Git 分支／worktree。暫沿用 cwd，沒有加入 Git 綁定選單。真實模型派工／原生側欄歸屬 NOT VERIFIED。
- 依 ai-handoff 更新狀態、交接、ADR-005、架構、README／AI_CONTEXT；保留既有未提交修改，未 stage／commit／push。

## 2026-10-10：卡片詳情、多 session 與後續對話

- Observed Fact：使用者要求簡介、左側屬性、分類的多 session 清單與不符需求時再次對話；舊卡片重試只留最新 result，專案篩選未帶入新增卡片。
- 變更：index.html 詳情閱讀版、逐 session／run 回報、查看對話內及卡片內後續需求、唯讀來源最近需求與回報、專案預填；server.py runs／nextRun、明確 queue→start／resume、舊資料相容、歷史去重／匯入、重試與中斷紀錄。
- VERIFIED：後端 13/13（包含原同步 6 項）、主題 7/7、JS／Python 語法；隔離真實 DOM／模擬 RPC 驗證 3 sessions／5 runs、需求簡介、左側屬性、未儲存保護、同／新對話、每次結果保留、唯讀內容、窄螢幕；人工查看截圖。
- VERIFIED：更新載入專用 App 1.2.0，無 active／todo 時安全重啟，任務／設定／事件內容 SHA-256 相同；實際 87 張同步卡片、唯讀詳情及聊天閱讀、Appearance／icon／即時主題／reload 回歸通過。
- 實際失敗：留白路徑預先排隊被誤驗證，改驗使用者路徑後通過；UI 同步讀舊數量，改等快照；sandbox CDP EACCES 經 scoped escalation 通過；服務載入傳輸中斷以不重用 HTTP 連線重試完成，未斷言根因。
- NOT VERIFIED：真實模型派工、原生側欄 Project 歸屬、其他 App 精確並行 runtime；沒有模型額度測試。舊版覆寫結果不推造，來源只在明確延續需求後續跑。
- 保留開工時已有的未提交修改；未 stage／commit／push。ADR-004、架構前後圖、AI_CONTEXT、README、狀態及交接更新。

## 2026-10-10：既有 sessions 自動同步

- Observed Fact：聊天只手動更新／匯入；獨立 app-server 對本聊天回報 notLoaded、回合 interrupted，不能當跨程序 runtime。
- 變更：session_sync.py 受限 JSONL 尾端訊號與快取；server.py 背景清單／唯讀投影／去重；index.html 自動清單、狀態提示、唯讀禁止拖曳與派工。保存任務／來源聊天／認證未修改。
- VERIFIED：隔離 6/6、主題 7/7、Python／JS 語法；App 86 張自動卡片／聊天閱讀／保存資料不變、Appearance／icon／即時主題／reload。開工技能同步／-Check／Strict、路由 74/74 通過，既有骨架未重建。
- 實際失敗：sandbox 探測受限後 scoped escalation 通過；隔離 DB 清理未關閉後修正；App 跨快照計數 81／86，改同快照後通過。
- PARTIALLY VERIFIED：其他 App 活動為 10 分鐘訊號推論，過期／未知待確認，不判定視窗開啟。Claude runtime 未驗證，未耗額度測試。
- 看板無保存卡片／派工時已重啟載入修正；未 stage／commit／push／發布。ADR-003 與架構前後流程圖已保存。

## 2026-10-10：依使用者授權提交

- 使用者明確要求 commit；本次本機提交包含看板啟動與 Appearance 修正、完整共用協作骨架、測試及交接文件。
- 沿用已完成的產品與整合驗證，提交前再檢查文件結構與 Git diff；私人資料、profile、認證及 work 排除版控。
- 未 push、部署或執行耗額度 bench；Claude 平台 runtime 仍未驗證。

## 2026-10-10：完成驗證與交接

- VERIFIED：主題 7/7、路由／hook 74/74、結構 Strict 零錯誤警告、同步與重複同步一致、技能 validator、語法檢查。
- VERIFIED：實際 App 主題／icon 狀態／明暗與自訂色彩／字型／reload；桌面完整關閉再重開恢復單一 helper、入口及內容，一般 App 保留。
- 負向副本：漏匯入、鏡像漂移、壞 JSON、孤立 skill 都被抓出。
- 初期固定等待／theme 等待／hidden HTTP 探測失敗已修正重測；skill cp950 驗證錯誤以 Python -X utf8 解決；screenshot fallback 不作像素一致性成功證據。
- 本次修正與骨架未提交，没有 push／部署；Claude runtime／model effort 未驗證，bench 僅顯示計畫。

## 2026-10-10：看板修正与協作骨架
- Observed Fact：Git 原先零提交，缺共用骨架；原生桌面啟動無看板入口；色彩寫死，clone 剝除樣式属性。
- 變更：Git 基準、完整共用文件／harness／角色／hook／同步檢查、desktop launcher、UTF8、mutex、Appearance bridge。
- VERIFIED：主題單元7/7、語法、實際 App 色彩／選取／明暗及自訂色彩／reload。
- 實際失敗與後續：固定等待改新 frame 就緒；隱藏啟動改 UseBasicParsing 重測；screenshot fallback。
- NOT VERIFIED：Claude runtime、模型額度 bench。
