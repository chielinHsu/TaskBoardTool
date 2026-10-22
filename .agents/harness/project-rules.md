# 專案規則

本檔放「這個專案的慣例」。流程在 `engineering-workflow.md`，專案事實在 `AI_CONTEXT.md`。結構版本 2.0.0（見 `.agents/harness/TEMPLATE_VERSION`、`docs/adr/025-ai-structure-v2.md`）；本專案原有的規則保留在「專案原有規則」與各段落，沒有因為導入 2.0.0 而刪除。

## 專案原有規則（保留）

- 沿用 Python 標準函式庫與原生 JS／Node API，不為局部修正加入框架。例外（ADR-019）：前端渲染函式庫可由安裝腳本下載寫死版本／URL，以腳本內位元組數與 SHA-256 核對（不符即刪除並失敗），存於 gitignore 的 `outputs/taskboard/vendor/`，經受保護的 `/api/vendor/*` 以 JSON 供應、頁面懶載入；不放寬 CSP、不加 unsafe-eval、不從 CDN 直接載入、不提交函式庫本體。
- 延續現有函式與檔案命名。文件繁體中文、UTF-8；中文 .ps1 用 UTF-8 BOM；PowerShell 5.1 讀取加 -Encoding UTF8，HTTP 探測加 -UseBasicParsing。
- 事實與規範集中在共用來源；`docs/DEVELOPMENT.md` 保留為索引。
- Appearance 背景、前景、accent、字型同步原生 token，不硬編碼綠色；保留原生 icon 呈現 attributes。
- 不改真實任務資料，不複製認證資料，不關閉一般 App，不改安裝檔、不複製登入資料；CDP 只接已驗證的專用 profile。
- `.data`／SQLite／profile／token／截圖不進 Git；測試不可改真實卡片。
- 啟動器確認埠／profile 所有權；mutex 避免雙擊啟動競態。未驗證的平台 runtime 不得稱已生效。
- 所有 subagent 不 stage、commit、push，不再委派，不覆蓋來源不明的未提交修改。

## 程式碼風格

- 沿用周邊程式碼的命名、縮排、註解密度與慣用寫法；不做無關的重構或格式化。
- 新增依賴前，先確認既有依賴解決不了（本專案無 package.json，沒有 npm build）。
- 換行與編碼依 `.gitattributes`：`*.js`／`*.mjs`／`*.py`／`*.html`／`*.md` 為 LF，`*.ps1`／`*.cmd` 為 CRLF。含中文的 `.ps1` 存成 UTF-8 with BOM，否則 Windows PowerShell 5.1 會用系統字碼頁解析而亂碼；Markdown 與其他文字檔用 UTF-8 無 BOM。
- 命名與註解：Python、JS 都延續既有檔案的寫法；UI 文字與文件使用繁體中文，時間顯示 Asia/Taipei。

### SOLID 檢查清單（每個 PR / commit 前自問）

- **S** 這個類別只有一個變更理由嗎？超過 300 行要在 commit 說明。
- **O** 新增功能是「新增類別 + 註冊」，還是「修改既有 use case」？後者要有理由。
- **L** 新的實作能通過同一組介面的契約測試嗎？
- **I** 介面 ≤ 5 個方法？UI 只看到它需要的最小介面？
- **D** use case 只依賴抽象介面（port），具體 adapter 只在組裝處（composition root）建立？

本專案的落實方式：`server.py`、`index.html` 是既有大檔，不因本清單而重構；新增功能優先放新模組（先例：`attachments.py`、`folder_picker.py`、`plan_import.py`）；執行工具的差異放在 `ToolAdapter` 介面後面（`tool_adapters.py` 的 `CodexAdapter`、`claude_adapter.py` 的 `ClaudeAdapter`），新增工具時實作同一介面並補同一類測試，避免在排程與 API 裡散落工具判斷。

## 每一步都必須交付四種輸出（Karpathy 的 4 種輸出形式）

目的：讓讀者清楚知道這個設計的**目的（Purpose）、原因（Reason）、效果（Effect）**。放在 `docs/steps/<ID>-<slug>/`，範本在 `docs/steps/_template/`。

**適用範圍**：Step Protocol 的步驟，以及 `docs/current-status.md` 需求進度表中類型標為「功能」的需求。**小修正（fix、docs、chore、refactor 等）免四種輸出**，只要依 `ai-handoff` skill 更新進度表、交接單與 changelog。（導入 2.0.0 之前完成的功能不補四種輸出，見 ADR-025。）

