# 目前狀態

## 2026-10-11：任務 86d197a4fe25 Claude 安裝副本修正與授權推送

- VERIFIED：依使用者明確授權，GitHub main 已發布。修正本機提交 41c6fd5、發布說明 0c1d9bd；Git push 缺認證失敗，改以已授權 GitHub 連接器發布 77 個已提交檔案。首次遠端提交 3a092ee8f3dc89f8505d079a5b2338404b14255c，GitHub API／git fetch／git diff --exit-code 核對本機與遠端 tree 同為 bbae48d6406ac703b1521de49c8b59430e23c892。保留 master 完整歷史，雲端為獨立提交，後續文件亦循同一流程正常更新 main；不宣稱原提交歷史已 push，不 force。
- Observed Fact：Claude App 的 .claude/dev-mods 安裝副本 register.tsx／types 與舊提交 2a2609d 完全一致，非連結；因此專案改為「列管」後，安裝副本仍顯示「積壓」。
- 已修正安裝副本：taskboard-pane 0.1.1；新增 update-claude-mod.ps1 自動找到唯一副本，限定目前使用者 dev-mods、外掛身分、已知五個檔案；更新前備份差異至 work、更新後 SHA-256 核對。同步前 -Check 找出四個舊檔，同步後一致；重複同步不再修改。
- VERIFIED：來源外掛與 App 安裝副本各 6/6 模擬測試，新增渲染「列管」且無「積壓」的明確斷言；validate、更新腳本 PowerShell 語法、技能同步／-Check、Strict 0 失敗／0 警告、路由 74/74 均通過。77 個目前檔案常見憑證模式掃描無命中（限定模式，不是完整秘密稽核）。
- PARTIALLY VERIFIED：安裝檔案與模擬 UI 已驗證；電腦操作工具回報「Computer Use was not approved to use Claude」，無法開啟／熱載入／驗證 App 當前畫面。使用者在 Claude Code App 執行 /reload-plugins、/taskboard 可載入新副本；未改官方 App、認證或真實任務資料庫。
- 先前功能與驗證保留：列管沿用 backlog、不遷移；專案候選、唯一路徑同步、多路徑選擇、Windows 資料夾選擇；後端 46/46、主題 7/7、專案／拖曳／詳情隔離 DOM 已通過。原生資料夾實際點選未驗證，正式服務尚未重啟載入其 API（避免中斷本任務）。未知 .codex/ 不納入上傳。

## 2026-10-11：滑鼠拖曳卡片狀態

- 原生 HTML5 拖曳改為滑鼠 Pointer Events／pointer capture，6px 門檻、浮動預覽、目標欄高亮、邊緣捲動；拖曳期間輪詢更新 state 但保留卡片 DOM，放開後恢復渲染。卡片標題可起拖，一般點擊仍開啟詳情。
- 放開使用既有 PATCH／start API；拖到已完成保留驗收確認，進行中不帶 force；唯讀／執行中不可拖，狀態版本改動拒絕舊拖曳。Esc／取消／失焦／放到欄外只清理 UI。
- VERIFIED：`taskboard-drag.test.mjs` 六組真實滑鼠／隔離 DB／fake RPC 檢查（跨輪詢及 reload 保存、取消與點擊、唯讀／執行中／版本、驗收／開始／前置、窄視窗捲動、opaque iframe＋capability RPC）；詳情回歸、主題 7/7、後端 42/42。專用 App 回歸通過並重新載入；未操作真實卡片或派工模型。
- 測試界線：背景頁面 RAF 的邊緣捲動以相同函式顯式推進；未用真實任務驗證拖曳派工。測試初期 CDP EACCES 經限縮權限執行；焦點／真實滑鼠干擾、詳情遮罩、固定座標與 srcdoc 換程序造成的測試失敗已修正為背景焦點模擬、關閉測試詳情、實際邊界與 App 相同載入方式。

