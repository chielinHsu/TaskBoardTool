# R29 變更紀錄

> 只新增，新紀錄放最上方；格式見 `docs/plans/_template/changelog.md`。

## 2026-11-02（重啟驗證）— Claude Code (Claude Opus 5.5)

### 細項
- R29.1：真實服務驗證。

### 修改的檔案
- `status.md`、`changelog.md`（本計畫）、`.ai/handoff.md`

### 驗證
- PR #12 合併後切回 main 並 pull（`94da203`），確認 `activeId` 為空、進行中只有鏡像卡，再以 `stop.ps1`、`start.ps1 -NoBrowser` 重啟看板服務。
- `/api/state`：`claudeChats` 433 筆，`sessionRoot` 為 Claude-Data 路徑，`claudeSync.error` 為空。VERIFIED。

### Commit
- 見 PR。

## 2026-11-02 — Claude Code (Claude Opus 5.5)

### 細項
- R29.1–R29.3（見 `plan.md`）。

### 修改的檔案
- `outputs/taskboard/claude_sessions.py`：`desktop_root_candidates()`、模組說明
- `tests/test_taskboard_sessions.py`：`test_claude_data_folder_wins_after_the_app_moves_out_of_the_package`
- `AI_CONTEXT.md`、`docs/architecture.md`、`docs/user-guide.md`（兩者補修改紀錄表）、`outputs/taskboard/README.md`

### 驗證
- `scripts/ci/check.mjs`（PYTHON_BIN 指向 Python 3.9）exit 0，Python 85 項 OK。
- 本機唯讀：`ClaudeSessionIndex()` 解析到 `%LOCALAPPDATA%\Claude-Data\claude_pzs8sxrjxfjjc\claude-code-sessions`，列出 433 筆。
- 看板服務重啟後的窗格畫面：未確認。

### Commit
- 見 PR。
