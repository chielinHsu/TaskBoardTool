# 目前狀態

> 原地修改，反映「現在」。每次收工更新；歷史在 `changelog-ai.md`。需求進度表的規則見 `.agents/harness/engineering-workflow.md`「需求展開與進度表」。

## 需求進度表

| 編號 | 類型 | 需求／細項 | 狀態 | 計畫 | 分支／commit | 驗證 |
|---|---|---|---|---|---|---|
| R01 | 功能 | 看板基礎：桌面啟動器、主題 bridge、既有 session 唯讀同步、任務詳情 | ✅ | [ADR-001](adr/001-desktop-launcher-theme-bridge.md)、[ADR-003](adr/003-readonly-session-projection.md)、[ADR-004](adr/004-task-brief-runs-sessions.md) | 初始快照 `3a092ee`（早期無逐項 commit） | PARTIALLY VERIFIED：後端、主題、實際 App 回歸通過；真實模型派工 NOT VERIFIED |
| R01.1 | | 桌面啟動器（mutex、專用 profile）與 Appearance token 即時同步到 iframe | ✅ | | | 實際 App 重開與色彩回歸 |
| R01.2 | | 本機未封存 Codex session 同步為唯讀追蹤卡片，回合訊號與去重 | ✅ | | | 隔離 6/6、實際 86 張卡 |
| R01.3 | | 詳情：需求簡介、逐次回報、多 session、後續對話延續或新對話 | ✅ | | | 隔離 DOM、後端 13/13 |
| R02 | 功能 | 右側屬性、模型選單（`model/list`）、標籤與雙向相關議題 | ✅ | [ADR-005](adr/005-right-properties-model-relations.md) | 初始快照 `3a092ee`（推斷，當時未單獨提交） | PARTIALLY VERIFIED：17/17 後端、隔離 DOM；真實模型派工、原生側欄歸屬 NOT VERIFIED |
| R03 | 功能 | Codex／Claude Code 雙工具、計畫匯入、依賴與排程 | ✅ | [ADR-006](adr/006-shared-execution-interface-claude-adapter.md)、[ADR-007](adr/007-http-keepalive-chunked.md)、[ADR-008](adr/008-plan-import-dependencies.md)、[ADR-016](adr/016-queue-timestamp-monotonic.md) | 初始快照 `3a092ee`；`df0e9e5` | PARTIALLY VERIFIED：後端、真實服務與 CLI 握手；`-p` session 於 App `/resume`、Remote Control NOT VERIFIED |
| R03.1 | | `ToolAdapter`／`ClaudeAdapter`（`claude -p` stream-json、模型清單、核准、interrupt） | ✅ | | | 後端 30/30、模擬 CLI |
| R03.2 | | HTTP/1.1 keep-alive 與 16 KB 分段寫出，修正大回應傳輸中斷 | ✅ | | | 80/80 連續讀取 |
| R03.3 | | 計畫匯入（`POST /api/plans`、`plan_import.py`）、`task_dependencies`、完成後自動釋放、推理強度 | ✅ | | | 後端 36/36、真實服務 1.5.0 |
| R03.4 | | 待辦排隊時間戳嚴格遞增 | ✅ | | `df0e9e5` | 後端測試 |
| R04 | 功能 | Claude Code 看板窗格 mod（taskboard-pane）與全域安裝 | ✅ | [ADR-012](adr/012-claude-app-snapshot-sync.md)、[ADR-014](adr/014-global-claude-mod-install.md)、[ADR-015](adr/015-claude-session-root-localcache.md) | `cf3f1cf`、`f8d3bc1`、`df0e9e5` | PARTIALLY VERIFIED：本 session 熱載入通過；筆電與新 session 自動開啟 NOT VERIFIED |
| R04.1 | | 窗格、`/taskboard`、建卡、`import_plan` 工具、`turn.start`／`turn.complete` 鏡像 | ✅ | | | mod validate／test |
| R04.2 | | `setup-claude-mod.mjs` 同步全域副本並登記 `CLAUDE_CODE_PLUGIN_DIRS` | ✅ | | `cf3f1cf` | `--check` 就緒 |
| R04.3 | | Store 版（MSIX）Claude App session 目錄改以套件 LocalCache 為優先 | ✅ | | `df0e9e5` | 真實服務可列出 session |
| R05 | 功能 | 嵌入看板滑鼠拖曳與 Codex 原生自動審核 | ✅ | [ADR-009](adr/009-codex-native-auto-review.md)、[ADR-010](adr/010-embedded-board-pointer-drag.md) | 初始快照 `3a092ee`（推斷） | VERIFIED（隔離真實滑鼠六組、後端 42/42、專用 App 回歸）；未用真實卡片拖曳派工 |
| R06 | 雜項 | repository 初始化與 GitHub 快照發布 | ✅ | [ADR-013](adr/013-github-connector-snapshot-publish.md) | `7d3174b`、`3a092ee`、`99b12d7` | VERIFIED：API 回讀與 git diff，遠端與本機 tree 相同 |
| R07 | 功能 | 看板名字讀登入帳號、服務識別改用 meta 標記 | ✅ | | `595df88` | PARTIALLY VERIFIED：服務重啟與標題實測、Python 50 項；Codex App 視窗畫面 NOT VERIFIED |
| R08 | 功能 | Claude App 對話鏡像為看板卡片 | ✅ | [ADR-017](adr/017-claude-app-mirror-runs.md)、[ADR-018](adr/018-mirror-card-brief-seed-once.md) | `af330e2` | VERIFIED：mod 事件真實送達、首句建卡進進行中 |
| R08.1 | | `POST /api/claude-turns`：首句建卡、每句一筆 `mirror` run、回合結束進待審核 | ✅ | | | Python 57 項、mod 7 項 |
| R08.2 | | 簡介／驗收條件由 haiku 擬稿一次，手改後鎖定（`brief` seed→drafted→manual） | ✅ | | | 隔離服務與 Browser 窗格 |
| R08.3 | | 聊天紀錄回合摺疊與三種配色 | ✅ | | | Browser 窗格 |
| R09 | 功能 | 回報渲染 Markdown 與 Mermaid（函式庫由安裝腳本下載並核對雜湊） | ✅ | [ADR-019](adr/019-vendored-frontend-lib-by-hash.md) | `1921dac`、`920d808` | VERIFIED：Python 67、Node 16；真實 Codex 內嵌 frame 繪圖成功、CSP 違規 0 |
| R10 | 修正 | 服務重啟後嵌入看板不再卡在連線中斷、背景視窗不再反覆重建 | ✅ | | `8bfb6c9`、`5b5fccd`、`15bee16` | VERIFIED：以 Debugger.pause 重現；`taskboard-app.test.mjs` 4 項 PASS（視窗可見時） |
| R11 | 修正 | 鏡像卡標題不再顯示 `<system-reminder>`，跟隨 Claude App 標題 | ✅ | [ADR-020](adr/020-mirror-card-title-follows-app.md) | `31ae150` | PARTIALLY VERIFIED：Python 70、隔離庫重現；App 實際改名端到端 NOT VERIFIED |
| R12 | 功能 | 卡片 Session 心智圖與 Ctrl＋M 快捷鍵 | ✅ | | `cc5a93d`、`ed33669` | PARTIALLY VERIFIED：Browser 窗格隔離 fixture 實測；正式服務與 Codex 內嵌畫面未驗證 |
| R13 | 功能 | Claude 派工改用 auto 權限模式、新 session 以需求命名 | ✅ | [ADR-021](adr/021-claude-auto-permission-mode.md) | `2284a2e`、`0cc1a0a` | PARTIALLY VERIFIED：真實派工 `permissionMode=auto`；核准往返 NOT VERIFIED |
| R14 | 修正 | 詳情的 session 第一次提問改從 transcript 開頭讀取 | ✅ | | `633adcb` | PARTIALLY VERIFIED：Python 72；Codex 來源 session 與 Codex 內嵌畫面未驗證 |
| R15 | 修正 | Claude App 倒回對話後沿用原鏡像卡，不再多建一張 | ✅ | | `4d362a2` | PARTIALLY VERIFIED：Python 76、正式服務讀回；未在 App 再倒回一次 |
| R16 | 文件 | 操作手冊與 15／45 秒動態簡報影片、看板 README 章節化 | ✅ | [user-guide](user-guide.md) | `dbe0f23`、`c378be0` | PARTIALLY VERIFIED：兩支 MP4 在 Chrome 解碼；Windows 媒體播放器 NOT VERIFIED |
| R17 | 功能 | GitHub AI PR／CI 與 Pages 展示 | ✅ | [ADR-022](adr/022-github-ai-pr-and-pages.md)、[github-automation](github-automation.md) | `896470a`（#1） | PARTIALLY VERIFIED：CI 三項與 Pages 通過；真實模型 job 與自動合併需 Secrets，未驗證 |
| R18 | 功能 | 專案篩選合併清單、新式資料夾選擇視窗、需求附件 | ✅ | [ADR-023](adr/023-task-attachments.md) | `9ed444f`（#2） | PARTIALLY VERIFIED：Python 81、Node 30、隔離服務；`taskboard-details.test.mjs` 第 33 行在 baseline 即失敗（見 R23） |
| R19 | 修正 | Claude worktree 與暫存資料夾不再成為專案名 | ✅ | | `50632a8`（#3）、`4a748d0` | VERIFIED：Python 82、正式資料唯讀試算 42 張卡；正式服務重啟結果見 `4a748d0` |
| R20 | 修正 | 窗格下拉選單不再自己收起；Claude 卡片無群組為「未分組」 | ✅ | [ADR-024](adr/024-claude-card-project-from-app-group.md) | `4c4feed` | PARTIALLY VERIFIED：Python 84、mod 12、真實 App 讀到 39 群組；窗格下拉停留 10 秒須人工 |
| R21 | 功能 | 看板開機自動啟動與斷線自動重啟（`watchdog.ps1`、`install-autostart.ps1`） | ✅ | | `01518e4` | PARTIALLY VERIFIED：排程建立、停服務 35 秒自動重啟；實際重開機後啟動 NOT VERIFIED |
| R22 | 雜項 | 導入 AI 結構 2.0.0 | ✅ | [ADR-025](adr/025-ai-structure-v2.md) | PR #7 `76c2e0a`（已合併到 main） | 見 R22.5 |
| R22.1 | | 入口（AGENTS／CLAUDE）、project-rules（SOLID、四種輸出、Step Protocol、Git、Commit）、engineering-workflow、ai-handoff 換成 2.0.0 | ✅ | | | `check-ai-structure.ps1 -Strict` |
| R22.2 | | `decisions.md` 拆成 `docs/adr/` 24 檔並改為索引；新增 ADR-025 | ✅ | | | 內文非空行數核對 126＝126 |
| R22.3 | | 新增 `docs/00-master-plan.md`、`docs/plan/`、`docs/steps/_template/`、`tools/ste-lint.mjs`；本表回填 R01–R21 | ✅ | | | `node tools/ste-lint.mjs` |
| R22.4 | | 保留專案專屬：`sync-skills.ps1`／`skill-sync.json`、模型路由案例與檢查、hook 環境變數、settings 接線、CI；`check-ai-structure.ps1` 補回專案檢查並修 Linux 路徑 | ✅ | | | 見 R22.5 |
| R22.5 | | 驗證與提交 | ✅ | | PR #7 | 本機四項檢查通過；CI 三項（含 ubuntu pwsh 結構檢查）通過後 rebase 合併 |
| R26 | 功能 | PR 自動合併支援其他目標分支（CI 接受所有 PR 目標、審查固定 base ref／SHA、只有 main 部署 Pages） | ✅ | [ADR-026](adr/026-pr-automerge-any-base.md)、[github-automation](github-automation.md) | `feat/pr-automerge-any-base`（PR，CI 通過後自動合併） | PARTIALLY VERIFIED：scripts/ci/check.mjs 與 Actionlint 通過；真實多目標 GitHub 流程未驗證 |
| R26.1 | | 非 main 目標端到端驗收：`develop`（自 main `02b2b3b`）＋ PR #9（`ai/claude/r26-develop-check`，只改 docs） | ⏳ | | PR #9 | CI 三項通過、AI Review 記錄目標 develop／base `02b2b3b`、引擎 claude；第一次審查依文件規則拒絕（缺修改紀錄表、未更新交接）→ 不合併，補齊後重跑 |
| R23 | 修正 | `tests/taskboard-details.test.mjs` 第 33 行 baseline 失敗（2026-10-14 記錄，之後未見處理） | ⚠️ | | | NOT VERIFIED（是否仍失敗未重跑） |
| R24 | 雜項 | 補驗證缺口：窗格下拉選單停留 10 秒、實際重開機後自動啟動、Claude 核准往返、Claude 角色／hook 實際 model／effort | ⬜ | | | NOT VERIFIED（需人工或授權） |
| R25 | 功能 | Git 分支／worktree 綁定、截止日期等（AI_CONTEXT 記為尚未實作；是否要做待決定） | ⬜ | | | |

