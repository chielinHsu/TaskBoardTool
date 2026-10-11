# ADR 決策紀錄

## ADR-013：Git 認證缺失時使用 GitHub 連接器發布提交快照（2026-10-11）

- 背景：使用者已授權 TaskBoardTool 公開 main；Git push 缺本機認證失敗，但既有 GitHub 連接器具有寫入權限，目的儲存庫尚無提交。
- 決定：僅從已提交 HEAD 擷取受版控檔案，使用 GitHub Git data API 建立檔案樹與獨立提交，正常建立／更新 main；回讀並比較 tree SHA。本機 master 與歷史保留，origin/main 供雲端追蹤。
- 理由：完成已授權發布而不複製憑證、不要求輸入 token、不改全域 Git 設定、不強制覆寫。
- 替代方案：等待使用者登入本機 Git 後原生 push；逐檔 contents API 會產生多個中間提交，不採用（僅空庫 README 初始化）。
- 後果：雲端包含完整目前檔案但不包含原本本機提交歷史，雲端 commit SHA 與本機不同、tree SHA 應相同。後續原生 push 需先登入並協調兩份歷史，禁止直接 force；發布驗證需說明此界線。

## ADR-012：Claude App 安裝快照需明確同步

- 背景：來源已改為「列管」，使用者仍在 Claude App 看見「積壓」。唯讀比對證明 .claude/dev-mods 安裝副本的 register.tsx／型別仍與 2a2609d 一致，且不是檔案連結。
- 決定：外掛版本升至 0.1.1，新增 update-claude-mod.ps1；唯讀 -Check 偵測漂移，更新時只處理已知五個檔案、先備份差異、更新後雜湊確認。唯一副本自動選取，多副本需指定路徑；限目前使用者 dev-mods，檢查外掛身分，保留 App 產生的 tsconfig。
- 理由：只更新 repository 或看板 HTTP 資料不會重載安裝快照；來源、部署及實際 App 載入分別驗證才能避免誤報生效。
- 替代方案：手動改快照會產生兩份不同來源；修改官方 App 或認證沒有必要；全量覆蓋會移除 App 產生的內容。均不採用。
- 後果：更新既有 App session 後仍需 /reload-plugins 與 /taskboard，或重新開啟 App；腳本不重啟 App／服務、不改真實任務資料。電腦工具若無 App 控制許可，實際畫面驗證需人工操作。
- 驗證：同步前 -Check 偵測四個舊檔，同步後一致；來源／安裝副本的模擬 UI 測試明確要求「列管」且無「積壓」，不等於當前 App 實際畫面已熱載入。

## ADR-011：專案候選與原生資料夾選擇，不遷移任務資料

- 背景：使用者要求「積壓」改「列管」，新增任務可重用 ProjectName 並同步工作資料夾，路徑須能透過資料夾視窗選擇。
- 決定：保留 `backlog` 鍵，只改 UI／新事件文案；專案名稱由既有 state 去重，網頁 input＋datalist、Claude 窗格 Select＋Input 可選可輸入。唯一路徑自動帶入，同名多路徑明確選擇；新名稱在儲存任務後才成為候選。
- 決定：由受 token／Host／Origin 保護的 loopback API 啟動 PowerShell STA FolderBrowserDialog；非同步工作 ID 輪詢、取消、300 秒逾時與服務關閉回收。資料夾選擇不建立目錄、不保存任務、不派工，參數不經 shell 拼接；保留手動輸入。
- 理由：瀏覽器資料夾上傳／File System Access API 不提供可供本機 subprocess 使用的絕對路徑；Windows 原生視窗能直接回傳路徑。非同步 API 沿用既有 opaque iframe capability bridge，避免使用者選擇時間超過單次 RPC 逾時。
- 替代方案：新增專案表需要遷移且不涵蓋同步 session；任意選取同名專案的第一個路徑會有派工到錯誤位置的風險；同步等待視窗會占住 HTTP 請求。均未採用。
- 後果：原生資料夾視窗限 Windows；候選來自現有卡片，不是獨立專案登錄。保留原卡片資料；既有事件中的歷史文案不背景改寫。原生實際點選仍待人工驗收。
- 驗證：後端 46/46（含認證／Origin、取消／逾時／關閉回收）；隔離 DOM 檢查專案保存、唯一／多路徑、手動值與 opaque iframe 選擇；Claude 外掛 6/6、validate 通過。

