# Caspar 的任務看板：安裝、整合與運作說明

> 日常操作（新增卡片、派工、驗收、後續需求、心智圖、計畫匯入、排錯）請看分章節的 [操作手冊 docs/user-guide.md](../../docs/user-guide.md)，開頭附 45 秒功能展示影片。本檔說明看板的組成、各項整合如何運作、安裝與更新步驟，以及已知限制與驗證狀態；專案事實與不變條件以 `AI_CONTEXT.md` 為準。

## 1. 組成與檔案一覽

看板是一個 Python 標準函式庫寫成的本機 HTTP 服務（`server.py`），只監聽 `127.0.0.1:47824`，資料存在 `.data/taskboard.sqlite`；介面是單一 `index.html`；Codex 與 Claude Code 透過各自的 adapter 派工，共用同一套卡片、排程與人工驗收。

| 檔案 | 職責 |
|---|---|
| `server.py` | API、SQLite、單一任務排程、run 完成／進度／session 綁定、Codex RPC 程序、Claude 回合鏡像 |
| `tool_adapters.py`、`claude_adapter.py` | ToolAdapter 介面與 Codex／Claude Code 的派工、模型清單、核准、對話讀取 |
| `session_sync.py`、`claude_sessions.py` | 唯讀同步本機 Codex sessions 與 Claude App Code sessions |
| `index.html` | 看板、卡片詳情、聊天紀錄、Session 心智圖、匯入計畫、主題同步 |
| `plan_import.py` | 終端機／Codex 匯入計畫 JSON（loopback、stdlib） |
| `folder_picker.py`、`select-folder.ps1` | 「選擇資料夾…」的 Windows 原生視窗 |
| `start.ps1`、`stop.ps1` | 啟動／停止網頁版服務 |
| `start-app.ps1`、`stop-app.ps1`、`app-injector.mjs`、`app-panel.js`、`cdp.mjs`、`app-remove.mjs` | Codex App 專用視窗整合（CDP helper 與嵌入頁面） |
| `launch-app.vbs`、`desktop-launch.ps1`、`install-desktop-shortcut.ps1`、`開啟 Codex 看板.cmd` | 桌面捷徑與一鍵啟動 |
| `claude-mod/taskboard-pane/`、`setup-claude-mod.mjs`、`update-claude-mod.ps1` | Claude Code App 看板窗格 mod 與安裝／同步腳本 |
| `setup-mermaid.mjs`、`vendor/` | Mermaid 函式庫下載與核對（vendor 不進 Git） |
| `.data/` | SQLite、設定、token、App profile、啟動器 log、捷徑備份（不進 Git） |

需求：Windows 10／11、PowerShell 5.1、Python 3.9 以上（`python` 為 Store 空殼別名時用 `py -3`）、Node 22 以上；Codex 側需 Microsoft Store 版 Codex App，Claude 側需 Claude Code CLI（登入後才能派工）。沒有 npm build，也沒有額外 API Key。

## 2. 啟動、停止與桌面捷徑

| 指令 | 說明 |
|---|---|
| `start.ps1 [-Port 47824] [-NoBrowser] [-DataDirectory <dir>]` | 啟動服務並開瀏覽器到 `http://127.0.0.1:<Port>`；埠已被本看板佔用時重用，被其他服務佔用則報錯。Python 優先用 Codex runtime 內附的解譯器，否則用 PATH 的 `python`。找不到 `codex.exe`（PATH 或 `%LOCALAPPDATA%\OpenAI\Codex\bin`）或 `claude` 時只警告，該工具的派工不可用 |
| `stop.ps1 [-Port]` | 確認埠屬於本看板（頁面含 `taskboard-service` meta 標記）後停止；執行中的任務中斷並保留在待審核 |
| `start-app.ps1 [-Port] [-DebugPort 9232] [-DataDirectory]` | 啟動或重用服務，開啟專用 Codex App 視窗與整合 helper；以 mutex 防止雙擊競態，確認除錯埠屬於專用 profile 且只聽 loopback，否則拒絕 |
| `stop-app.ps1` | 移除側欄入口與嵌入頁面、停止 helper；不關其他 Codex 視窗、不停服務；關閉專用視窗才會關閉其除錯埠 |
| `install-desktop-shortcut.ps1 [-DesktopDirectory]` | 在桌面建立「Codex」捷徑（經 `launch-app.vbs` → `desktop-launch.ps1`）；同名舊捷徑備份到 `.data/desktop-shortcut-backup/` |