## 2026-10-11：Codex 原生自動審核

- 使用者要求執行任務時不要逐次人工核准工具操作。CodexAdapter 的 thread/start、thread/resume、turn/start 現在都指定 `approvalsReviewer=auto_review`；保留 `approvalPolicy=on-request`、workspace-write 及網路預設關閉。由 Codex 原生風險審核決定核准或拒絕，不用看板無條件自動回答 accept。
- VERIFIED：本機 codex-cli 0.162.0-alpha.17.2 的三份原生協定 schema 支援該欄位；隔離後端測試 42/42，新建／延續／回合皆驗證 reviewer 與 sandbox。正式看板服務已重新載入；31 費用保護原回合因載入設定而中斷，原紀錄保留，以同一執行 session 的 followup 接續；automatic=true，10 張卡片、16 條前置、7 組關聯保留。
- 真實接續回合已有 2 個 commandExecution 完成（exitCode=0），當時無等待人工核准；另 1 個命令失敗（exitCode=-1），未將失敗算成成功。PARTIALLY VERIFIED：不是所有風險類別的全面驗收；帳號登入／任務選擇與成果驗收流程仍保留，Claude 核准機制未調整。
- 重新載入後看板畫面曾顯示連線中斷；loopback API 與派工已恢復，再透過既有 stop-app／start-app 重新連接專用 profile。app-status 回讀 phase=ready、serviceAvailable=true、frameLoaded=true、active=true（VERIFIED），未重開任務。未改官方 App、全域 Codex 設定或真實雲端服務。

2026-10-11，看板同時支援 Codex 與 Claude Code（API 1.4.0、export schema 4），共用 SQLite、排程與介面；真實服務已重啟載入，無保存卡片受影響。2026-10-10 的右側屬性、模型、標籤、關聯、多 session 與同步皆保留。

## 2026-10-11（下午五）：窗格重開入口

- 使用者問關閉窗格後如何叫回、有無快捷鍵：keybindings.json 只對應引擎動作，無法綁 slash 指令或外掛窗格。AbovePrompt 重開按鈕（熱鍵 9，與其他 mod 的 band 合成）第一次在 App 內沒畫出：輸入框上方只有一個位置，使用者的 `~/.claude/mods/usage-bar` 排在前面且不呼叫 `next`（測試套件只驗證元素描述、不驗證 App 繪製，這是實際失敗）。依使用者要求改 usage-bar：`AbovePrompt` hook 先 `await next(e)` 再把結果畫在用量列下方（terminal／desktop 兩分支），其測試「不畫引擎 band」改為「畫在下方」，usage-bar 測試 6/6；看板 mod 重開按鈕加回，mod 5/5、validate。使用者執行 /reload-plugins 後，關閉窗格時用量列下方實際出現「▦ 任務看板」重開列（使用者確認）—VERIFIED。

## 2026-10-11（下午四）：排程順序與後續需求立即執行

- 排程改為優先級 → 進入待辦時間（新增 `queuedAt`，create／update／followup／release 進入待辦時記錄；舊卡片退回 createdAt；`queue_order` 共用）。待辦欄排序與排程一致，卡片標「下一個執行／排隊 #n」；窗格同樣排序。
- 後續需求可選「排入待辦」或「立即開始執行」（`startNow`）：立即模式排隊後直接 `start`，被占用／前置未完成時留在待辦並回 `startError` 提示；對話視窗內的後續需求同樣可選。
- VERIFIED：後端 42/42（新增 test_taskboard_queue 3 項：優先級→排隊順序、離開再進入排到後面、舊卡片退回建立時間、立即執行與被占用時的排隊提示）；mod 4/4、validate；專用 Codex App 真實 DOM 測試 PASS（後續需求預設排入待辦路徑不變）；真實服務重啟、App 群組對應保留。NOT VERIFIED：真實立即派工（未耗額度）。