| # | 輸出 | 檔案 | 要求 |
|---|---|---|---|
| 1 | 寫作 Writing | `spec.md` | 用 ASD-STE100 風格英文寫 Purpose / Reason / Effect（放在 `<!--STE-->` … `<!--/STE-->` 之間），每段後附繁中摘要。短句（描述句 ≤ 25 字、程序句 ≤ 20 字）、主動語態、一詞一義。執行 `node tools/ste-lint.mjs` 必須無 error。這是長度/被動語態的檢查，**不是**完整 STE 驗證。 |
| 2 | 圖解 Diagrams | `diagram.md` | Mermaid 圖（結構圖、流程圖、序列圖、狀態圖擇需要者）。能用圖就不要用長文。 |
| 3 | 互動網頁 Web page | `explainer.html` | 單一檔案、離線可開、深色/淺色皆可讀、手機寬度可用；要有可操作的元件（slider、按鈕、步進）。需要的文字放在 `<script type="application/json" id="ste-data">`，其中 `ste` 欄位會被 lint 檢查（舊專案的 `id="aoi-data"` 也認得）。 |
| 4 | 解說影片 Explainer video | `storyboard.md` | 分鏡表（時間、畫面、旁白 STE 英文、繁中字幕）。實際影片/語音合成是選配，需使用者同意再做。 |

另外每一步要有 `perf.md`：本步驟量測了哪些指標、預算、實測值、機器指紋。本步驟沒有效能指標時，寫「本步驟無效能指標」並說明原因，不要留白。

## Step Protocol（每完成一個步驟必做；不要在同一個 session 連做下一步）

步驟 ID `<ID>` 用總體計畫（`docs/00-master-plan.md`）的編號；本專案目前沒有預先排好的步驟，需求進度表的 `Rnn` 若自成一步（跨多個 session 的功能）就當 ID。

1. 開工：讀 `docs/current-status.md`（需求進度表）與 `docs/plan/<ID>-*.md`。從預設分支（`main`）建立分支 `feat/…`／`fix/…`（本專案沿用此命名，不用範本的 `step/NN-slug`）；把本步驟在進度表裡的列標為 ⏳。
2. 實作，並同時產出四種輸出與 `perf.md`（依上方適用範圍）。
3. 驗證：依下方「驗證」段落與該步驟 plan 檔「完成定義」；有四種輸出時加跑 `node tools/ste-lint.mjs`。**失敗就如實回報，不要宣稱完成。**
4. 更新 `docs/current-status.md`（需求進度表該列改 ✅，補分支／commit 與驗證），並依 `ai-handoff` skill 更新 `.ai/handoff.md` 與 `docs/changelog-ai.md`。
5. Commit（格式見下方「Commit 訊息」），之後的推送、PR 與合併依下方「Git」的授權流程；**不使用範本預設的本機 `merge --no-ff` 與 `step-NN-done` tag**，因為本專案的 `main` 由 PR 的 rebase 合併進入。
6. 對使用者**提示 commit 內容**：commit hash、訊息、變更檔案摘要、效能結果、未解決事項。
7. 為下一步建立新 session（prompt 取自**下一步** plan 檔底部的「Start prompt」，並提醒新 session 回覆使用繁體中文）：Claude Code 用 `start_session` 或 `spawn_task`（工具可用時）；Codex 或工具不可用時，把 prompt 印出來讓使用者貼上。**到此為止，不要接著做下一步。**

## Git

- 調查、review、狀態詢問不授權 commit 或 push。**授權的流程**以上層共用規則檔為準：Claude Code 讀 `D:\CodexWork\CLAUDE.md`（本專案在 `D:\CodexWork` 之下）的「完成後的自動流程」；Codex 不讀上層檔，照下列重點執行：功能完成且本機驗證通過、文件／交接更新後，從 `main` 開 `feat/…`／`fix/…` 分支（已在功能分支就沿用）提交、推送該分支、`gh pr create`（標題同提交標題格式）；本專案有 GitHub CI，用 `gh pr merge <編號> --auto --rebase` 啟用自動合併（PR 內每筆提交都要符合下方格式與身分，必要時先整理成一筆），合併後切回 `main` 並 `git pull`。不做：force push、直接推送 `main`、修改分支保護或略過 CI、發布正式版本。重啟正式服務、改動真實資料仍需當次授權。
- 使用者當次明確說不要提交（例如「不擅自提交」）時，停在本機修改並回報。
- Stage 時明確列出路徑，禁止 `git add .` 與 `git add -A`（`.claude/settings.json` 也設了 deny）。
- Commit 前看 `git status` 與 `git diff --staged`。
- 工作目錄可能有他人或其他 session 的未提交修改。同一個檔案混有他人修改時，先確認自己的精確 diff，不整檔 stage，也不回復他人的內容；來源不明的修改不 stage、不覆蓋、不刪除。
- Commit 訊息一律寫成檔案（UTF-8）再用 `git commit -F <檔案>`；不用 `-F -`（stdin）、heredoc 或拼接多個 `-m`。
- 不使用 `--no-verify`；force push、`reset --hard`、`clean` 需要使用者明確同意。
- 不要提交的路徑：`outputs/taskboard/.data/`（SQLite、profile、token）、`outputs/taskboard/vendor/`、`work/*`（`work/promo-video/` 的原始碼與成品除外，中間產物 `enc*`／`frames*`／`verify` 排除）、`.ai/bench/`、`.ai/router-state/`、`.claude/settings.local.json`、`.claude/worktrees/`、`CLAUDE.local.md`、`perf/results/`；`.gitignore` 已涵蓋。

