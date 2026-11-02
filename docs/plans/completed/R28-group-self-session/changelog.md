# R28 變更紀錄

> 只新增，新紀錄放最上方；格式見 `docs/plans/_template/changelog.md`。

## 2026-11-02 — Claude Code (Claude Opus 5.5)

### 細項
- R28.1–R28.3（見 `plan.md`）。

### 修改的檔案
- `outputs/taskboard/claude-mod/taskboard-pane/hooks/register.tsx`：`NO_OTHER_SESSIONS`、`connectorJson` 的 `empty` 參數、`readGroups` 讀 `get_session("self")`
- `outputs/taskboard/claude-mod/taskboard-pane/hooks/taskboard.test.ts`：群組 `cg-4` 只有本身、`SELF`
- `AI_CONTEXT.md`：群組同步一句補充

### 驗證
- `claude plugin validate`：Validation passed；`claude plugin test`：12 pass、0 fail。
- `node outputs/taskboard/setup-claude-mod.mjs --check --no-validate`：副本與來源一致。
- 真實 App 窗格的錯誤訊息消失：未確認。

### Commit
- 見 PR。