## 2026-10-11（下午三）：人工略過前置

- 使用者情境：前置卡片待審核且仍要優化（不按已完成），但想手動讓後續卡片先跑。新增 `start(force=True)`／`POST /api/tasks/<id>/start {force:true}`：只有人工明確略過才能啟動被阻擋的卡片，並以 `kind: override` 留言記錄略過的前置與狀態；自動派工 `tick` 仍嚴格遵守依賴。網頁卡片按鈕變為「略過前置，開始執行」（確認對話框），窗格待辦卡片有「略過前置執行」。
- VERIFIED：後端 39/39（新增略過測試：自動不領取、未 force 拒絕、force 執行並留言、前置之後驗收只釋放仍在積壓的卡片）；mod 4/4（被阻擋待辦卡片的「略過前置執行」送出 `{force:true}`）、validate；專用 Codex App 真實 DOM 測試（被阻擋卡片按鈕啟用且標籤為「略過前置，開始執行」）PASS；真實服務已重啟。NOT VERIFIED：真實略過派工（未耗額度）。

## 2026-10-11（下午二）：工具篩選與 Claude App 群組

- 使用者指出專案清單看不到 Claude App 的專案：原因是 Claude 卡片的專案只取資料夾名，與 Codex 混在同一清單，而 App 側欄群組（交易工具等）不在任何磁碟檔案。處理：mod 透過 App session 連接器讀取群組並回報 `POST /api/claude-groups`（開窗格、每 60 秒、重新整理），看板把群組名當 Claude 卡片專案（無群組退回資料夾名），對應存設定 `claudeGroups` 並於重啟後保留；匯入派工卡片沿用群組名。
- UI：工具列「全部工具／Codex／Claude Code」篩選，專案選單依工具分 optgroup 並只列所選工具；搜尋可輸入工具名；同步橫幅顯示 App 群組同步時間或「未同步（需 Claude App 內的看板窗格）」。
- VERIFIED：後端 38/38（新增 test_taskboard_groups 2 項：群組→專案、重同步保留、匯入沿用、設定持久化、壞輸入拒絕）；mod 4/4（群組 relay、未變更不重送）、validate；頁面語法；真實服務重啟；mod 熱重載後 App 群組實際回報到看板並顯示為專案名（使用者確認）。

## 2026-10-11（下午）：計畫匯入、有向依賴、完成後自動釋放、推理強度

- 功能展開後的事項可整份匯入成積壓卡片：`POST /api/plans`（Kahn 依賴排序建卡、createdAt 單調遞增）、`ROLE_ROUTING` 把 Claude 角色對應 model／effort、`plan{id,name,key,role}` 與標籤保存來源；入口有網頁「匯入計畫」、`plan_import.py`、mod 工具 `import_plan`。
- 有向依賴 `task_dependencies`：右側「前置卡片」增刪、卡片「等待前置卡片」徽章、排程與開始執行跳過／拒絕被阻擋卡片、循環與自我依賴拒絕、刪除清理、端點版本 bump。卡片進「已完成」時 `release_dependents` 把前置全完成的積壓卡片排入待辦並留言；自動派工時接續執行。
- `effort` 欄位（Claude 專用；UI 依所選模型的 `effortLevels` 顯示可用等級）以 `--effort` 傳給 CLI，啟動前驗證不支援即失敗；失敗 run 的重試改採卡片目前 model／effort。API 1.5.0、export 5。
- VERIFIED：後端 36/36（新增 test_taskboard_plans 6 項）；專用 Codex App 真實 DOM details 測試新增計畫匯入／阻擋徽章／驗收後釋放／依工具顯示推理強度；mod `plugin test` 3/3（含 import_plan 工具）、validate 通過；真實服務重啟後為 1.5.0。NOT VERIFIED：真實 Claude `--effort` 派工（未再耗額度）、mod 工具在 App 內實際被模型呼叫。

