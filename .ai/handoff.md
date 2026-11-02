# 交接（2026-11-02）：Claude session 路徑與 App 群組讀取修正

> 覆寫式交接單：每次收工整份重寫，保持在 60 行內。計畫的進度與接續資訊在各計畫的 `status.md`（入口 `docs/plans/INDEX.md`），這裡不重抄；2.x 的紀錄在 `docs/legacy/`。

- 最後一位 agent：Claude Code (Claude Opus 5.5)
- 日期：2026-11-02

## 上一個 session 動到的計畫

- R29（已完成）：[`docs/plans/completed/R29-claude-data-root/`](../docs/plans/completed/R29-claude-data-root/plan.md)。Store 版 Claude App 10/20 把資料搬到 `%LOCALAPPDATA%\Claude-Data\claude_*\`，`claude_sessions.py` 的候選路徑補上它；看板服務要重啟才生效。
- R28（已完成）：[`docs/plans/completed/R28-group-self-session/`](../docs/plans/completed/R28-group-self-session/plan.md)。taskboard-pane mod 的群組讀取：`list_sessions` 不含發問的 session，只有本身的群組回文字而非 JSON；改成視為空清單，並以 `get_session("self")` 補上本身的群組。

## 接下來

- 沒有進行中的實作；R23–R25 都在等使用者決定或人工操作：[R23 受阻](../docs/plans/active/R23-details-test-baseline-failure/status.md)、[R24](../docs/plans/active/R24-verification-gaps/status.md)、[R25](../docs/plans/active/R25-git-branch-worktree-binding/status.md)。
- 跨計畫的已知問題與待使用者決定見 [`docs/current-status.md`](../docs/current-status.md)。

## 不要動

- 真實任務、SQLite、session、認證、官方 App；不提交 `work/`、`vendor/`、`.data/`。
- 範本管理的檔案不要在專案裡改：`engineering-workflow.md`、`TEMPLATE_VERSION`、`.agents/skills/ai-handoff/`、`sync-skills.ps1`、`migrate-ai-structure-3.mjs`、`tools/ste-lint.mjs`、各 `_template`。
- `docs/legacy/` 只讀；`docs/adr/` 的 ADR-001 至 ADR-027 不改，新決策從 028 接續。

## 未提交的變更

- 無（`fix/group-self-session`、`fix/claude-data-root` 經 PR 合併）。

## 假設與未驗證項目

- R28：使用者截圖確認窗格的群組錯誤已消失。
- 本機 `python` 是失效的 Store alias；CI 檢查以 `PYTHON_BIN` 指向 `%LOCALAPPDATA%\Programs\Python\Python39\python.exe` 執行。
- R29：正在執行的看板服務是舊程式碼，重啟後「Claude Code N」的畫面未確認。