- 看板必須由服務提供，不能直接雙擊 `index.html`。
- 中文 PowerShell 腳本使用 UTF-8 BOM，JSON 以 UTF-8 讀取，HTTP 探測用 `-UseBasicParsing`。
- 服務或 helper 曾停止時重新執行啟動器即可恢復並清除殘留入口；重啟時未確認結束的任務進待審核，不重複執行。
- 看板名稱來自登入帳號：Codex 嵌入版顯示 Codex 登入者，瀏覽器與 Claude App Browser 窗格顯示 Claude Code 登入者，缺的互補，都沒有顯示「使用者」。

## 3. Codex App 專用視窗整合

整合方式參考 [dashi-taskboard](https://github.com/chuspeeism/dashi-taskboard)：使用獨立的 App profile、只聽 `127.0.0.1` 的 CDP 除錯埠 9232，在執行期把看板入口與嵌入頁面加進專用視窗。沒有改寫 Codex 安裝檔、沒有複製登入資料；它是執行期嵌入，不是官方功能，Codex 大改版時可能需要更新 DOM／CSS 選擇器。

- **入口**：專用視窗左側「New chat／新聊天」下方多出文字按鈕「任務看板」，最左側導覽也有看板圖示；點擊後在主工作區顯示看板，其他原生導覽按鈕可切回原工作區。普通方式啟動的 Codex 視窗不會有入口。
- **嵌入**：App 限制直接導向本機網址的 iframe，因此採隔離的空白 iframe 由 CDP 載入文件。看板與主 App 通訊檢查來源 frame 與隨機 capability，再由 helper 呼叫本機 API；API token 留在 helper，原本的 token／Origin 保護保留。CDP 只對專用視窗設定 CSP bypass，移除整合時恢復。
- **尺寸與切頁**：原生 App 會保留已隱藏的頁面節點，整合只用可見工作區計算尺寸並觀察尺寸與顯示狀態變化；原生聊天列會正確收起看板並清除選中狀態；入口重掛時保留選中且維持單一入口。
- **主題**：同步 Appearance 的明暗、自訂背景／前景／accent 與字型；icon 保留原生 attributes，未選取透明、選取用原生 `::before` 背景；獨立網頁版採系統明暗主題。
- **重啟服務**：服務重啟會換 token，helper 收到 403 後以全新 iframe 重新載入（舊做法在同一 iframe 換文件會因全域變數重複宣告而卡在「連線中斷」）。視窗在背景時頁面計時器被節流，重新載入可能延後到回前景；helper 對逾時只標 `renderer-busy` 等待，不再反覆重建。
- **驗證狀態**：側欄入口、隔離頁面、保存卡片、完成訊息、返回原工作區、App 重新整理後保留單一入口皆已實測（`node tests/taskboard-app.test.mjs`，需視窗可見）。

## 4. Claude Code 整合

### 4.1 CLI 派工

看板在工作資料夾執行 `claude -p --input-format stream-json --output-format stream-json`，新對話用 `--session-id`、延續用 `--resume <session>`，模型以 `--model`、推理強度以 `--effort` 傳入（啟動前依 CLI 回報的支援等級驗證），新開 session 以需求第一行 `--name` 命名。權限採 Claude Code 的 `auto` 模式（ADR-021）：例行工具呼叫（含 PowerShell／Bash 指令）由 Claude Code 安全分類器自動核准，分類器仍要確認的才以核准請求送到看板「狀態列表」與 Claude 窗格。模型清單由 CLI 的 initialize 握手取得，不送 prompt、不耗額度。

- 執行結束進待審核；停止先送 interrupt，逾時才結束程序；程序異常或服務重啟保存為中止／失敗，不偽造完成。
- CLI 未登入時派工以「Failed to authenticate」失敗進待審核；先執行 `claude auth login`。
- 派工產生的 session 存於 `~/.claude/projects/`，可用 `claude --resume <session>` 在終端機延續（對話視窗提供複製）。`claude://` 深連結只支援 App 自己的 `local_<id>` session，不能開啟看板建立的 session；Claude App `/resume` 清單是否列出 `-p` 建立的 session 未實測。
- control_request／control_response 格式沒有公開文件，依 Agent SDK 與本機 CLI 2.1.283 實測；CLI 改版時可能需要調整，失敗會以錯誤顯示。
- 已驗證（隔離看板）：首次執行、同 session `--resume` 後續需求、auto 模式下的真實派工；核准往返的完整流程仍標 NOT VERIFIED。

### 4.2 Claude App 內的看板窗格（mod）

`claude-mod/taskboard-pane/` 是 Claude Code 官方 mods 機制的外掛（版本 0.1.1）。載入後在 Code 分頁旁停靠「任務看板」側邊窗格：session 開始自動開啟；關閉後輸入框上方會多一列「▦ 任務看板」按鈕，按它、在空的輸入框按 **9**、或輸入 `/taskboard` 都可重開（鍵綁定檔只能對應引擎內建動作，無法指派真正的快捷鍵）。

- **顯示與操作**：以原生元件顯示派工卡片、工具徽章、核准請求；按鈕有重新整理、自動／手動派工、開始執行、停止、驗收完成、核准／拒絕、略過前置執行、開啟完整看板；「＋ 新增任務」可直接建卡（標題、單行需求、執行工具、模型、優先級、列管／待辦、專案、工作資料夾，可「建立並開始執行」）。
- **背景工作**：以 `$.mcp.call('ccd_session_mgmt','list_sessions')` 讀取 App 側欄群組並 `POST /api/claude-groups`（開啟窗格、每 60 秒、按重新整理時），看板把群組名當作該 Claude session 卡片的專案名；`turn.start`／`turn.complete` 把 session 回合送到 `POST /api/claude-turns` 鏡像成卡片（見 4.3）；以 `$.model.complete`（haiku／low）為鏡像卡擬需求簡介草稿；提供 `import_plan` 工具。
- **限制**：mods 只能畫 Box／Text／Button 等原生元件，沒有網頁內嵌，也不能在 App 最左側導覽新增項目；完整的新增任務、後續需求與對話閱讀仍在網頁版。輸入框上方的位置由所有 mod 共用，排在前面的 mod 必須呼叫 `next(e)` 往下傳（使用者的 `usage-bar` 已改為往下傳），安裝腳本把看板排在 `CLAUDE_CODE_PLUGIN_DIRS` 第一個。
- **安裝（正規方式）**：複製到全域 `~/.claude/mods/taskboard-pane`，並把路徑登記到使用者層 `~/.claude/settings.json` 的 `env.CLAUDE_CODE_PLUGIN_DIRS`（專案層 settings 不行；不依賴專案 clone 在哪裡）：

  ```powershell
  node outputs/taskboard/setup-claude-mod.mjs
  node outputs/taskboard/setup-claude-mod.mjs --check
  ```

  腳本以 SHA-256 比對後只覆寫有差異的來源檔，保留引擎寫入的 `.claude-plugin/types/` 與 `tsconfig.json`，覆寫前備份到 `work/claude-mod-backups`；settings.json 只改 `CLAUDE_CODE_PLUGIN_DIRS`／`CLAUDE_CODE_PLUGIN_DIR_WATCH` 兩個鍵，寫入前備份到 `work/claude-settings-backups`，先前登記過的專案來源路徑會移除以免重複載入；同時回報 Node／Python／Claude CLI／Codex 是否齊全、`.claude/launch.json`、舊的 dev-mods 副本，並以 `claude plugin validate` 做靜態檢查（不耗額度）。設定只對**新啟動**的 session 生效；`git pull` 後重跑即同步（已載入的 session 熱重載）。`/plugin install taskboard-pane --marketplace <本機路徑>` 為替代途徑，未實測。
- **舊流程（session 專屬 dev-mods 副本）**：Claude App「開發 mod」會把副本放在 `~/.claude/dev-mods/<session id>/taskboard-pane`，只在那一個 session 載入。改用全域安裝後該副本多餘，可手動刪除。仍使用它時以 `update-claude-mod.ps1`（`-Check` 唯讀比對）同步五個已知檔案、保留 tsconfig，更新前備份到 `work/claude-mod-backups`、更新後核對雜湊；找到多個副本需用 `-InstalledModPath` 指定；接著在 session 輸入 `/reload-plugins` 再 `/taskboard`。只按窗格「重新整理」不會重新載入外掛。

### 4.3 Claude App session 同步與對話鏡像

- **唯讀同步**：讀 `claude-code-sessions\*\*\local_*.json` 的標題／資料夾／模型／活動時間，以及對應 transcript 尾端 256 KiB 的回合訊號（官方標示 transcript 為內部格式，解析為盡力而為）。Store 版（MSIX）Claude App 的 AppData 被虛擬化，檔案實際在 `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\claude-code-sessions`，看板先找這裡、再找 `%APPDATA%\Claude\`；橫幅「資料未找到」時附上實際檢查的路徑。封存的 session 不列出；同步不寫入資料庫、不派工。
- **對話鏡像**：安裝 mod 後，App 的每個 Code session 自動成為看板卡片：首句建卡直接進進行中（priority 高、tool claude、綁定 session、cwd 存在才填）、每句一筆 `mirror` run、回合結束進待審核（中止→列管、排有 nextRun→待辦、已完成卡重開）。鏡像中的卡片不可拖、不能改狀態、不能派工或送後續需求，徽章「Claude App 對話執行中」；不佔單一任務鎖、排程不領；看板自己派的 Claude run 不再鏡像。標題先用首句第一行（去掉 App 前置的 `<system-reminder>` 區塊），App 命名後跟隨 App 標題，看板上改過即不再覆寫（ADR-020）；需求簡介 seed→drafted→manual，使用者編輯過永不覆寫。App 倒回（rewind）換新 session id 時依 `priorCliSessionIds` 把原卡改綁新 id、舊 id 的 runs 併入，不另建卡。真實 App 觸發、回合結束進待審核已實測。
- **Browser 窗格**：看板不內嵌於 Claude App 網頁層；可用 `start.ps1` 的瀏覽器版，或在 Claude App 的 Code 分頁用內建 Browser 窗格開 `http://127.0.0.1:47824`（專案根目錄 `.claude/launch.json` 提供 `taskboard` 設定附掛既有服務）。

## 5. Codex 整合

- 透過已安裝 Codex App 的 `codex app-server` 與目前登入／模型設定工作（[App Server 文件](https://developers.openai.com/codex/app-server)），沒有額外 API Key。模型選單讀真實 `model/list`，60 秒記憶體快取。
- 看板派出的 Codex 任務採原生 `auto_review` 自動審核工具操作，保留 `on-request`、workspace-write 與網路預設關閉；審核者仍可拒絕受限操作，需要本人輸入或驗收時在看板顯示。此設定只作用於本看板派出的 Codex 任務。
- 額度限制錯誤保留待辦、10 分鐘後重試；其他錯誤留給人工。
- **既有對話同步**：每 15 秒同步本機未封存 sessions 的標題、工作資料夾與回合訊號，顯示為唯讀追蹤卡片（可讀最近 20 回合，不能拖曳、不自動派工、不存入 SQLite、不含在備份內）。回合訊號由 thread/list metadata 與 `CODEX_HOME/sessions` JSONL 尾端事件取得（每檔最多 256 KiB、有快取）；其他 App runtime 無法由獨立 app-server 精確得知，10 分鐘內活動標「近期有執行訊號」，較舊未結束標待確認，回合結束進待審核仍需人工確認；不是視窗開啟判定，也不自動認定已驗收。同步失敗保留上次清單並標待確認，「更新清單」可重試。本機清單不含 ChatGPT 雲端、其他主機或 subagent。
- 看板 HTTP 服務採 HTTP/1.1 keep-alive 並分段寫出回應，修正先前大回應約 10% 在 19 秒後連線重置的問題（ADR-007）。

## 6. 派工、排程與對話規則

- **自動派工**：預設開啟，每 5 秒檢查待辦，先比優先級、同優先級依進入待辦的先後（`queuedAt`，離開再回來排到後面；舊卡片沒有此欄位時用建立時間），跨工具共用同一排程，一次只執行一張，仍被前置阻擋的跳過。待辦欄排序與排程一致，卡片標「下一個執行」或「排隊 #n」。關閉自動後可在卡片按「開始執行」或複製指令手動執行；關閉不會中止執行中的任務。
- **儲存不派工**：儲存卡片、排入待辦都不建立或續跑對話，自動派工或「開始執行」才建立／延續；開始新一輪不覆蓋先前回報，失敗／中止／額度重試保留原需求與結果。
- **後續需求**：「延續既有對話」只能用原工具並續跑同一 session；「開新對話」帶入原需求與最近三次回報（上限 30,000 字）；換工具為「跨工具接手」：新對話帶摘要，不假裝恢復原 session。送出後可「排入待辦」或「立即開始執行」（此刻有別張卡片在執行或前置未完成時留在待辦並提示）。排隊中的後續需求固定保存工具、模型、推理強度與資料夾，要改請先「取消排隊」。外部活躍訊號會阻擋續跑，但不能保證其他 App 不同時執行。
- **既有對話接手**：聊天清單或唯讀卡片按「建立派工卡片」，卡片進列管並連結來源；預設新工作使用獨立對話，只有明確選「延續」並送出後續需求才續跑來源對話（[App Server 文件](https://learn.chatgpt.com/docs/app-server) 說明 thread/resume 後 turn/start 接續同一 thread）。
- **計畫匯入與依賴**：網頁「匯入計畫」貼 JSON、`py -3 outputs/taskboard/plan_import.py plan.json`、或 Claude Code 對話呼叫 mod 工具 `import_plan`，每個事項成為列管卡片（依 Kahn 順序建立）；Claude Code 事項以 `role` 依 `MODEL_ROUTING.md` 對應模型與推理強度；`dependsOn` 建立有向依賴，卡片顯示「等待前置卡片」，排程與「開始執行」跳過／拒絕被阻擋的卡片；前置全部驗收完成（已完成欄）後被阻擋的卡片自動排入待辦並留言。右側「前置卡片」可手動增刪，循環依賴被拒絕。前置還在待審核時可按「略過前置，開始執行」（需確認、留言記錄略過了哪些前置）；自動派工永遠不略過。格式見 `plan_import.py` 檔頭。

## 7. 卡片資料模型與詳情

- 五欄：列管（`backlog`，顯示名稱沿用舊資料不遷移）、待辦、進行中、待審核、已完成；拖曳到進行中等同開始執行，拖到已完成需確認驗收；執行中與鏡像中的卡片需先停止／等回合結束；同步卡片唯讀。
- 卡片保存 runs（每次需求、threadId／turnId、cwd、模型、結果、時間）與 nextRun（排入待辦的後續需求）；session 以 (tool, id) 去重，延續只能同工具。匯出 schemaVersion 5、API 1.9.0。
- 詳情主區為需求簡介與驗收條件；右側集中創建日期（自動、不可改）、狀態、優先級、執行工具、負責人（執行模型）、推理強度、標籤（逗號／頓號分隔、最多 20 個）、專案名稱、工作資料夾、成果連結、相關議題與前置卡片；下方依 session 分組，每個 session 只以純文字顯示「第一次提問」（看板開的 session 用第一筆 run 的需求，來源／鏡像 session 讀 transcript 開頭第一句）與「另有 N 次延續對話」，回報內容一律在「查看對話」閱讀。
- 專案名稱可選既有名稱或輸入新名稱；唯一對應資料夾自動帶入，同名多路徑需選擇；候選由卡片與 session 的資料夾名衍生，不是原生 Project ID。「選擇資料夾…」開 Windows 視窗（`POST /api/folders/select`，單一視窗、300 秒逾時、服務關閉清理），取消保留原值，選擇不自動儲存。
- 相關議題以 task_relations 保存一對排序 ID，雙向顯示，任一方移除或刪除同步清除並更新對端 version；不因關聯自動排程。無截止日期、阻塞關係、工作流欄位，也未綁定 Git 分支／worktree（參考上游 dashi-taskboard 已移除工作流欄位；其開發上下文是分支綁定，本看板沿用工作資料夾）。
- 驗收（狀態改為 todo 或 done）時清除卡片上的舊錯誤與重試時間，run 歷史仍保留當次錯誤。

## 8. 回報的 Markdown 與 Mermaid 圖

執行回報、聊天紀錄的進度與回報段落（你的訊息維持純文字）、狀態列表的完成訊息以 Markdown 顯示，只建立元素與文字節點、不把 AI 文字放進 innerHTML；```mermaid 區塊畫成圖，配色由 CSS token 轉 hex 並在主題或系統明暗改變時重新上色。Mermaid 函式庫不在 Git 內，每個 checkout（新電腦、每個 worktree）在專案根目錄執行一次：

```powershell
node outputs/taskboard/setup-mermaid.mjs
node outputs/taskboard/setup-mermaid.mjs --check
```

腳本從 cdn.jsdelivr.net 下載固定版本 11.17.2（約 3.4 MB）到 `vendor/`，以腳本內寫死的位元組數與 SHA-256 核對，不符就刪除並失敗；頁面經受保護的 `GET /api/vendor/mermaid` 懶載入（網頁版與 Codex 嵌入版同一路徑），`securityLevel: 'strict'`、輸出經 template 惰性解析再移除主動內容、CSP 未放寬（ADR-019）。未安裝（404）、雜湊不符（409）或解析失敗時顯示原始碼與原因；服務為 API 1.8.0 以上時安裝後不需重啟。

## 9. 資料、備份與安全

- `.data/taskboard.sqlite` 保存卡片、設定與紀錄，重啟保留；「匯出任務備份」匯出已保存卡片（不含唯讀同步卡片）。`.data/`（含 profile、token、log）、`work/`（除 `promo-video`）、截圖與 vendor 不進 Git，請勿上傳。
- 服務只聽 loopback；API 需頁面 token；Codex 嵌入另有來源 frame 與 capability 檢查；`plan_import.py` 只接受 loopback 網址。
- 不改官方安裝檔、不複製登入資料；CDP 只接已驗證的專用 profile；啟動器確認埠與 profile 所有權。
- 電腦休眠或關機時不派工；服務必須保持運行。

## 10. 驗證指令與協作規範

建置與測試指令集中在根目錄 `AI_CONTEXT.md`（Node 語法檢查、Python 單元測試、mod `claude plugin validate／test`、App 實機測試 `tests/taskboard-app.test.mjs` 等）。Codex／Claude 共用協作規範見 `AGENTS.md`、`CLAUDE.md` 與 `.agents/harness/`；Claude 五級角色與路由 hook 見 `MODEL_ROUTING.md`；共用技能只改 `.agents/skills/`，以 `scripts/ai/sync-skills.ps1` 產生鏡像。Claude 平台的實際模型／effort／hook 載入未執行耗額度驗證，靜態檢查通過不等於平台已生效。
