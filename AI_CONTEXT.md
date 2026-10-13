# Codex 小工具：專案事實

## 用途
Windows 本機任務看板，同一套 SQLite／排程／介面派工給已安裝的 Codex app-server 與 Claude Code CLI；專用 Codex App profile 的 CDP renderer 嵌入看板，Claude 側為 CLI 整合（看板不內嵌於 Claude App，可用 Claude App 的 Browser 窗格或瀏覽器開啟）。

## 技術棧
Python 標準函式庫 HTTP server／SQLite／subprocess RPC；原生 HTML／CSS／JavaScript（回報 Markdown 為原生轉換器；Mermaid 11.17.2 為唯一外部前端函式庫，安裝腳本下載、不進 Git，ADR-019）；Node 原生 WebSocket；Windows PowerShell 5.1／WSH VBScript／Microsoft Store Codex App。無 package.json 或 npm build。實際 Node 24.19.0、Claude CLI 2.1.283 已確認；未消耗模型額度。

## 重要目錄
| 位置 | 職責 |
|---|---|
| outputs/taskboard/server.py | API、SQLite、單一任務排程、共用 run 完成／進度／session 綁定、Codex RPC 程序 |
| outputs/taskboard/tool_adapters.py | ToolAdapter 介面、(tool, id) session 鍵、CodexAdapter（模型／派工／事件／核准／對話） |
| outputs/taskboard/claude_adapter.py | ClaudeAdapter：claude -p stream-json 程序、initialize 模型清單、can_use_tool 核准、interrupt 停止 |
| outputs/taskboard/claude_sessions.py | 唯讀 Claude App session 中繼資料索引、transcript 尾端訊號與回合閱讀 |
| outputs/taskboard/session_sync.py | 唯讀 Codex session 回合訊號與衍生追蹤卡片（session_card 支援 tool） |
| .claude/launch.json | Claude App Browser 窗格附掛看板服務的 preview 設定（taskboard） |
| outputs/taskboard/claude-mod/taskboard-pane | Claude Code mod：停靠側邊窗格、/taskboard、窗格建卡、`import_plan` 工具、`turn.start`／`turn.complete` 鏡像 session 回合到 `/api/claude-turns`；`claude plugin validate/test`（需 CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1） |
| outputs/taskboard/setup-claude-mod.mjs | 把 claude-mod/taskboard-pane 以雜湊比對同步到全域 `~/.claude/mods/taskboard-pane`，並登記到 `~/.claude/settings.json` env.CLAUDE_CODE_PLUGIN_DIRS（與 usage-bar 等 mod 相同；跨 session／跨電腦載入）；檢查前置條件；--check 唯讀，寫入前備份至 work |
| outputs/taskboard/update-claude-mod.ps1 | 舊流程：將原始碼同步至 Claude App session 專屬 .claude/dev-mods 安裝副本；-Check 唯讀比對，更新前備份至 work，更新後雜湊核對 |
| outputs/taskboard/setup-mermaid.mjs、vendor/ | 下載固定版本 Mermaid 並以 SHA-256 核對（--check 唯讀）；vendor/ gitignore，`GET /api/vendor/mermaid` 核對安裝紀錄後以 JSON 供應 |
| outputs/taskboard/plan_import.py | 終端機／Codex 匯入計畫 JSON 到 `/api/plans`（stdlib、loopback） |
| outputs/taskboard/index.html | 看板、卡片、詳情、Session 心智圖（taskboard-session-map 區段）、theme message |
| outputs/taskboard/folder_picker.py、select-folder.ps1 | Windows 原生資料夾選擇工作、輪詢／取消／300 秒逾時；只回傳路徑，不寫任務 |
| outputs/taskboard/app-panel.js | 入口、可見工作區尺寸、選取狀態、theme bridge |
| outputs/taskboard/app-injector.mjs、cdp.mjs | CDP 文件載入、API bridge、重連 |
| outputs/taskboard/*.ps1、launch-app.vbs | 啟動、移除整合、桌面捷徑 |
| outputs/taskboard/.data | 私人資料庫／profile／token，Git 排除 |
| tests／work | 版本化測試／不進 Git 的截圖及隔離資料 |
| .agents／.claude／scripts/ai | 共用協作骨架、Claude 設定及檢查 |

## 建置與測試
在根目錄執行，不需建置套件（本機 `python`／`py -3.12` 若是失效的 Store alias，改用 `py -3`）：
```powershell
node --check outputs/taskboard/app-panel.js
node --check outputs/taskboard/app-injector.mjs
node --test tests/taskboard-theme.test.mjs
python -m py_compile outputs/taskboard/server.py
python -X utf8 -m unittest discover -s tests -p test_taskboard_sessions.py -v
python -X utf8 -m unittest discover -s tests -p 'test_taskboard_*.py' -v
python -X utf8 -m unittest discover -s tests -p test_taskboard_tools.py -v
python -X utf8 -m unittest discover -s tests -p test_taskboard_plans.py -v
set CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 && claude plugin validate outputs/taskboard/claude-mod/taskboard-pane && claude plugin test outputs/taskboard/claude-mod/taskboard-pane
node tests/taskboard-details.test.mjs
node tests/taskboard-drag.test.mjs
node tests/taskboard-projects.test.mjs
node tests/taskboard-sessions-app.test.mjs
node --test tests/taskboard-markdown.test.mjs tests/taskboard-mermaid-setup.test.mjs
python -X utf8 -m unittest discover -s tests -p test_taskboard_vendor.py -v
node outputs/taskboard/setup-mermaid.mjs --check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/ai/sync-skills.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/ai/sync-skills.ps1 -Check
node outputs/taskboard/setup-claude-mod.mjs --check --no-validate
powershell.exe -NoProfile -ExecutionPolicy Bypass -File outputs/taskboard/update-claude-mod.ps1 -Check
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/ai/check-ai-structure.ps1 -Strict
node scripts/ai/check-model-routing.mjs
node scripts/ai/bench-model-routing.mjs
```
實際 App 檢查：先使用桌面 Codex 捷徑或 start-app.ps1，執行 `node tests/taskboard-app.test.mjs`。測試暫時更動專用視窗 DOM 主題後還原、重新整理，不修改保存的卡片或設定。需 Node 原生 WebSocket 及 renderer 存取許可。PowerShell 語法使用 System.Management.Automation.Language.Parser.ParseFile 檢查。

## 限制與不變條件
- 看板 mod 的正規載入方式是全域副本 `~/.claude/mods/taskboard-pane` 加使用者層 `~/.claude/settings.json` 的 `env.CLAUDE_CODE_PLUGIN_DIRS`（setup-claude-mod.mjs 同步副本並登記；只對新 session 生效；git pull 後重跑即同步，已載入的 session 熱重載）。副本中引擎寫入的 `.claude-plugin/types/`、`tsconfig.json` 不覆寫；來源若被 --plugin-dir 直接載入也會產生這兩者，已 gitignore。`.claude/dev-mods/<session id>/taskboard-pane` 是 App「開發 mod」留下的 session 專屬快照，只在該 session 載入，不是原始碼連結；仍使用它時才需 update-claude-mod.ps1 同步（只更新五個已知檔案、保留 tsconfig），再 `/reload-plugins`、`/taskboard`。不碰官方安裝檔或認證。
- 顯示名稱「列管」沿用 `backlog`，不遷移任務資料。專案候選來自 state 中既有卡片／唯讀 session；單一路徑自動載入，同名多路徑需明確選擇，保留手動路徑。`POST /api/folders/select` → `GET /api/folders/<id>`／`POST /api/folders/<id>/cancel`，沿用 token／Host／Origin／capability 保護；單一 Windows 視窗、300 秒逾時、服務關閉清理，選擇不自動儲存。
- 執行工具 `tool` 為 codex／claude，任務、run、nextRun、同步卡片與對話皆帶工具；舊資料讀取時預設 codex，不背景改寫。session 去重與延續用 (tool, id)；延續只能同工具，換工具為 `handoff` 新對話並帶摘要。nextRun 固定保存 tool／model／effort／cwd，排隊期間不可更改，可取消排隊。export schemaVersion=5，API 1.9.0。
- Claude App 對話鏡像：mod 的 `turn.start`／`turn.complete` 送 `POST /api/claude-turns`；session 首句自動建卡直接進進行中（priority high、tool claude、sourceId），每句一筆 `mirror` run，回合結束進待審核（中止→列管、排有 nextRun→待辦），已完成卡重開；鏡像卡不佔單一任務鎖、排程不領、執行中不可移動／派工／送後續需求；看板自己派的 Claude run（active run 未綁定或同 session）不鏡像；真實 App 觸發、session id 等於 transcript id、回合結束進待審核已實測。卡片 `brief` 狀態 seed→drafted→manual：建卡簡介以 transcript 最早一句播種，mod 用 `$.model.complete`（haiku／low）擬「需求簡介＋驗收條件」送 `event=brief`，只在 seed／drafted 接受；使用者改過 description 即 manual 永不覆寫；後續回合不改簡介。標題 `titleSource` seed／app→manual（ADR-020）：App 首回合後才命名，建卡先用首句第一行（transcript 與 mod 文字皆去掉 App 前置的 `<system-reminder>` 區塊），之後在每個回合事件與每次 Claude session 同步跟隨 App 標題（自動命名或 App 改名）；看板上改過標題即 manual 永不覆寫；舊卡在下一個回合判定（標題仍是 `<system-reminder>`／首句第一行／App 標題才跟隨）；服務重啟復原跳過鏡像中的卡片。聊天紀錄每回合 `details` 摺疊（只開最新）、你／進度／回報三種配色。
- 依賴與計畫：`task_dependencies` 有向表投影 `dependsOn`／`blocks`，拒絕自我／循環；排程與 start 跳過被阻擋卡片；卡片進 `done` 時釋放前置全完成的積壓卡片到待辦。`POST /api/plans`（plan_import.py、網頁匯入計畫、mod 工具 import_plan）依 Kahn 順序建卡，`ROLE_ROUTING` 把 Claude 角色對應 model／effort；`effort` 以 `--effort` 傳給 Claude CLI，啟動前依 `supportedEffortLevels` 驗證。失敗 run 重試採卡片目前 model／effort。
- Claude Code 為 CLI 整合：`claude -p --input-format/--output-format stream-json`、`--session-id`／`--resume`、`--model`、`--permission-mode acceptEdits --permission-prompt-tool stdio`；模型清單由 initialize 握手取得（不耗額度）；control 協定無公開文件，依本機 2.1.283 實測。看板不內嵌 Claude App；`claude://` 深連結不能開啟看板建立的 session。真實 Claude 派工與核准往返 NOT VERIFIED。
- Claude session 同步只讀 claude-code-sessions 的 local_*.json 與 `~/.claude/projects` transcript 尾端 256 KiB；Store 版（MSIX）Claude App 的 AppData 被虛擬化，session 檔實際在 `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\claude-code-sessions`，只有 App 子程序能經 `%APPDATA%\Claude\…` 看到；`resolve_desktop_root()` 先找套件路徑再找 Roaming，能力值 `sessionRoot` 顯示實際路徑，桌面啟動的服務因此也能列出；封存不列、不寫 DB、不派工；transcript 格式官方標示為內部格式。Claude App 側欄群組不在磁碟：mod 以 `$.mcp.call('ccd_session_mgmt','list_sessions')` 讀取並 POST `/api/claude-groups`，看板存於設定 `claudeGroups`（desktopId→群組名）作為 Claude 卡片專案名；UI 有工具篩選與依工具分組的專案選單。
- 回報 Markdown 只建立元素與文字節點，不把 AI 文字放進 innerHTML；```mermaid 經 `api('/api/vendor/mermaid')` 懶載入（網頁 fetch／內嵌 RPC 同路徑）、inline script 注入、`securityLevel: 'strict'`、輸出經 template 惰性解析再移除主動內容；配色由 CSS token 轉 hex，根元素主題或系統明暗改變時重新上色；未安裝（404）、雜湊不符（409）或解析失敗退回原始碼＋原因。每個 checkout 需各自執行 setup-mermaid.mjs。
- 預設服務埠 47824、專用 CDP 埠 9232，均為 127.0.0.1；連接前確認專用 profile 所有權。
- 普通原生啟動不會加入看板入口；桌面捷徑使用看板啟動器。App 大改版可能須更新 DOM／CSS 選擇器。
- 原工作區持續掛載；只用可見工作區計算尺寸。
- iframe 為 opaque origin；來源 frame、parent、capability 驗證保留，API token 留在 helper。
- 一次執行一個任務，完成後待人工驗收；測試不改真實卡片或派工設定。
- 任務以 runs 保存每次需求／threadId／turnId／cwd／結果／時間，nextRun 保存明確排入待辦的後續需求。儲存／排隊不建聊天，開始執行才 thread/start 或明確 thread/resume；來源與全部歷史 session 去重。
- 詳情主區為需求簡介、右側為屬性、下方按 session 分組並保存逐次回報。唯讀追蹤卡片按需讀最近可讀需求與回報，標參考，不寫入 DB；建立派工卡片後才能送後續需求。
- 屬性增加不可編輯的創建日期、model 與 labels；模型選單透過獨立 `/api/models` 讀取真實 `model/list`，60 秒記憶體快取，不阻塞 state。所選模型傳入 thread/start、thread/resume、turn/start，run 保存選擇；真實模型派工未驗證。
- 相關議題使用 task_relations 儲存一對排序 ID；API 雙向投影 relatedIds，正常 task JSON 寫入不複製關聯。新增／移除／刪除同步清除並更新對端 version，避免舊草稿覆蓋關聯；export schemaVersion=3，API 1.3.0。無截止日期／阻塞關係／工作流欄位；Git 分支／worktree 綁定尚未實作。
- 後續對話可延續已連結 session 或開新對話；新對話帶原需求及最近三次回報（上限 30000 字）。外部活躍訊號阻擋續跑，但不能保證其他 App runtime 不同時執行；原生側欄歸屬未做模型派工驗證。
- 本機未封存 sessions 每輪同步後等 15 秒再更新；API state 合併唯讀追蹤卡片，不寫入 SQLite、不進 scheduler、不續跑來源；不涵蓋雲端／其他主機／subagent。
- 其他 App runtime 無法由獨立 app-server 精確判定；thread/list metadata 加 CODEX_HOME/sessions 受限 JSONL 尾端訊號，10 分鐘內活動標「近期有執行訊號」，逾期／未知待確認，回合結束待審核，不推導已驗收或視窗是否開啟。
- App 內讀取 Appearance token，独立網頁使用系統明暗模式；UI 繁體中文，時間 Asia/Taipei。

## 詞彙
profile：專用 App 執行環境；helper：app-injector；capability：iframe 通訊授權；待審核：完成後等人工驗收。
run：看板的一次派工紀錄；session／thread：Codex 對話，同一 session 可有多個 run。

## Context Routing
| 任務 | 應讀文件 |
|---|---|
| UI、Appearance、icon | index.html、app-panel.js、current-status.md |
| 啟動／桌面／重開 | start-app.ps1、start.ps1、desktop-launch.ps1、architecture.md |
| 派工、API、保存 | server.py、tool_adapters.py、architecture.md、decisions.md |
| Claude Code 整合 | claude_adapter.py、claude_sessions.py、tests/fake_claude_cli.py、ADR-006 |
| 回報 Markdown／Mermaid | index.html taskboard-markdown 區段、server.py vendor_mermaid、setup-mermaid.mjs、ADR-019 |
| Claude 路由 | MODEL_ROUTING.md、model_router.mjs |
| 同步／交接 | skill-sync.json、ai-handoff/SKILL.md、.ai/handoff.md |