## ADR-010：嵌入看板的滑鼠拖曳（2026-10-11）
- 背景／Evidence：使用者要求滑鼠拖曳卡片切換狀態。既有 HTML5 drag/drop 的來源 DOM 每 2.5 秒由輪詢重建；內嵌看板使用 opaque iframe 與 capability RPC，操作需在此環境驗證。
- 決定：用 Pointer Events 在 6px 移動後開始拖曳，board 捕捉指標；clone 顯示浮動預覽、elementFromPoint 找目標欄、RAF 執行邊緣捲動。拖曳期間持續更新 state，延後卡片 DOM 重建，放開以版本檢查防止舊卡片覆蓋新狀態。
- 理由：不新增依賴，能從標題起拖並保留普通點擊、取消與失焦清理；沿用既有 PATCH／start，保留單一派工、前置限制與已完成驗收。替代方案：只修 HTML5 重建時機仍需依賴瀏覽器原生 drag 在 iframe 的行為；加入拖曳套件對本次需求過重。
- 後果：滑鼠可移動已保存且未執行的卡片；唯讀同步需先匯入。進行中呼叫 start 且不 force，done 要 confirm；拖曳時最新進度到結束後才重畫卡片。觸控拖曳不在本次範圍。
- Verification：隔離真實滑鼠驗證跨輪詢／reload、取消、普通點擊、唯讀／執行中／版本、驗收、模擬派工、前置阻擋、窄視窗捲動（背景 RAF 顯式推進）、opaque iframe RPC；詳情及專用 App 回歸通過，主題 7/7、後端 42/42。真實任務拖曳派工 NOT VERIFIED。