圖例：✅ 完成　⏳ 進行中　⬜ 尚未開始　⚠️ 有未解決問題　⛔ 取消

回填說明：R01–R21 依 `docs/changelog-ai.md` 與 `git log`（至 `01518e4`）整理，只列主要細項；2026-10-11 的早期工作在初始快照 `3a092ee` 之前沒有逐項 commit，標「推斷」者是依 changelog 推出的歸屬。這些功能完成於 2.0.0 之前，不補計畫檔與四種輸出（見 ADR-025）。

### 待使用者決定

1. R26：非 main 目標的驗收進行中（R26.1、PR #9）；`develop` 要不要設 protection／ruleset（目前沒有，只靠 AI 審查關卡）、驗收後 `develop` 是否保留。
2. R24：哪些驗證缺口要排人工驗收（窗格下拉選單、重開機自動啟動、核准往返）。
3. R23：`taskboard-details.test.mjs` 第 33 行失敗是否先修。
4. R25：Git 分支／worktree 綁定要不要做。
5. ADR-024 的伺服器端規則與舊卡跟隨：交接單（2026-10-14）寫正式服務尚未重啟，之後是否已重啟沒有紀錄，需確認。

## 目前進度與歷史狀態（2.0.0 之前的紀錄，依日期由新到舊，內容保留）