### Commit 訊息

本節是 commit 訊息格式的唯一權威：任何 AI 在 commit、或只是產生一段訊息給人貼上時，都照本節產出。格式是使用者的固定慣例，與上層共用規則檔（`D:\CodexWork\CLAUDE.md`）相同；**上層共用規則檔有規定時以上層為準，提交身分與格式以上層為準**：作者與 committer 一律為 `Caspar Hsu <chielin0025@hotmail.com>`，指令固定寫成 `git -c user.name="Caspar Hsu" -c user.email="chielin0025@hotmail.com" commit -F <檔案>`，不用這台電腦全域 gitconfig 的公司帳號，也不用 sw03@benanos.com，不修改全域 gitconfig。

訊息骨架（每個空行都是格式的一部分，不可增減）：

```
[作者名字]type: 一行修改說明

<正文>

測試 :
<測試說明>

Co-Authored-By: Claude <當下模型名稱>

[Test]
Build OK, Test OK
```

- **標題**：`[作者名字]type: 修改說明`。`]` 之後不留空格，冒號後一個半形空格。作者名字固定寫 `Caspar`。type 用小寫英文，**只寫一個，不加括號**：`feat`、`fix`、`docs`、`refactor`、`test`、`chore`、`perf`、`build`。說明用繁體中文，一句話交代「到底改了什麼」，禁止「修正問題」「調整程式碼」這類沒有資訊量的句子。
- **正文**：與標題空一行，用散文（不用條列）。先寫使用者的回報或要求，再寫原因／現象，再寫改了什麼（檔案、函式、行為）；踩到的坑、否決的做法、實測的數字都寫進來。每行約 30 個全形字折行。
- **`測試 :`**：`測試` 與冒號之間一個半形空格，自成一行；內容從下一行開始，用繁體中文（指令、函式名保留原文，敘述句要中文）。沒跑就照實寫沒跑，或寫實際做了什麼驗證；不可以為了填滿格式而編造結果。
- **`Co-Authored-By: Claude <模型名稱>`**：前後各空一行。模型名稱填產生這次 commit 的模型當下實際的名字，不要從文件或舊 commit 抄。**後面不接 email 與角括號**，這是刻意的選擇，不要順手加回去。Claude Code 寫 `Claude <模型名稱>`；Codex 提交沿用本專案先例寫 `Codex`（例如 `896470a`）。
- **結尾固定兩行**：`[Test]` 與下一行的測試結果（例如 `Build OK, Test OK`；實際失敗就照實寫，如 `Build OK, Test FAIL`）。純文件、純設定的修改、沒有建置的專案也照寫，不省略。這兩行不代表本次有建置；實際驗證了什麼只看 `測試 :` 區塊。
- 一個 commit 一個意圖；格式化、重新命名不要混進功能 commit。

## 文件

- 文件、UI 文字、提交訊息用繁體中文，UTF-8。
- 修改任何 Markdown 後，最終回應要列出「本次修改差異」。
- `docs/` 內的功能或設計文件（`architecture.md`、`github-automation.md`、`user-guide.md` 等），最前方保留修改紀錄表，新紀錄放在最上方。既有文件沒有此表的，下次修改時補上。
- 流程圖寫進文件時保留 Mermaid 原始碼。
- 文件裡的路徑、指令與檔名必須是真的存在的；不確定就不寫。
- 設計決策寫成 `docs/adr/NNN-slug.md`（範本 `docs/adr/_template.md`），並在 `docs/decisions.md` 的索引加一行；`decisions.md` 不放 ADR 內文。
- 需求進度表（`docs/current-status.md`）與計畫檔（`docs/plan/`）的規則見 `engineering-workflow.md`「需求展開與進度表」。

## 驗證

- 驗證指令與 `VERIFIED` 的定義在 `AI_CONTEXT.md` 的「建置與測試」；步驟層級的驗證項目在 Step Protocol 第 3 步。
- CI（`.github/workflows/ci.yml`）會在 ubuntu 與 windows 執行 `node scripts/ci/check.mjs`（含 `scripts/ai/check-model-routing.mjs`）與 `./scripts/ai/check-ai-structure.ps1 -Strict`；改過 `scripts/ai/`、入口檔、skill 或 `.claude/` 後，兩項都要能通過，且路徑不可寫成只在 Windows 成立的形式。
- 改過入口檔、skill、`.claude/` 或 `scripts/ai/` 之後，執行 `scripts/ai/check-ai-structure.ps1 -Strict`；改過 skill 先 `sync-skills.ps1` 再 `-Check`；改過模型路由相關檔案，再跑 `node scripts/ai/check-model-routing.mjs`。
- 真實 App、真實派工、正式服務重啟與額度測試需要當次授權；沒執行就標 `NOT VERIFIED`，不要用隔離測試冒充。
- 目前沒有額外的 commit 前 hook gate；若新增，寫在這裡並在 `.claude/settings.json` 以 hook 實作。