## 2026-10-11：Codex／Claude Code 雙工具

- 能力對照：Codex＝app-server RPC、專用 App 內嵌、thread/resume 延續、模型 `model/list`、核准／提問、唯讀 session 同步；Claude Code＝CLI 整合（`claude -p` stream-json、`--session-id`／`--resume`、`--model`、`acceptEdits`＋看板核准 `can_use_tool`、interrupt 停止）、initialize 握手取得真實模型（本機 5 個）、唯讀 Claude App session 同步（48 個）與 transcript 閱讀、`claude --resume` 指令複製；不內嵌 Claude App、無 `claude://` 開啟看板 session 的途徑。
- 架構：`tool_adapters.py`（介面、CodexAdapter、(tool, id) session 鍵）、`claude_adapter.py`、`claude_sessions.py`；Board 共用 `complete_run`／`set_progress`／`bind_session`／`set_turn`。任務／run／nextRun／同步卡片帶 `tool`，舊資料讀取時預設 Codex、不改寫。延續只能同工具；換工具為 `handoff` 新對話帶原需求與最近三次回報摘要。nextRun 固定保存 tool／model／cwd，排隊期間不可改，提供取消排隊。
- UI：右側「執行工具」選單、依工具載入的模型選單（失效模型保留並標示不可用）、卡片／session／run／留言／事件的工具徽章、工具不可用時的提示與停用開始執行、後續需求的新對話工具／模型選擇與跨工具提示、Claude 核准請求顯示工具名稱與輸入、對話視窗顯示 `claude --resume` 指令、既有對話頁合併兩種來源。
- Claude Code App 內入口（mod）：`outputs/taskboard/claude-mod/taskboard-pane/` 以官方 mods（function hooks）機制停靠「任務看板」側邊窗格，session 開始自動開啟、`/taskboard` 重開；原生元件顯示派工卡片／工具徽章／核准請求，按鈕：重新整理、自動／手動、開始執行、停止、驗收完成、核准／拒絕、開啟完整看板（`http://localhost:47824`，Link 只接受 https 或 localhost）。`claude plugin validate` 通過、`claude plugin test` 2/2（terminal＋desktop 兩個 surface、服務離線情境）；需 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`（npm CLI 2.1.283 標示早期存取）。mods 無網頁內嵌、無法在 App 最左側導覽清單新增項目；窗格內可直接「＋ 新增任務」：標題、需求（單行）、執行工具、依工具載入的模型、優先級、積壓／待辦、專案、工作資料夾，「建立卡片」或「建立並開始執行」，積壓卡片有「移到待辦」；空標題不送出，建立成功後表單收起（mod test 覆蓋）。使用者允許熱載入後，App 內實際出現「任務看板」停靠窗格（使用者截圖：Codex 已連線、Claude Code 可用、88／48 sessions、五欄與按鈕）—VERIFIED；初版因 session.start 在 App 代管 session 無 surface 而未開窗，改為一律 `$.ui.open` 並以 `isPlaced` 決定輪詢後通過。
- 入口：Codex 專用視窗嵌入不變；Claude App 可用 Code 分頁的 Browser 窗格開啟 `http://127.0.0.1:47824`（`.claude/launch.json` 的 `taskboard` 附掛設定），主題跟隨系統／App 明暗；`start.ps1` 在缺 Codex 或 Claude 時改為警告並以可用工具啟動。
- 找到並修正長期存在的「HTTP body 傳輸中斷」：大回應（state 178 KB、Codex 對話 853 KB）在 HTTP/1.0 單次寫出後立即關閉時約 10% 於 19 秒後 RST（Windows 5 次重傳）；改 HTTP/1.1 keep-alive＋16 KB 分段 flush 後 80/80 通過，Codex 對話讀取由 19 秒失敗變 0.1 秒（ADR-007）。前端另保留連續兩次失敗才顯示斷線；Node 測試狀態讀取加重試。
- 專用 App helper（app-injector）的 API 白名單只接受 `?tool=codex|claude` 查詢；前端對 Codex 路徑不帶查詢，舊 helper 仍相容。已重啟 helper 載入。
- `claude_sessions.read_turns` 改由檔尾逐步放大視窗（2 MB 起、上限 64 MB）並預先過濾紀錄類型；真實 258 MB transcript 0.6 秒讀完最近回合。