## 2026-10-15：PR 自動合併支援其他目標分支

- 使用者要求本人／維護者的 PR 指向其他分支時，也能走 CI＋AI 審查後自動合併。CI 移除 main 目標篩選，AI Review 與 canMerge 接受任意既有目標；保留同 repo／維護者／非草稿／檔案範圍 gate。
- 審查固定目標 ref／base SHA，模型另讀目標程式碼快照，控制程式與規則仍讀 main。結案時 head、目標及 base SHA 必須與審查一致；CI 有關聯資料時檢查 PR／目標。同 head 多 PR 無法唯一對應時停止，需明確指定 PR。
- 僅 main 合併啟動 Pages；其他目標不部署。Issue AI Task 仍建立到 main；GitHub 其他分支 protection／ruleset 未更動。架構前後圖與 ADR-026 已記錄。
- VERIFIED：完整 scripts/ci/check.mjs（Python 82、Node 31、路由 74、展示建置）；Actionlint 1.7.12 兩份 workflow 通過；Strict 結構／技能鏡像與 git diff --check 通過。
- 實際失敗：py -3 指向失效 Store Python，改內建 Python 全部通過；Strict 初次被沙箱 Git ownership 阻擋，改用單次程序 safe.directory 通過；缺 PyYAML 改用官方 Actionlint，下載已核對 SHA-256。
- NOT VERIFIED：真實 GitHub 多目標 CI／模型審查／合併。2026-10-22 依使用者要求提交到 `feat/pr-automerge-any-base`、推送並開 PR（R26）；舊分支 CI 也需包含新版 workflow 才會對非 main 目標觸發。

## 2026-10-14：窗格下拉選單不再自己收起；Claude 卡片無群組為「未分組」

- 問題 1（窗格 Select 打開後很快收起）：根因 VERIFIED。`refresh()` 每 5 秒把新物件（`updatedAt` 每次不同）寫入 snapshot，每次寫入都會重畫讀過它的窗格（型別檔 `$.state.set`：the sites that read it while drawing are drawn again）。新增回歸測試在修正前失敗：同一份看板輪詢 6 次寫了 6 次 snapshot（Expected 1, Received 7）。修正：`publish()` 只在內容（扣掉 updatedAt）改變時寫；新增表單開著時延後套用（核准請求、連線狀態改變例外），收起表單、建立後或按「重新整理」立即套用；表單內加靜態說明。型別檔的 Select 沒有開啟／關閉狀態可用。
- 問題 2（未分組）：依使用者決定，綁定 Claude App session 的卡片（鏡像、唯讀追蹤、session 匯入）沒有側欄群組時專案為「未分組」；匯入計畫未給專案的 Claude 事項也是「未分組」；Codex 與手動卡仍為「個人任務」。新增 `projectSource` app／manual，舊卡（專案為資料夾／repository 名、個人任務、未分組或群組名）自動跟隨群組；看板上改過即不再動；群組首次送達前不改（ADR-024，API 1.11.0）。index.html 與窗格的退回值改為依工具（`projectOf`）。
- 群組同步從未送達的根因 VERIFIED：mod 一次 `list_sessions({limit:500})` 的結果 178,962 字，引擎換成「Output has been saved to …」文字（isError=false），`JSON.parse` 失敗被 catch 吞掉。改為 `list_groups`＋逐群組 `list_sessions`；錯誤送 `{error}` 顯示於橫幅／窗格；每回合也同步。另發現並修正 `import_plan` 回傳 `{content,isError}` 不符引擎輸出格式（引擎要求字串或陣列），改回傳字串。
- VERIFIED：Python 84（新增／改寫：群組跟隨與錯誤、手動保留、計畫未分組、session 匯入未分組）；`claude plugin validate` 通過、`claude plugin test` 12/12（新增：輪詢不重寫、表單延後與核准例外、未分組選項、逐群組讀取、過大結果與連接器錯誤、每回合同步）；以變異測試確認拿掉延後條件時測試失敗；`node scripts/ci/check.mjs` 通過（Node 30、路由 74、展示建置）；inline script 解析；隔離服務（47999）網頁：Claude 計畫卡「未分組」、Codex 計畫卡與手動 Claude 卡「個人任務」、專案篩選「未分組 · Claude」、0 console 錯誤。setup-claude-mod.mjs 已同步全域副本（--check 一致）；熱重載後真實 App 內 mod 讀到 39 群組／200 sessions，正式服務收到 `POST /api/claude-groups` 200（舊版伺服器，只更新唯讀卡的群組名）。
- 正式資料唯讀試算（新伺服器規則套用後）：52 張已保存 Claude 卡會跟隨（AutoCadCreated→Qt_AutoCadCreated 18、TaskBoardTool→小工具開發-任務看板 14、DiskAnalyzer→小工具開發-硬碟容量檢查 5、SecurePackStudio→小工具開發-加密壓縮打包 3、6 張→未分組、3 張 worktree 隨機名→Qt_AutoCadCreated…），0 張手動專案，3 張 session 不在索引中不動。
- NOT VERIFIED：真實 Claude App 窗格內打開「既有專案」／「負責模型」下拉選單停留 10 秒以上不收起（無法操作 App 原生窗格，需使用者實測；全域 mod 已熱重載）；正式服務仍為 1.10.0，伺服器端「未分組」與舊卡跟隨待重啟後生效；網頁橫幅錯誤文字（隔離服務 --no-connect 不跑 session 同步，橫幅不顯示該列；`claudeGroupsError` 欄位由 API 確認）。`tests/taskboard-projects.test.mjs` 需專用 Codex App profile，worktree 無 `.data/app-integration.json` 未執行。
- 觀察：除錯時暫時在 mod 加了診斷工具並同步到全域副本，已移除並重新同步（全域副本與來源一致、無 diag 字樣）；備份在 work/claude-mod-backups。