## ADR-009：Codex 原生自動審核（2026-10-11）
- 背景／Evidence：使用者要求看板自動派工時不要逐次人工核准工具操作。原 CodexAdapter 固定 user 審核；本機 codex-cli 0.162.0-alpha.17.2 的 ThreadStartParams／ThreadResumeParams／TurnStartParams 支援 auto_review。[官方設定文件](https://learn.chatgpt.com/docs/config-file/config-reference) 列出 approvals_reviewer，指出審核者與 sandbox 限制為不同設定。
- 決定：在 thread/start、thread/resume、turn/start 指定 approvalsReviewer=auto_review；保留 approvalPolicy=on-request、workspace-write、networkAccess=false。由原生審核者依風險決定，拒絕不轉成自動 accept。
- 理由：例行命令可自動審核，同時維持工作目錄與網路邊界；新建與續跑都必須明確指定，避免沿用舊 user 設定。
- 替代方案：approvalPolicy=never 會拒絕受阻操作；danger-full-access 或看板無條件回答 accept 會取消目前邊界；因此不採用。Claude 的權限協定不同，不順帶改動。
- 後果：例行工具核准由原生審核者處理；資料／帳號選擇、工具要求本人輸入及卡片成果驗收仍保留。版本不支援時應報錯，不默默放寬權限。重新載入服務時保留原 run，以既有 session 接續當前任務。
- Verification：隔離後端 42/42；本機 schema 支援三個設定邊界；正式服务已載入新 adapter、原任務 followup 執行且當時人工核准清單為空，已有 2 個命令完成。並未全面覆蓋所有風險審核情境。

## ADR-008：計畫匯入、有向依賴與完成後自動釋放（2026-10-11）
- 背景／Evidence：使用者要求功能展開後自動建卡、Claude Code 事項依 MODEL_ROUTING 角色設定模型與推理強度、有先後關係的事項建立依賴並在前置完成後自動推進。ADR-005 曾排除阻塞關係，當時沒有自動派工依序執行的需求；現在排程會從待辦取卡，缺少依賴會讓後續事項提前執行。
- 決定：新增 `task_dependencies(blocker_id, blocked_id)` 有向表，與對稱的 `task_relations` 並存；API 投影 `dependsOn`／`blocks`，寫入時檢查自我／循環／不存在，端點版本互相 bump。排程與 `start()` 跳過或拒絕仍有未完成前置的卡片；卡片進入 `done`（人工驗收）時 `release_dependents` 把前置全完成的積壓卡片移到待辦並留言，自動派工時接續執行。新增 `effort` 欄位（Claude 以 `--effort` 傳入，啟動前以 initialize 目錄的 `supportedEffortLevels` 驗證，不支援即失敗而非靜默降級）。`POST /api/plans` 以 Kahn 排序建立卡片、`ROLE_ROUTING` 對應角色、`plan{id,name,key,role}` 保存來源、label 帶計畫名與角色；提供 plan_import.py、網頁「匯入計畫」與 mod 工具 `import_plan`。失敗 run 的重試改用卡片目前的 model／effort（同工具），讓修正生效。export schema 5、API 1.5.0。
- 理由：依賴必須有方向才能驅動排程；釋放條件採「已完成」而非「待審核」，保留人工驗收作為前後事項之間的閘門；角色對應集中在伺服器，三個入口共用同一規則。替代方案：用優先級模擬順序（無法阻擋）、在 agent 端逐張呼叫建立 API（失去原子性與循環檢查）。
- 後果：被阻擋卡片即使手動移到待辦也不會被排程領取；刪除前置卡片會解除依賴；Codex 側無 effort；釋放只把卡片放入待辦，手動模式仍需人按開始。
- Verification：後端 36/36（含計畫匯入順序／角色對應／循環與錯誤拒絕、阻擋與自動釋放、依賴驗證與刪除清理、effort 驗證與 `--effort` 傳參、舊資料相容）；專用 Codex App 真實 DOM 測試含計畫匯入、阻擋徽章、驗收後釋放、依工具顯示推理強度；mod `plugin test` 3/3（含 import_plan 工具）。真實 Claude `--effort` 派工 NOT VERIFIED（未再耗額度）。

## ADR-007：看板 HTTP 改用 keep-alive 與分段寫出（2026-10-11）
- 背景／Evidence：真實服務的 `/api/state`（178 KB）與 Codex 對話讀取（853 KB）約 10% 在 19 秒後被 RST；`/health`、`/api/export`、`/api/models` 從未失敗。19 秒等於 Windows 5 次 TCP 重傳退避；同程序內的客戶端從不失敗，跨程序最小重現（`work/loopback_probe_server.py`）：HTTP/1.0＋單次大寫出後立即關閉 27/30，HTTP/1.1 keep-alive 30/30，分段 flush 30/30。前次交接記錄的「載入服務時 HTTP body 傳輸中斷」即此問題。
- 決定：`Handler.protocol_version='HTTP/1.1'`，`reply()` 以 16 KB 分段寫出並 flush；所有回應維持 Content-Length。
- 理由：避免大回應後立即關閉連線造成的 loopback 段遺失；標準函式庫即可，不加依賴。替代方案：縮小 state（仍會失敗）、前端重試（只掩蓋）。
- 後果：連線由客戶端保持；`/api/shutdown` 回覆後仍正常關閉。前端保留「連續兩次失敗才顯示斷線」作為保險。
- Verification：拋棄式實例（真實 Codex 同步、178 KB state）新連線 40/40、keep-alive 40/40、Codex 對話 853 KB 0.1–0.2 秒；後端 30/30。

## ADR-006：共用執行介面與 Claude Code CLI adapter（2026-10-11）
- 背景／Evidence：使用者要求同一看板同時派工給 Codex 與 Claude Code。本機 Claude App 2.31226.1.0（MSIX）與 npm Claude Code CLI 2.1.283（`bin/claude.exe`）。實測 CLI stream-json 的 `initialize` 控制請求不送 prompt 即回傳 5 個模型（含 effort 等級），`interrupt` 有回應；官方文件確認 `--session-id`／`--resume`／`--model`／`--permission-mode`／`--permission-prompt-tool`，但控制協定 wire format、`claude -p` session 是否出現在 Desktop `/resume`、Desktop 嵌入入口均未文件化；App 程式碼的 `claude://code/continue` 只接受 `last` 或 `local_<id>`。
- 決定：`tool_adapters.py` 定義 ToolAdapter 介面（capabilities／models／launch／stop／answer／read_chat／list_sessions），Codex 邏輯移入 `CodexAdapter`，`claude_adapter.py` 以每次 run 一個 `claude -p` 程序實作，`claude_sessions.py` 唯讀索引 Desktop 中繼資料與 transcript。Board 持有共用的 run 完成、進度、session 綁定與單一排程。任務與 run 保存 `tool`、`sourceTool`、`model`、session、cwd、需求與結果；舊資料讀取時預設 Codex，不改寫。session 去重鍵改為 (tool, id)；Codex 唯讀卡片 ID 保留 `session:<id>`，Claude 為 `session:claude:<id>`。nextRun 固定保存 tool／model／cwd，排隊期間拒絕更改，提供取消排隊。
- 理由：adapter 邊界讓 Codex 既有 17 項測試不改即通過；CLI 整合是本機唯一可查證的 Claude 派工途徑，沒有額外依賴。替代方案：Agent SDK（需新增 npm／pip 依賴，仍是同一 CLI 協定）、`claude --bg` 背景 agent（無結構化事件）、修改 Claude App（違反不改安裝檔原則）。
- 後果：Claude 派工為 CLI 整合而非 App 內嵌；看板只能透過 Claude App 的 Browser 窗格或瀏覽器開啟。控制協定未公開，CLI 改版可能需調整，流程以逾時與可見失敗保護。跨工具只能開新對話並帶摘要。權限固定 acceptEdits＋看板核准；效能等級尚未暴露。
- Verification：後端 30/30（原 17 項＋13 項多工具）、主題 7/7；專用 Codex App 真實 DOM 的 details／sessions 測試通過（含 Claude 工具／模型選單、跨工具後續需求、Claude 對話閱讀、徽章）。真實服務 1.4.0：Claude CLI 2.1.283 可用、5 個真實模型、48 個 App sessions 同步、對話可讀、保存卡片為 0 未變動。NOT VERIFIED：真實 Claude 模型派工與核准往返（需額度授權）、`-p` session 在 Desktop `/resume` 的可見性、Claude 真實 runtime 的精確狀態。

## ADR-005：右側屬性、執行模型與雙向相關議題（2026-10-10）
- 背景／Evidence：使用者更正屬性應在右側，指定創建日期、優先級、負責人作為模型、標籤與卡片關聯，排除截止日期／阻塞。上游 main 已刪除 workflowId；README／DevelopmentContext 型別指 Git branch 或 worktree。
- 決定：右側屬性取代 ADR-004 的左側；本機 model/list 動態清單與模型實際傳參，空值沿用設定；不使用上游原本的人員 assignee。labels 與 model 相容讀取預設值，不背景改寫舊卡片；日期唯讀。關聯單獨保存排序 ID pair，兩端可讀、移除／刪除雙向生效。
- 理由：模型選擇可執行而非顯示文字，避免固定清單失效；關聯單一來源可防止兩張卡片資料不一致。替代方案是硬編碼模型或 JSON 雙份關聯，容易漂移及互相覆蓋。
- 後果：模型選擇在 run snapshot 後只影響該次派工；不可用模型保存錯誤、不靜默換模型。關聯變更會更新對端 version，舊草稿需重新打開；不自動派相關卡片。工作流已被上游移除故不新增；開發上下文的綁定選單尚未實作，本次沿用工作資料夾。
- Verification：17/17 後端、7/7 主題；隔離真實 DOM／fake RPC 通過右側、日期、模型／標籤、雙向關聯、同／新對話、回報保留、窄螢幕。專用 App 1.3.0 載入、真實 model/list 回傳 7 個選項、87 張唯讀 session 卡片及資料不變通過；沒有真實模型派工、沒有額度測試。

## ADR-004：任務承載簡介、逐次回報與多個 session（2026-10-10）
- 背景／Evidence：使用者指定卡片主區顯示簡介、左側屬性與分類的多 session 清單，成果不符可再次對話；舊版只有最新 result 與 workerThreadId，重試清空結果。儲存時不建立聊天的設計已獲使用者確認。
- 決定：JSON body 增加 append-only 的 runs 與單筆 nextRun；明確後續需求排入待辦，start 才新建／resume；按 thread 分類各輪回報，全部歷史 thread ID 參與去重。唯讀卡片按需閱讀最近需求／回報，明確匯入後才可派工。
- 理由：一張任務卡保存跨對話的執行脈絡，仍保持單一 scheduler 與人工驗收。替代方案每次另建卡片會分散任務；只保存留言或事件會欠缺每次需求／thread／cwd 對應且事件清單有 300 筆上限。
- 後果：舊資料相容讀取、不背景寫入；已被舊版覆蓋的結果不推造。後續需求需版本與 thread 歸屬檢查、活躍訊號保護；來源只在明確送出延續需求後續跑。新對話帶原需求與有限回報摘要，對話保留在原 session，介面讀取最近 20 回合；原生 Project ID／側欄歸屬不宣稱已驗證。
- Verification：隔離後端 13/13（含原 session 6 項）；專用 App 的隔離真實 DOM／模擬 RPC 驗證簡介、左側屬性、專案預填、多 session、同／新對話、回報保存、未儲存保護、唯讀及窄螢幕；不耗模型額度。官方契約依 [App Server](https://learn.chatgpt.com/docs/app-server)，真正模型派工與側欄歸屬 NOT VERIFIED。

## ADR-003：既有 session 的唯讀同步投影（2026-10-10）
- 背景／Evidence：只手動匯入積壓；實測獨立 app-server 將本工作聊天回報 notLoaded，回合查詢回 interrupted，不能當跨程序真實 runtime；JSONL 有回合開始／活動／結束訊號。
- 決定：官方 thread/list metadata 加受限本機 JSONL 尾端，背景同步記憶體，API state 衍生唯讀卡片並依來源 ID 去重。近期訊號明列推論、過期／未知待確認、回合結束不宣稱已驗收。
- 理由：反映既有工作並保留 scheduler／DB 邊界。替代方案自動寫入 SQLite 會污染任務／事件並可能重複派工；直接接其他 App 私有 runtime 缺穩定公開介面。
- 後果：不含雲端／其他主機／subagent；不判定視窗開啟或精確跨程序核准。每檔 256 KiB，10 分鐘活動、60 秒快照新鮮度，錯誤保留；未知格式待確認。
- Verification：隔離 6/6、實際 App 86 張自動卡片／聊天閱讀／保存資料不變通過。介面依 [官方 App Server 文件](https://learn.chatgpt.com/docs/app-server)；JSONL 是本機觀察，非官方跨程序狀態契約。

## ADR-002：完整共用骨架（2026-10-10）
- 背景：先前只有入口與單一規範，未涵蓋完整全域規格。
- 決定：.agents 為共用 harness／技能来源，Claude 匯入文件、由腳本生成技能鏡像；角色與 hook Claude 專屬。
- 理由：單一來源與可重跑檢查；替代方案為兩份獨立規範，容易漂移。
- 後果：新增同步、結構、路由及 opt-in bench；靜態成功仍須區分 runtime。

## ADR-001：桌面啟動器與主題 bridge（2026-10-10）
- 背景：原生啟動無入口；iframe 寫死色彩；clone 剝除呈現 attributes。
- 決定：桌面使用可重入 launcher，原生 token 初始及即時傳至 iframe，保留按鈕樣式 attributes。
- 理由：沿用 profile 與安全邊界；替代方案為修改安裝檔或硬編碼兩套主題。
- 後果：App DOM／CSS 大改時需調整；普通原生啟動仍不載入看板。