### 驗證（2026-10-11）

| 檢查 | 結果與界線 |
|---|---|
| 後端全套 | VERIFIED，30/30（原 17 項不改通過＋13 項多工具：模型清單／選擇／驗證、Claude run 紀錄與參數、不可用模型、同 session 續跑、跨工具 handoff 與回到 Codex、舊資料相容不改寫、同 ID 兩工具隔離、額度／當機／停止／重啟、核准等待與拒絕、共用排程、工具不可用、取消排隊、Claude session 索引） |
| 主題 | VERIFIED，7/7 |
| 專用 Codex App 真實 DOM（details） | VERIFIED，模擬 RPC／模擬 Claude CLI：原有項目＋Claude 工具／模型選單、跨工具後續需求控制、Claude 對話閱讀與 resume 指令、對話內延續同 session、取消排隊、徽章與連線指示 |
| 專用 Codex App（sessions） | 見 handoff；版本改 1.4.0、兩種同步卡片、狀態讀取重試 |
| 真實服務 1.4.0 | VERIFIED：Claude CLI 2.1.283 可用、`/api/models?tool=claude` 真實 5 模型 4.2 秒／快取 0.02 秒、Codex 7 模型、88 Codex＋48 Claude sessions 同步無錯誤、Claude 對話可讀、保存卡片 0、未派工、未耗額度 |
| Claude App Browser 窗格 | VERIFIED（人工截圖）：看板於 Claude App 內建 Browser 窗格開啟、深色主題跟隨、雙工具連線指示可見；這是 Browser 窗格附掛，不是側欄嵌入 |
| Claude CLI 握手 | VERIFIED：initialize 回傳模型清單、interrupt 有回應、`--permission-prompt-tool stdio`／`--session-id`／`--name`／`--model`／`--effort` 參數接受；未送 prompt |
| 真實 Claude 派工（使用者授權） | VERIFIED：第一次因 npm CLI OAuth 過期，流程正確記為失敗（錯誤顯示、session 綁定、transcript 可讀、未耗額度）。使用者 `claude auth login` 後：隔離看板 `haiku` 首次執行 18.5 秒完成（resolvedModel `claude-haiku-4-5-20251001`、3 turns、$0.084、正確列檔與 git status 回報、transcript 2 段可讀、資料夾未新增檔案）；同 session 後續需求以 `--resume` 真實續跑 14 秒完成（$0.099），`node -e` 非唯讀指令觸發真實 `can_use_tool`，看板 1 秒後核准，輸出 `taskboard-approval-ok`，第一次 run 原封保留。`git status` 屬 CLI 自動允許的唯讀指令，不會提示 |
| `-p` session 於 Claude App `/resume` 可見、Remote Control | NOT VERIFIED |
| 語法／結構／路由 | VERIFIED：py_compile、inline JS vm、PowerShell Parser 0 錯誤；sync -Check 一致、Strict 0 失敗、路由 74/74 |

實際失敗與處理：測試對重試 run 類型預期錯誤（既有行為保留原 kind）改正；Claude 程序結束時關閉管線並在服務關閉時忽略關閉 DB 的例外；fixture 兩張「唯讀」同名卡片造成 UI 測試選錯卡片，改名；sessions UI 測試因 Codex 對話讀取 19 秒重置失敗，追查為大回應 loopback 段遺失（ADR-007）並修正；transcript 預過濾原本只比對無空白的 JSON，改為正規式；以 Python subprocess 捕獲 start.ps1 輸出會因子程序繼承管線而卡住，改以背景方式啟動。