## 2026-10-14：Claude worktree／暫存資料夾不再成為專案名

- 原因：Claude 卡片沒有 App 群組時以 cwd 的資料夾名當專案；App worktree（`<repo>\.claude\worktrees\<隨機名>`）與暫存工作區（`…\scratch-workspaces\…\scratch-…`）的資料夾名是隨機標籤，專案下拉因此多出約 30 個無意義項目。
- 修改：session_sync.py 新增 `project_from_cwd()`（PureWindowsPath 解析，非 Windows 主機也能拆 Windows 路徑）：worktree 取 repository 名、暫存工作區為「Claude 暫存工作區」；唯讀同步卡、匯入卡、鏡像新卡共用。`Board.follow_cwd_project()` 在每次 Claude session 同步時，把專案仍等於資料夾原名的舊鏡像卡改為 repository 名；看板上改過或 App 群組給的專案不動。
- VERIFIED：Python 82（新增 mirror 測試 1 項：路徑解析、唯讀卡、鏡像新卡、舊卡跟隨一次且不重複寫入、手動專案不動）。以正式看板資料唯讀試算：20 張已保存卡（AutoCadCreated 12、AlgoParamFineTune 1、DiskAnalyzer 2、SecurePackStudio 2、TaskBoardTool 1、暫存 1…）與 22 張唯讀卡皆對應到正確 repository。
- 同日續：PR #3 經 CI 三項通過後自動合併（50632a8），使用者授權後重啟正式服務。VERIFIED：重啟前只有 App 鏡像中的卡片、無看板派工；重啟後第一次 Claude 同步，worktree／暫存資料夾名的專案為 0 張，已保存卡改為 AutoCadCreated 13、SecurePackStudio 2、DiskAnalyzer 2、AlgoParamFineTune 1、TaskBoardTool 1、Claude 暫存工作區 1；專案下拉由 69 項降為 38 項。
- 觀察：合併提交標題與內文符合格式，但 `gh pr merge --author-email chielin0025@hotmail.com` 未生效，作者仍為 GitHub noreply（推測該信箱未在 GitHub 驗證或帳號開啟隱藏信箱），committer 為 GitHub。前次背景 start.ps1 於舊服務停止時才結束，證實是服務持有輸出管道；以背景執行則正常結束。

## 2026-10-14：專案篩選、資料夾選擇與附件

- 專案篩選：「全部工具」時 Codex 群組 21 項排在 Claude 群組前，下拉第一屏只看得到 Codex，且同名專案分屬兩組（選哪組都篩兩種工具）。改為每個專案一項、統一排序並標註使用的工具；選單一工具時只列該工具專案。
- 資料夾選擇：舊 FolderBrowserDialog 只有樹狀清單、不能輸入路徑；改為新式 IFileOpenDialog（FOS_PICKFOLDERS），網址列可輸入／貼上路徑，擁有者視窗 TopMost 並嘗試取得前景。工作資料夾欄改為可換行的文字框，「用過的資料夾」以完整路徑按鈕列出（原 datalist 在 270px 欄位截斷）。
- 附件（ADR-023）：需求與驗收條件、後續需求、聊天紀錄的延續對話可選檔、拖放、貼上截圖；詳情、留言、session 第一次提問顯示附件縮圖與下載，圖片可放大預覽。API 1.10.0。
- VERIFIED：Python 81；`scripts/ci/check.mjs`（PYTHON_BIN 指向實際 Python）Node 30、路由 74、展示建置；taskboard-projects、taskboard-drag、taskboard-demo 通過；隔離服務（47999）瀏覽器驗證篩選、完整路徑、附件上傳／儲存／後續需求排隊與取消、0 console 錯誤；資料夾視窗經隔離服務開啟、選取回傳路徑、取消保留原值。
- 實際失敗：taskboard-details.test.mjs 第 33 行 `detail.editor` 斷言失敗，未修改的 baseline（git stash）同樣失敗，屬既有問題，未處理。
- PARTIALLY VERIFIED：資料夾視窗由背景服務開啟時為 TopMost（顯示在最上層）但 Windows 不給前景焦點，需點一下視窗。NOT VERIFIED：真實模型讀取附件、Codex App 嵌入時的上傳。
- 同日續：使用者授權後提交 fb58e0a（未 push），以 stop.ps1＋start.ps1 -NoBrowser 重啟正式服務。VERIFIED：重啟前無派工中任務（只有本對話鏡像卡）；重啟後 /health 正常、Browser 窗格版本 1.10.0、404 張卡片、專案下拉 69 項含 51 個 Claude 專案、新增任務有附件按鈕。觀察：Bash 背景執行的 start.ps1 在服務啟動後未結束，推測服務程序繼承輸出管道，未強制結束以免連帶關閉服務。

## 2026-10-13：GitHub AI PR／CI 與 Pages 展示

- 新增跨平台 CI、三種工具路由的 AI Task／AI Review、最新 SHA／CI／檔案範圍合併 gate、明確 dispatch Pages；選定 Claude 實作＋Codex 審查。
- Pages 沿用看板 HTML，獨立範例資料層與 localStorage；不連模型、本機服務或私人資料。
- VERIFIED：Python 77、Node 30、路由 74／74；Chrome 子路徑、CRUD、保存、模擬派工、拖曳、對話、心智圖、375px、零 API 請求。NOT VERIFIED：真實模型／自動合併端到端，需 Secrets；GitHub Windows／Ubuntu／瀏覽器 CI 已通過（run 38383501615）；Pages 於 main 合併後發布。
- GitHub 初次 Ubuntu CI：資料夾選擇測試被 Windows guard 拒絕（3 error／1 failure）；測試只替換 folder_picker 模組的 OS 與程序旗標，保留實際主機／pathlib，新增非 Windows 拒絕測試。修正後 GitHub CI 三項通過。main 已設定 PR／strict required CI，Pages 與 both／自動合併設定已套用。
- 既有 handoff 65 行超過 60，改為本輪新交接；檢查腳本加入 Linux pwsh fallback。設定見 docs/github-automation.md，決策 ADR-022。

