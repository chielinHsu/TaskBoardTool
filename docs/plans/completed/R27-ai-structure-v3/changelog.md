# R27 變更紀錄

> 只新增，新紀錄放最上方；格式見 `docs/plans/_template/changelog.md`。

## 2026-10-27 — Claude Code (Claude Sonnet 5.5)

### 細項
- R27.1–R27.3：AI 結構 3.0.0 遷移（見 `plan.md`）。

### 修改的檔案
- 範本管理：`engineering-workflow.md`、`TEMPLATE_VERSION`、`ai-handoff` skill（與 `.claude/skills/` 鏡像）、`sync-skills.ps1`、`migrate-ai-structure-3.mjs`、`docs/plans/_template/`、`docs/steps/_template/`
- 專案擁有：`scripts/ai/check-ai-structure.ps1`（遷移時一度被範本版覆蓋，後來還原專案版並改成 3.0.0，登記在 `.agents/harness/template-overrides.txt`；見 ADR-027）、`.agents/harness/skill-sync.json`（換成範本的欄位格式，見 ADR-027）、入口與規則文字、`docs/current-status.md`、`docs/plans/`、`.ai/handoff.md`

### 驗證
- 見最終回報與 `.ai/handoff.md`。

### Commit
- 未提交（由主 session 查核後提交）