## 已完成

- 新增唯讀創建日期、負責模型動態選單、標籤與雙向相關議題；模型實際傳給新／延續對話與本次回合，run 保存選擇。不可用模型停止派工並保存錯誤；關聯移除／刪除同步生效、對端版本保護。儲存仍不建聊天。
- 無截止日期／阻塞關係；上游已移除工作流欄位。本次開發上下文沿用工作資料夾，Git 分支／worktree 綁定尚未實作。
- VERIFIED：17/17 後端、7/7 主題；隔離 DOM 右側、日期、模型／標籤／雙向關聯、多 session、600px；截圖人工確認。專用 App 1.3.0，model/list 真實回傳 7 個模型，87 張唯讀 session 卡片／聊天閱讀／保存資料不變。真實模型派工 NOT VERIFIED。

- 主區顯示需求簡介／驗收條件，右側集中任務屬性；下方按 session 分組顯示逐次需求、時間、結果及「查看對話」。唯讀同步卡片按需讀最近可讀需求／回報、標示參考；建立派工卡片後才能送後續需求。
- 後續修正可延續卡片已有 session 或開新對話；送出先排入待辦，開始執行才建聊天／resume。runs 保存每次回報，nextRun 保存排隊需求；斷線／中止／重啟／額度重試保留原需求。全部歷史 session 去重與匯入，舊資料相容讀取、不背景改寫。
- 選取專案後新增卡片會帶入名稱；單一已知資料夾才帶入路徑，同名多路徑需手動指定。仍是名稱／cwd 分類，未直接整合原生 Project ID。
- 無執行／排隊任務時安全重啟服務；任務、設定與事件內容 SHA-256 前後相同。已在專用 App 載入最新介面，沒有真實派工或消耗模型額度。

- 本機未封存 sessions 自動同步標題、資料夾與回合訊號，每輪完成後等 15 秒更新。API 衍生唯讀追蹤卡片、來源 ID 去重、不寫任務 DB、不派工；最新實測 86 張卡片，數量會隨其他聊天變動。
- 點追蹤卡片可讀聊天，也可明確建立派工卡片；訊號過期／同步中斷標待確認，回合結束待審核。

- Git repository 已有基準提交 f107812，原本只有初始化且零提交。私人 .data、profile、SQLite、token、截圖、個人設定、worktree 與 bench 結果排除版控。
- 共用入口、AI_CONTEXT、MODEL_ROUTING、.agents harness／ai-handoff、.ai 交接、Claude 五級角色／hook／鏡像、四份共用 docs 與四支 scripts/ai 已建立。
- 桌面 Codex.lnk 自動啟動服務、專用 App 及一個 helper；mutex 防止雙擊競態。中文路徑使用 UTF8 JSON／BOM，HTTP 探測使用 UseBasicParsing，避免隱藏程序等待互動確認。
- 看板同步 Appearance 明暗、背景、前景、accent 及字型；首次與即時訊息保留來源／capability 驗證。圖示保留原生 attributes，未選取透明、選取使用原生背景。

## 驗證