## 2026-10-13：操作手冊 docs/user-guide.md 與 45 秒簡報影片

- 新增分章節操作手冊 `docs/user-guide.md`，根目錄 README 與看板 README 開頭加連結；`docs/images/` 放打碼標註截圖與影片畫面。影片原始碼與成品在 `work/promo-video/`（已納入 Git，中間產物排除），重新產生方式見該資料夾 README。
- VERIFIED：MP4 在 Chrome 解碼與關鍵影格人工檢視。NOT VERIFIED：其他播放器相容性；手冊內容依 index.html 文案、啟動腳本與 AI_CONTEXT 撰寫，未逐項在真實看板重演每個步驟。

## 2026-10-13：Claude App 倒回對話後沿用原鏡像卡

- 原因：App 倒回訊息改用新的 CLI session id（舊 id 在 `priorCliSessionIds`），看板以 session id 找卡而多建一張同標題卡。claude_sessions 回傳 `priorIds`，鏡像回合與 Claude 同步依此把原卡的 sourceId 改到新 id，舊 id 的 runs 併入新 session（`priorSessionIds` 保留舊 id），詳情不再重複列同一段 session；新 id 已有自己的卡則不動。
- 重複卡 056C36 經使用者同意合併進 8142B6 並刪除，合併前備份資料庫至 work。
- VERIFIED：Python 76 項、正式服務重啟後 /api/state 只剩一張卡且狀態列正確；Browser 窗格詳情只列一個來源 session。NOT VERIFIED：真實 App 再次倒回的端到端。

## 2026-10-13：背景中的 Codex 視窗不再反覆重建嵌入看板

- 使用者要求查服務重啟後重新載入延遲（35 秒～2 分鐘）。實測（看板 frame 與主頁面放記憶體計時器）：視窗在背景時主頁面計時器先 2.5 秒，30 秒後降為 20、60、60 秒，約 4 分鐘後完全不再醒來；送進頁面的 CDP 指令常 10 秒逾時。延遲原因：換頁面要等看板頁面輪詢拿到 403，頁面被節流／停住時無法進行，前景時 8～14 秒。屬 Chromium／Electron 背景省電，非看板邏輯。
- 連帶問題：舊 helper 把 CDP 逾時當斷線，關閉重連並重建 panel 與 iframe，背景中約每 5 分鐘一次（14:25:17、14:30:19、14:34:31），使用者回到視窗時看板與開著的詳情可能已被重建。
- 修正：cdp.mjs 逾時錯誤加 `timeout`；app-injector.mjs 對已建立、WebSocket 仍開啟的連線，逾時只寫 `renderer-busy` 並等待；loadFrame 一旦 prepare 過 iframe，失敗後必換新 iframe；`resetFrame()` 成功後才清 `reloadFrame`。未做：helper 主動偵測服務恢復換頁（頁面停住時同樣無法完成，效益有限）。
- VERIFIED（worktree 版 helper 接專用 App、正式服務 1.9.0）：Debugger.pause 主頁面 35 秒，helper 狀態 `renderer-busy`、0 次重新載入、恢復 5 秒內同一 frame ready、CDP 連線維持 2 條；背景 10 分鐘 0 次重新載入；前景時 App 開著重啟服務 14 秒換新 frame、token 一致、RPC 正常；`node tests/taskboard-app.test.mjs` 4 項 PASS。實際失敗：觀察腳本 `uniq -f1` 合併同狀態列，一度誤判狀態檔未更新。NOT VERIFIED：主 checkout 部署（需 commit 後 stop-app.ps1＋start-app.ps1）。

## 2026-10-13：卡片 Session 心智圖

- 每張卡片頁尾新增「◎ N session · M 對話」按鈕，詳情「對話與執行回報」標題旁也有「◎ Session 心智圖」。開啟後以 SVG 畫出 卡片 → session（Codex／Claude Code 分色，標類別與對話數）→ 每次對話（編號、需求摘要、類型、狀態色點、時間）；點 session 開聊天紀錄，點對話跳到詳情中那次回報並短暫外框標示，點卡片節點開詳情（已開的同卡詳情不重新初始化，未儲存的編輯保留）。
- 對話數＝看板 run；沒有看板 run 的 session（同步唯讀卡、來源對話）開圖時讀 `/api/chat` 計回合數（最多 20，超過顯示「20+」），結果快取後卡片按鈕也顯示。單一 session 超過 12 次對話時只畫最近 11 次加一個「較早 N 次」節點；派工未建立對話的 run 歸在「未建立對話」。只用 createElementNS 與文字節點，配色走 CSS token，純前端，不改 API／資料。
- VERIFIED：index.html 兩段 inline script 解析；Node 主題＋Markdown 18 項；Browser 窗格以隔離 fixture（`tests/taskboard_details_fixture.py`，假 RPC）實測：完整任務卡 2 session／3 對話、Claude 接手卡分色、唯讀卡讀到 1 回合後卡片按鈕更新、點對話跳到第 2 筆 run 並標示、詳情內開圖、session 節點 Enter 開聊天紀錄；暗色、亮色、375px（圖在容器內橫向捲動，頁面不溢出）。NOT VERIFIED：正式 47824 服務與 Codex App 內嵌畫面；未新增自動化測試（details／App DOM 測試需專用 Codex App CDP）。
- 同日續：使用者要求心智圖可展開縮放。每個 session 右側 ＋／− 圓鈕展開或收合該 session 的對話（收合狀態依卡片保留在頁面記憶體），工具列「全部展開／全部收合」、「⛶ 放大視窗」（98vw×96vh）、縮放 −／百分比（回 100%）／＋／符合寬度；畫布內 Ctrl＋滾輪以游標為中心縮放（30%～300%）、拖曳空白處平移、聚焦畫布時 ＋／−／0 鍵；開啟時符合寬度但不小於 60%（手機可讀）。VERIFIED：script 解析、Node 18 項、隔離 fixture 實測收合／全部展開收合／按鈕與滾輪縮放／真實滑鼠拖曳平移／放大視窗無溢出／鍵盤 Enter 收合後焦點保留／0 鍵符合寬度、375px 暗色開啟 60%、無 console 錯誤。NOT VERIFIED：觸控雙指縮放（未實作，手機用按鈕；拖曳平移只對滑鼠）、正式服務與 Codex App 內嵌。
- 同日續：使用者要求快捷鍵叫出心智圖。新增 Ctrl＋M（Mac 為 Cmd＋M）：滑鼠指著卡片、用 Tab 選到卡片，或已開啟卡片詳情時按下即開啟該卡心智圖，再按一次關閉；沒有對象時顯示提示。詳情按鈕、卡片按鈕的提示文字與心智圖說明列都標出快捷鍵。VERIFIED：script 解析、Node 18 項、details／drag／projects DOM 測試；隔離 fixture 以 CDP 真實按鍵實測滑鼠指向開啟、再按關閉、無對象出提示、詳情內開啟且關閉後詳情保留、鍵盤焦點卡片開啟、無頁面錯誤。NOT VERIFIED：正式服務、Codex App 內嵌 iframe（焦點須在看板 iframe 內）、Claude App Browser 窗格是否先攔截 Ctrl＋M。

