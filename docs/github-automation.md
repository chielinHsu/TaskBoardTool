# GitHub AI PR／CI 與 Pages 展示

完整工具仍在 Windows 本機執行。Pages 是純前端範例，支援卡片 CRUD、拖曳、模擬派工、範例對話、Session 心智圖、篩選與匯出；資料僅存在這個瀏覽器的 localStorage。不連模型、SQLite、真實 session 或本機檔案，不支援計畫匯入。

## 工具模式與認證

Settings → Secrets and variables → Actions → Variables 設定 `AI_MODE`：

| 值 | 實作 | 審查 | 必要 Secrets |
| --- | --- | --- | --- |
| `claude` | Claude | Claude | `ANTHROPIC_API_KEY` 或 `CLAUDE_CODE_OAUTH_TOKEN` |
| `codex` | Codex | Codex | `OPENAI_API_KEY` |
| `both` | Claude | Codex | 上述兩种工具各一組認證 |

使用者選擇 `both`。`AI_AUTO_MERGE=true` 啟用符合條件的自動合併；`false` 保留人工合併。`AI_MODE=off` 或未設定會停用自動審查。

認證只放 Actions Secrets，不進程式碼、Pages、Issue 或聊天。Codex 官方 Action 使用 API key，與本機訂閱登入不同。Claude 可用 API key，或本機 `claude setup-token` 產生的訂閱 token；不複製本機認證檔。API 用量依供應商計費，請在供應商後台設定適合的支出限制。[Codex Action](https://learn.chatgpt.com/docs/github-action)、[Claude Actions](https://code.claude.com/docs/en/github-actions)。

## 派工與流程

1. 建立 Issue，描述需求、預期行為與驗收條件。
2. write／maintain／admin 使用者在 Issue 留下**單獨一行** `/ai`，使用 repository 模式；`/claude` 或 `/codex` 代表該次實作與審查都只用指定工具。
3. 或 Actions → AI Task → Run workflow，填 `issue_number`。
4. 模型在隔離 Linux runner 編輯與驗證，輸出完整檔案 JSON；另一個 job 驗證路徑、大小、格式與 main 的 base SHA，再建立分支和 PR、明確 dispatch CI。
5. CI 在 Ubuntu／Windows 跑現有 Python、可攜 Node、路由／AI 結構檢查；另以 Chromium 驗證展示。
6. 成功 CI 後，AI Review 只讀差異與目標分支固定 SHA 的程式碼快照，回傳結構化判斷。獨立 job 記錄 review、驗證合併條件、squash merge；只有合併到 main 才 dispatch Pages。

本人／維護者在同一 repository 建立的 PR，可指向任意既有分支，例如 `feature/child → feature/parent`、`feature/x → develop` 或 `release/1.0`，不再限定 main。CI 涵蓋所有 PR 目標；建立、更新、重開、轉為非草稿或編輯 PR 時觸發。只有分支而沒有 PR，不會自動合併。Issue 的 AI Task 建立流程仍以 main 為目標。

`/ai` 是本專案 workflow 指令，不需要安裝 Claude／Codex GitHub App；與官方 `@claude`／`@codex` 入口不同。不要對同一需求同時啟動兩套流程。

每個 Issue 同時只跑一個任務，每次成功任務會建立獨立 PR；不要重複派工同一份需求。CI／審查失敗會留下 PR 和紀錄，不做無限重試或自行放寬檢查。目前沒有自動修復迴圈；修正分支後重跑 CI，或以新的、明確範圍的 Issue 派工。

## 自動合併條件

- 同一 repository 的非 draft PR、目標為任意既有分支、作者為維護者或本流程的 github-actions bot。
- 最新 commit 的最新 CI run 成功，審查／PR head／CI SHA 完全相同；merge API 另傳 SHA，防止審查後推送競態。
- 審查記錄目標分支名稱及 base SHA，結案時必須一致；中途換目標或目標更新，舊審查即失效，需重跑 CI／審查。CI 含 PR 關聯資料時也核對 PR 編號／目標／base SHA；沒有關聯且同一 head 對應多個開啟中的 PR 時，不猜測對象，改由維護者 Actions → AI Review 明確填 `pr_number`。
- 合法 JSON：`approved=true`、`findings=[]`；缺認證、拒絕、格式錯誤或不確定就不核准。
- 修改在允許清單內。CI、部署、agent 規則／技能、啟動腳本、認證／私人資料不可由 AI Task 發布；`AI_CONTEXT.md`、`server.py`、`claude_adapter.py`、`tool_adapters.py` 涉及契約或權限邊界，保留人工審查／合併。
- `AI_AUTO_MERGE=true`，目標分支的 GitHub 保護規則也允許合併。

AI 核准記錄為 `COMMENT` review；同一 bot 不能用 Approve 核准自己的 PR，所以合併依 required CI 和獨立 AI verdict 判斷。若另加 required human approvals，仍需要人類核准。

模型 job 的 GitHub 權限只有讀取。發布端不執行模型產物；外部 fork 不進有模型認證的審查；動作依賴固定完整 SHA。

## GitHub 設定

- Pages → Source：GitHub Actions；github-pages environment 限 main 部署。
- Actions → General：允許 Actions 建立 PR，job 明列最小權限。
- main 分支保護：require PR、require branches up to date，required checks：`verify (ubuntu-latest)`、`verify (windows-latest)`、`demo-browser`，禁止 force push 與刪除。
- 其他目標分支沿用自己的 protection／ruleset；本修改不自動變更 GitHub 設定。若要對 develop／release 等分支強制人類核准或 required checks，需在那些分支的規則設定。
- Secrets 依模式設定；沒有認證的模型 job 清楚失敗，不切換供應商。

GITHUB_TOKEN 建立 PR／合併不會無條件引發其他 workflow，因此建立 PR 明確 dispatch ci.yml，合併 main 明確 dispatch pages.yml。合併其他分支不啟動正式部署。一般 PR／main push 仍有 CI。[GitHub Token](https://docs.github.com/en/actions/concepts/security/github_token)、[Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

AI Review 的程式與規則仍從受信任的 main 載入；模型另外唯讀檢視 `work/ai/base` 的目標分支快照，不執行快照內容。本變更需先發布到 main，才會成為 GitHub 使用的審查流程；舊分支上的 CI workflow 也需包含這次變更，才能對非 main 目標觸發 CI。

## 本機驗證

```powershell
node scripts/ci/check.mjs
node scripts/ci/build-demo.mjs
python -m http.server 8080 --directory work/pages
```

開 `http://localhost:8080/`。輸出只有 index.html、demo.js、.nojekyll，不複製 repository 的 .data、token、session 或私人檔案。Playwright 是安裝在忽略的 work/browser 的 CI 測試工具，不是看板 runtime 依賴。

真正的 Claude 任務、Codex 審查、自動合併與其後部署，需要 Secrets 後以只改展示文案的小 Issue 做端到端驗收。格式、路由、SHA／失敗 CI 的拒絕與展示可在不耗模型額度下驗證；不要將尚未執行的模型流程稱為已生效。

## 非 main 目標的端到端驗收

ADR-026 的非 main 目標流程以下列方式驗收：從 main 建立 `develop`，以 `ai/claude/<主題>` 分支（分支前綴指定 Claude 審查）開一個只改 `docs/` 文件的 PR 指向 `develop`。預期 CI 三個 job 都執行；AI Review 記錄目標 `develop` 與當時的 base SHA，唯讀簽出目標快照；核准後合併到 `develop`，不 dispatch Pages。驗收結果記在 `docs/current-status.md` 需求進度表 R26。
