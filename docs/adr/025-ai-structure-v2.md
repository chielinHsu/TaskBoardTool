# ADR-025：導入 AI 結構 2.0.0（2026-10-21）

- 日期：2026-10-21
- 決定者：使用者（要求整套照搬 AutoCadCreated 的 AI 結構）；由 Claude Code（Sonnet 5.5）依 AI 結構 2.0.0 規格套用
- 狀態：採用（補充 ADR-002，不取代；ADR-002 的單一來源與鏡像機制仍有效）

## 背景

本專案原為 `harness-1.0.0`：入口、共用 harness、模型路由與四支 `scripts/ai`。問題有三：決策全部內嵌在 `docs/decisions.md`（約 37 KB，無法單獨引用某一筆）；`docs/current-status.md` 是依日期堆疊的長文，看不出每個需求做到哪；沒有總體計畫、SOLID 檢查、Step Protocol 與統一的 Commit 訊息規則。Codex 與 Claude Code 輪流在同一個 repository 工作，只靠文件交接。

## 決定

依 AI 結構 2.0.0 規格（`TEMPLATE_VERSION` = `2.0.0`）：

- `AGENTS.md` 改成 bootloader：四條不可省略規則（繁體中文與完成總結、不虛構驗證、不擅自 commit／push、非單純需求先展開進度表）、必讀清單、收工、平台備註與 Codex 專屬段落；本專案原有的不改真實任務資料、不複製認證、不改官方 App 安裝檔移到 `project-rules.md`。
- `docs/decisions.md` 改成索引，ADR-001 至 ADR-024 逐筆搬到 `docs/adr/NNN-slug.md`，編號與內文不變；新增 `docs/adr/_template.md`。
- `docs/current-status.md` 開頭新增「需求進度表」（`Rnn`／`Rnn.m`，依 changelog 與 git log 回填），原有狀態段落保留在表格之後。新增 `docs/00-master-plan.md`、`docs/plan/_template.md`、`docs/steps/_template/`、`tools/ste-lint.mjs`。
- `engineering-workflow.md`、`ai-handoff` skill、`check-ai-structure.ps1` 換成 2.0.0 範本；`project-rules.md` 保留本專案規則並補上 SOLID、四種輸出（適用範圍：Step Protocol 步驟與進度表中類型為「功能」的需求）、Step Protocol、Git 與 Commit 訊息、文件與驗證規則。
- 本專案保留不換成範本的部分：`sync-skills.ps1` 與 `skill-sync.json`（舊格式 `source`／`targets`／`shared`，與範本的 `sourceDirectory`／`targetDirectory` 不相容，範本版對本專案的 JSON 會在 StrictMode 下拋 `PropertyNotFoundException`）、`MODEL_ROUTING.md` 的本專案案例與看板計畫匯入段落、`check-model-routing.mjs`（含 `TASKBOARD_ROUTER` 環境變數與 `node "$CLAUDE_PROJECT_DIR/…"` hook 命令檢查）、`bench-model-routing.mjs`、`.claude/settings.json` 接線、`.claude/launch.json`、`CODEX.md`、`.github/workflows`。
- `check-ai-structure.ps1` 在範本版之上補回本專案的檢查：用 `Split-Path` 解析根目錄（範本的 `Join-Path $PSScriptRoot '..\..'` 在 Linux 的 pwsh 會失敗，而 CI 的 `verify` job 會在 ubuntu-latest 與 windows-latest 以 `pwsh` 執行 `./scripts/ai/check-ai-structure.ps1 -Strict`）、git work tree、`bench-model-routing.mjs` 與 `.claude/skills` 必要、`bypassPermissions` 與 `git add .`／`git add -A` deny 規則、agent frontmatter、`.gitignore` 樣式、文件 UTF-8／U+FFFD。

## 否決的替代方案

- 把範本的 `sync-skills.ps1` 整份換上並改寫 `skill-sync.json`：會同時動到 CI 依賴的鏡像檢查與既有格式，沒有必要；改保留專案版，`check-ai-structure.ps1` 已能呼叫兩種參數名（`-RepositoryRoot`／`-Root`）。
- 為過去的需求補計畫檔與四種輸出：沒有當時的證據，補寫等於編造；`docs/plan/`、`docs/steps/` 只放範本，之後的功能才要用。
- 保留 ADR-000：本專案 ADR 已到 024，另開 000 會與 ADR-002（共用骨架）重複敘述；改以本筆（025）記錄導入。

## 後果

- 之後新的設計決策寫 `docs/adr/NNN-slug.md` 並在 `docs/decisions.md` 索引最上方加一行；專案內既有的「ADR-0nn」文字引用不變，連結到 `docs/decisions.md` 時只會看到索引。
- `docs/current-status.md` 超過 150 行，`check-ai-structure.ps1` 會給「行數」警告（不是失敗）；舊狀態段落保留，之後逐步移進 `changelog-ai.md`。
- 本專案由 Codex 為主：`project-rules.md` 的授權範圍沿用本專案現況（有 GitHub remote 與 CI，依上層 `D:\CodexWork\CLAUDE.md` 的完成後流程），不是範本預設的「不 push」。
- Codex／Claude 實際讀取行為沒有端到端實測；結構檢查通過不等於平台載入。