## 2026-10-13：App 開著時重啟看板服務，嵌入看板卡在「連線中斷」

- 根因（實驗重現並查證）：服務重啟換 token，嵌入頁的舊 token 打 API 得 403，app-injector 把 `loadedFrame` 設 null，下一輪對**同一個 iframe** `Page.setDocumentContent`。這是 `document.open()` 語意：換文件、清 window 事件監聽，但保留 JS 全域環境；新主程式在 `const TOKEN` 重複宣告失敗而整段不執行（frame 全域 TOKEN 仍舊值、body 無 `embedded` class），舊程式用新 capability 發 RPC，helper 有回應、訊息也送達 frame（capability 正確），但已無監聽器收，畫面一直「連線中斷」。與 Mermaid 無關，自此功能以來即存在。
- 修正：app-panel.js 新增 `resetFrame()`（`createFrame()` 建全新 iframe 取代舊的，清 capability／frameLoaded）；app-injector.mjs 403 改設 `reloadFrame`，主迴圈先 `resetFrame()` 再 `loadFrame()`，新文件拿到乾淨 realm。另修 CDP 連線外洩：建立連線時先持有 `connection`，設定中途失敗由外層關閉（舊 helper 累積 19～31 條 9232 連線，且 stop-app.ps1 後程序因此無法結束）。
- taskboard-app.test.mjs：入口圖示選取／取消的檢查從固定等 300 ms 改為最多輪詢 2 秒；主頁面會因看板每 2.5 秒輪詢 634 KB state（399 張卡，386 張唯讀同步卡）而週期性停頓 200～570 ms，固定等待會偶發失敗。
- VERIFIED（worktree 版 helper 接專用 App、正式服務）：App 開著重啟服務，約 35 秒後換上新 iframe、3 秒內 ready，新主程式執行、frame token＝服務 token、RPC 正常；修正前同操作卡死需重開 App。新 helper 維持 2 條 CDP 連線。`node --check` 通過。App 測試在視窗可見時 4 項 PASS 一次；視窗最小化／被遮住（visibilityState hidden）時入口動畫不跑，第二項失敗，屬環境。另一偶發：重新載入前後卡片總數因 session 同步增減而不同（即時資料競態，未修）。
- NOT VERIFIED：35 秒～2 分鐘才重新載入的延遲成因（推測隱藏 iframe 計時器節流；視窗可見時實測 8 秒）。部署方式：stop-app.ps1 + start-app.ps1（或桌面捷徑）重啟 helper，重開 App 不會換 helper。
- 主 checkout 部署 VERIFIED（同日 12:15）：對方 session 合併 origin/main 後主 checkout 含修正（三檔與分支相同）；worktree helper 以 app-stop 控制檔停止後自行結束（舊版因外洩連線無法退出）；主 checkout start-app.ps1 啟動 helper（PID 31644，2 條 CDP 連線）；確認無派工後 App 開著重啟服務，12:15:21 重啟→12:15:29 換新 iframe→12:15:33 ready，新主程式執行、token 一致、RPC 約 2 秒；主 checkout `node tests/taskboard-app.test.mjs` 4 項 PASS（視窗可見）。另刪除 worktree 誤啟動留下的 `outputs/taskboard/.data`（使用者同意）。

## 2026-10-13：鏡像卡標題不再是 `<system-reminder>`，並跟隨 Claude App 的 session 標題

- 使用者發現幾張鏡像卡標題顯示 `<system-reminder>`。原因：worktree／未選資料夾的 session，App 在首句前插入 `<system-reminder>` 區塊；App 的 session 標題在首回合結束後才產生，建卡當下只能用首句第一行。
- 修正：transcript 與 mod 送來的需求去掉開頭的 `<system-reminder>` 區塊；卡片新增 `titleSource`（seed／app→manual），標題在每個回合事件與每次 Claude session 同步跟隨 App 標題（含在 App 改名），看板上改過標題後不再覆寫；舊卡在該 session 下一個回合判定。API 1.9.0（ADR-020）。
- VERIFIED：Python 70 測試（鏡像 14 項，新增 3 項）、`py -3 -m py_compile`、Node details／drag／projects；以隔離 DB 讀真實 Claude session 索引（唯讀）重現 3 個 session：首回合標題為真實需求第一行，同步後變成 App 標題。同日續：正式服務已重啟為 1.9.0（使用者授權，stop.ps1＋start.ps1 -NoBrowser 絕對路徑，主 checkout、同一資料庫）：重啟後已有回合事件的鏡像卡 0fcf4c、97c1ac、37970a、f8578d 為 titleSource=app 且標題等於 App 標題；ad11df 仍是 `<system-reminder>`，等該 session（AlgoParamFineTune）下一個回合。`taskboard-sessions-app.test.mjs` 重跑：版本 1.9.0、模型清單、frame 重新載入、同步卡片與聊天紀錄皆通過，最後「卡片未改變」的 deepEqual 失敗，差異只在 `sessionStatus`（活躍 session 的訊號時間與標籤在測試期間變動，為衍生欄位），屬測試對活躍 session 的既有脆弱性。 NOT VERIFIED：真實 App 改名的端到端。

## 2026-10-12：回報渲染 Markdown 與 Mermaid 圖