| 檢查 | 結果與界線 |
|---|---|
| 後端 lifecycle 與同步 | VERIFIED，17/17；模型傳參／不可用保護、標籤驗證、雙向關聯／移除／刪除／對端版本，加上新保存／排隊無 RPC、同／新 session、各輪回報保留、歷史去重／匯入、版本／歸屬／空白／活躍保護、quota 續跑、stale turn 忽略、斷線／重啟／legacy 相容 |
| 詳情隔離真實 DOM | VERIFIED，模擬 RPC／暫存 DB；簡介、右側屬性、創建日期、模型／標籤／雙向關聯、專案預填、3 sessions／5 runs、查看／續跑／新對話、未儲存保護、唯讀最近需求／回報、600px 無水平溢出；截圖人工確認 |
| 本次專用 App 回歸 | VERIFIED，87 張同步卡片／唯讀詳情／聊天閱讀／資料不變；Appearance、icon、即時自訂色彩與 reload 通過，數量會隨其他聊天變動 |
| 真實模型派工／原生 Project 歸屬 | NOT VERIFIED；後續 RPC 使用模擬驗證，未消耗模型額度，未宣稱側欄自動歸屬已實測 |
| Session 隔離測試 | VERIFIED，6/6，回合／過期／快取、受限路徑、尾端半寫入、分頁／去重／改名／封存、錯誤保留、不派工及同步合併 |
| Session 專用 App | VERIFIED，86 張自動卡片／不可拖曳／聊天可讀／自動清單；保存卡片、事件、設定不變，無派工時安全重啟服務 |
| 主題單元測試 | VERIFIED，7/7 |
| JS、Python、PowerShell 語法 | VERIFIED |
| 專用 App 整合 | VERIFIED，色彩、圖示透明與選取、明暗／自訂色彩／字型即時同步、reload 單一入口與內容、API online |
| 桌面完整關閉再重開 | VERIFIED，一個 helper、文字／圖示入口及內容恢復，一般聊天視窗仍開啟 |
| 同步及 -Check | VERIFIED，重複同步無需變更 |
| 完整結構 -Strict | VERIFIED，26 必要檔案，0 失敗／0 警告 |
| 路由與 hook | VERIFIED，74/74；五級、工具邊界、升降級、重複方法、最高級、通知／壞輸入／狀態隔離 |
| 負向副本檢查 | VERIFIED，抓出漏匯入、鏡像漂移、壞 JSON、孤立技能 |
| ai-handoff validator | VERIFIED，Python -X utf8 後通過 |
| Claude 平台 runtime | NOT VERIFIED，未執行角色、實際 model／effort、hook／技能的耗額度測試 |

## 實際失敗與處理

- 新增隔離 lifecycle 測試抓出「留白資料夾且先排後續需求」被當成必須已存在的路徑；改驗證使用者指定路徑，內部路徑於執行時建立，13/13 通過。
- UI 跨同步時間讀到 2／3 sessions，改等最新 run 快照後通過；補上回報後狀態同步與未儲存內容保護。sandbox CDP 存取 EACCES，範圍限縮 escalation 通過。
- 載入服務時 HTTP body 傳輸中斷；改不重用 HTTP 連線完成重啟／版本／資料比對，沒有宣稱已確認其根因。

- Sandbox app-server／loopback 探測受限，scoped escalation 通過；初次隔離 DB 清理未關閉失敗，後續關閉 DB 通過。未呼叫模型。
- Session App 測試跨時間 API／UI 快照計數 81／86 不同；改同 UI 快照比對後通過，產品不需修改。

- 固定等待的 reload／主題測試曾失敗；改等新 frame 就緒及 theme bridge 完成，最終完整測試通過。
- hidden launch 曾卡住；UseBasicParsing 修正後冷啟動通過。
- CDP screenshot 曾無法取得 surface，新增 fallback；截圖只作輔助，未作像素一致性成功證據。
- skill validator 初次採 Windows cp950 讀 UTF8 而失敗；Python -X utf8 後通過。

## 版控與後續

先前修正與骨架已提交；session 同步、詳情／後續對話及本次右側屬性／模型／關聯修改尚未提交，沒有 stage、commit、push、發布或耗額度測試。其他程序的精確 runtime／視窗開啟及原生 Project 歸屬 NOT VERIFIED，目前用明列來源的有限回合訊號。舊版已覆蓋的回報無法從看板還原，保留其最新結果並可讀原聊天。後續改共用來源，執行同步、-Check、結構及路由檢查，再以 ai-handoff 更新交接。官方 App 改 DOM／CSS 時需重驗整合。
