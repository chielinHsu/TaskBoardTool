# 交接（2026-10-27）：AI 結構 3.0.0（每個計畫一個資料夾）

> 覆寫式交接單：每次收工整份重寫，保持在 60 行內。計畫的進度與接續資訊在各計畫的 `status.md`（入口 `docs/plans/INDEX.md`），這裡不重抄；2.x 的紀錄在 `docs/legacy/`。

- 最後一位 agent：Claude Code (Claude Sonnet 5.5)
- 日期：2026-10-27

## 上一個 session 動到的計畫

- R27（AI 結構 3.0.0，已完成）：[`docs/plans/completed/R27-ai-structure-v3/`](../docs/plans/completed/R27-ai-structure-v3/plan.md)。決策 ADR-027。
- R23–R25 從 2.x 的需求進度表遷移成計畫，內容沒有變。

## 接下來

- 沒有進行中的實作；R23–R25 都在等使用者決定或人工操作：[R23 受阻](../docs/plans/active/R23-details-test-baseline-failure/status.md)、[R24](../docs/plans/active/R24-verification-gaps/status.md)、[R25](../docs/plans/active/R25-git-branch-worktree-binding/status.md)。
- 跨計畫的已知問題與待使用者決定（含 R26 的後續）見 [`docs/current-status.md`](../docs/current-status.md)。

## 不要動

- 真實任務、SQLite、session、認證、官方 App；不提交 `work/`、`vendor/`、`.data/`。
- 範本管理的檔案不要在專案裡改：`engineering-workflow.md`、`TEMPLATE_VERSION`、`.agents/skills/ai-handoff/`、`sync-skills.ps1`、`migrate-ai-structure-3.mjs`、`tools/ste-lint.mjs`、各 `_template`。
- `docs/legacy/` 只讀；`docs/adr/` 的 ADR-001 至 ADR-026 不改，新決策從 028 接續。
- `AGENTS.md` 的「Codex 專屬」一節與 `CODEX.md`：Codex 不讀上層 `D:\CodexWork\CLAUDE.md`，提交身分與格式寫在 `project-rules.md`。

## 未提交的變更

- 本次修改未提交、未推送，由主 session 查核後提交（分支 `docs/ai-structure-v3`，從 main 開出；有 GitHub remote 與 CI）。

## 假設與未驗證項目

- 沒有跑 `scripts/ci/check.mjs`、Python／Node 測試：本次沒有改程式原始碼。
- `skill-sync.json` 換成範本格式（原本是 `source`／`targets`／`shared`）；ADR-025 補回的 `check-ai-structure.ps1` 專屬檢查一度被範本版覆蓋，已還原並改成 3.0.0，登記在 `.agents/harness/template-overrides.txt`（專案自己維護，範本升級時手動合併），見 ADR-027；3.0.0 結構檢查在 GitHub CI（Linux pwsh）上是否通過未驗證，推送前建議先在本機確認，推送後看 CI。
- R23–R25 在舊進度表只有頂層一列，細項（R23.1 等）是遷移時補的編號，內容照抄舊列。
- 2026-10-22 交接單的細節（R26 的驗證數字與失敗紀錄）封存在 `docs/legacy/current-status.md`；R26 已合併到 main（`02b2b3b`）。
- Codex 端沒有實測新的入口。