- 看板的執行回報、session 最近回報、聊天紀錄（進度與回報；你的訊息維持純文字）、狀態列表完成訊息改以 Markdown 顯示；```mermaid 區塊畫成圖，配色跟 Appearance token 與明暗主題，切換時即時重新上色；圖無法解析或函式庫未安裝時顯示原始碼與原因。
- Mermaid 11.17.2 由 `node outputs/taskboard/setup-mermaid.mjs` 下載到 `outputs/taskboard/vendor/`（不進 Git，SHA-256 核對），頁面經 `GET /api/vendor/mermaid` 懶載入；網頁版與 Codex 內嵌版同一路徑，CSP 未放寬。API 1.8.0。每個 checkout 要各執行一次安裝腳本。
- VERIFIED：下載／核對／`--check`；Python 67、Node Markdown 11＋安裝 5＋主題 7；Browser 窗格隔離服務（47999）實測三種圖、退回、明暗、惡意標籤（`__xss` 為 0）、聊天紀錄；在同一 Chromium 以內嵌相同 CSP meta＋postMessage RPC 模擬，零 CSP 違規、主題訊息重新上色。NOT VERIFIED：mod 窗格不渲染（原生元件）。
- 同日續：使用者授權後 commit 1921dac、push 分支並快轉合併 main、push origin/main；主 checkout 的 vendor/ 由 worktree 已核對的檔案複製（`--check` 相符）；正式服務重啟為 1.8.0。VERIFIED：`node tests/taskboard-app.test.mjs` 4 項 PASS；在真實 Codex 內嵌 frame 以暫時離屏 DOM 畫流程圖與循序圖皆 rendered，線框色等於 App accent，securitypolicyviolation 0 筆，未寫卡片。實際失敗：(1) 給使用者的 stop／start 指令用相對路徑，使用者終端機在 worktree，服務一度從 worktree 以空資料庫啟動（真實資料未受影響，已以絕對路徑換回；worktree 的 .data 留著、gitignore）；(2) App 開著時服務重啟，frame 已重新載入新頁面但之後 RPC 無回應、一直顯示連線中斷，使用者重開 App 與服務後恢復；原因未查明（helper 重連或首次 3.7 MB 回應皆有可能，無證據區分）。
## 2026-10-12：Claude App 對話自動鏡像為看板卡片

- 使用者指出唯讀同步卡片出現在「待審核」卻不能拖，按「建立派工卡片」後又退回列管，狀態對不上。改為 taskboard-pane mod 在 `turn.start`／`turn.complete` 把 session 的回合送到 `POST /api/claude-turns`：session 首句自動建卡並直接進「進行中」（priority 高、tool claude、綁定 session、cwd 存在才填），回合結束進「待審核」並把回覆存成 run 結果；同 session 後續每句都是同一張卡的 `mirror` run，已完成的卡收到新需求重開。看板不派工、不延續、不停止這些 session；看板自己派的 Claude run 不鏡像。
- 鏡像執行中的卡片不可拖、不能改狀態、不能開始執行或送後續需求，回合結束後解除；徽章「Claude App 對話執行中」。中止的回合回列管、錯誤／拒絕記為失敗但仍進待審核、排有 nextRun 的卡回待辦。API 1.6.0。
- VERIFIED：Python 57 測試（含新 `test_taskboard_mirror.py` 7 項）、`claude plugin validate`／`test` 7 項、隔離服務（47999）＋Browser 窗格實測：送 start 後卡片在進行中且不可操作，送 complete 後移到待審核。全域 mod 副本已以 setup-claude-mod.mjs 同步（新 session 生效）。真實 Claude App session 實測：turn 事件確實送達 `/api/claude-turns`，`$.session.id()` 等於 transcript id（非桌面 `local_…` id），首句在正式看板建卡進「進行中」並取代唯讀追蹤卡，徽章／拖曳鎖定／詳情停用皆符合預期；正式 47824 服務已重啟為 1.6.0。NOT VERIFIED：真實回合結束後移到待審核（隔離服務已驗證）；Codex App DOM 測試未跑。觀察：`claude-groups` 從未送達，鏡像卡 project 取資料夾名。

### 同日續：聊天紀錄摺疊與配色、簡介擬稿、重啟不中止鏡像

- 使用者看了鏡像卡的聊天紀錄後要求：回合要能摺疊、你／Claude 的訊息用顏色區分、需求簡介與驗收條件未填時依第一句需求擬一份且後續對話不得改動。
- index.html：聊天紀錄每回合一個 `details.chat-turn`（只展開最新一則；summary 為「回合 N · 狀態 · 首句摘要 · 時間」，回合 ID 放 title），你的訊息 `msg-user`（accent-light 底＋accent 左框）、進度 `msg-progress`（灰、虛線）、回報 `msg-agent`（hover 底）；詳情簡介在 `brief` 為 seed／drafted 時附說明。
- server.py：`brief` 狀態 seed→drafted→manual、`event=brief`／`apply_brief`、`first_prompt`（transcript 最早一句）、`update` 改 description 即 manual、舊鏡像卡重播種、重啟復原跳過鏡像中的卡片；API 1.7.0。mod：`draftBrief` 以 `$.model.complete`（haiku／low）擬稿回寫。
- VERIFIED：Python 61 測試（鏡像 11 項）、mod validate／test 7 項、index.html script 解析、正式服務重啟為 1.7.0、Browser 窗格實測聊天紀錄三回合摺疊與配色；真實回合結束移到待審核（run 1 completed）。實際失敗：重啟當下服務把鏡像中的 run 標為中止（已修，回合結束訊號到達後自癒）。NOT VERIFIED：真實 `$.model.complete` 擬稿與 brief 回寫（需下一句觸發）；DOM 測試未跑。本機 `python`／`py -3.12` 為失效的 Store alias，用 `py -3`（3.9）。
## 2026-10-12：看板名字來自登入帳號；服務識別改用 meta 標記

- 左上角與頁籤的名字不再寫死：Codex App 嵌入（`embed=1`）顯示 Codex 登入帳號（id_token 的 `name`），Claude App Browser 窗格與瀏覽器顯示 Claude Code 登入帳號（`oauthAccount.displayName`）；缺的用另一個，都沒有顯示「使用者」；每次開頁面重新讀。
- 啟動器與 helper 辨識看板服務改看 `<meta name="taskboard-service" content="caspar-taskboard">`，不再比對名字；改名字不會再讓 Codex App 的 frame 反覆重載。
- VERIFIED：靜態檢查、重啟後兩種頁面的標題、app-status `ready`／`frameLoaded`、Python 50 測試。NOT VERIFIED：Codex App 視窗內實際畫面、`node tests/taskboard-app.test.mjs`。

## 2026-10-12：驗收完成時清除舊的失敗訊息

- 使用者回報待審核卡片出現「需要處理」，拖到已完成時 toast 顯示舊的 OAuth 錯誤。原因：Claude CLI 登入過期，派工 run 失敗，錯誤存為卡片 `error`；狀態事件 message 優先採用卡片 error，而改為 done 不清除，所以驗收事件重播失敗訊息。
- 修正 server.py Board.update：狀態為 todo 或 done 時一併清除 error／retryAt；run 歷史仍保留當次錯誤。後續 run 成功本來就會覆寫卡片 error，以新測試固定此行為。
- VERIFIED：新測試修正前失敗、修正後通過；Python 全套 50 測試通過。NOT VERIFIED：真實看板需重啟服務後才生效；未改前端，Node／App 測試未跑。本機 `python` 為 Store alias 會靜默失敗，改用 `py -3.9`。

## 2026-10-12：Codex App 任務看板入口啟用

- 使用者要求在 Codex App 顯示任務看板入口。啟動前 Git 工作目錄乾淨；47824 看板服務已運行，尚無專用 profile／9232 renderer。沿用 `start-app.ps1` 啟動專用 Codex 視窗與 helper，重用既有服務。
- VERIFIED：專用 profile 與 loopback 埠所有權核對通過；真實 DOM 顯示導覽列圖示、「New chat」下方文字入口及已載入的看板。`node tests/taskboard-app.test.mjs` 四組檢查通過：API 連線、主題同步、圖示選取、重新整理後保留單一圖示／文字入口／看板。
- 本次只啟用既有整合並更新文件，未修改產品程式、卡片或派工設定，未呼叫模型；未 stage、commit、push。入口位於專用 Codex 視窗，普通啟動的視窗仍沿用原生介面。
- 實際啟動一度回報等待原生導覽列，App 完成載入後正常；本機執行沙箱初始化失敗，經限定範圍的核准於沙箱外完成檢查與啟動。完整關閉後再由桌面捷徑冷啟動本輪 NOT VERIFIED。

## 2026-10-12：新電腦安裝與「建立派工卡片」工具漏傳

- 新電腦安裝 VERIFIED：全域 mod 同步＋settings 登記（--check 就緒、validate 通過）、桌面 Codex.lnk、服務 47824 回應 200，Browser 窗格顯示 Codex 已連線、Claude Code 可用（CLI 2.1.294）、30 Codex／351 Claude sessions 同步；/reload-plugins 後本 session 載入 mod。NOT VERIFIED：專用 Codex App 視窗（未啟動）、新 session 自動開窗。安裝腳本「找不到 Python」為 cmd 解析誤判，不影響啟動。
- Bug 修正：詳情視窗「建立派工卡片」未帶 `tool`，Claude 同步卡片匯入被 server 當 Codex 查找而失敗（「請先更新聊天清單」）。index.html 一行修正帶 `sourceTool`。VERIFIED：真實看板實測同卡片匯入成功、狀態可編輯、可拖曳；inline script vm 解析通過。details Node 測試需專用 Codex App，未執行。
- 設計行為提醒：同步 session 卡片唯讀，不能拖曳或改狀態，需先建立派工卡片。

## 2026-10-11：Store 版 Claude App 的 session 路徑

- Observed Fact：橫幅「Claude App session 資料未找到」。Claude App 已是 MSIX 套件 `Claude_2.31226.1.0`，`%APPDATA%\Claude` 被虛擬化到 `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude`；桌面啟動的看板服務（非 App 子程序）讀不到，Claude Code 內啟動的實例讀得到。環境變數、token、程式碼比對皆相同，重啟服務不解。
- 修正：claude_sessions.py 先找套件 LocalCache 路徑再找 Roaming，不可用時重新解析；能力值 `sessionRoot`、橫幅附實際路徑。VERIFIED：runtime Python 解析 49 rows、新增 2 測試、全套 47/48（queue 排程測試為既有偶發時間戳相同）。NOT VERIFIED：使用者重啟後實際橫幅。
- 排程 queuedAt：Windows `time.time()` 15.6 ms 解析度造成同 tick 卡片同值；新增 `queue_stamp()` 嚴格遞增與 `queue_order` 次鍵，測試 49/49 連跑 3 次通過。

## 2026-10-11：看板 mod 跨 session／跨電腦安裝腳本

- Observed Fact：Claude App「開發 mod」的安裝快照位於 `~/.claude/dev-mods/<session id>/taskboard-pane`，只在建立它的 session 載入；目前 session 與其他電腦都看不到窗格。使用者層 `~/.claude/settings.json` env.CLAUDE_CODE_PLUGIN_DIRS 是每個 session（含 App 啟動）都載入的途徑。
- 新增 setup-claude-mod.mjs（依使用者要求採全域安裝，與 usage-bar 等 mod 相同）：雜湊比對後同步來源到 `~/.claude/mods/taskboard-pane`（保留引擎寫入的 types／tsconfig、覆寫前備份），把全域路徑登記到 CLAUDE_CODE_PLUGIN_DIRS、設 DIR_WATCH=1、移除若有的專案來源路徑，備份後寫入並回讀核對；--check 唯讀；回報前置條件與舊副本；claude plugin validate 靜態檢查。pull 後重跑即同步。README／AI_CONTEXT 改以此為正規流程，update-claude-mod.ps1 退為舊 dev-mods 流程。
- VERIFIED：node --check、--check 乾跑（正確回報 6 個待複製檔、缺少的全域路徑、工具版本與舊副本）。使用者執行腳本後 VERIFIED：--check 就緒（exit 0）、~/.claude/mods/taskboard-pane 存在並由引擎寫入 types／tsconfig、/reload-plugins 後本 session 載入 taskboard-pane 工具。NOT VERIFIED：筆電環境、新 session 自動開啟窗格。.data 不進 Git，新機器為空白看板；未知 .codex/ 未版控。

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

- 能力對照：Codex＝app-server RPC、專用 App 內嵌、thread/resume 延續、模型 `model/list`、核准／提問、唯讀 session 同步；Claude Code＝CLI 整合（`claude -p` stream-json、`--session-id`／`--resume`、`--model`、`auto` 權限模式（分類器自動核准，其餘經看板核准 `can_use_tool`，ADR-021）、interrupt 停止）、initialize 握手取得真實模型（本機 5 個）、唯讀 Claude App session 同步（48 個）與 transcript 閱讀、`claude --resume` 指令複製；不內嵌 Claude App、無 `claude://` 開啟看板 session 的途徑。
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
