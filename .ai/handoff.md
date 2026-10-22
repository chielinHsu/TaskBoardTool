# 交接（2026-10-21）：導入 AI 結構 2.0.0

> 覆寫式交接單；歷史在 `docs/changelog-ai.md`。進度的單一事實來源是 `docs/current-status.md` 的需求進度表。

- 最後一位 agent：Claude Code (Sonnet 5.5)
- 日期：2026-10-21，分支 `docs/ai-structure-v2`（worktree，基於 main `01518e4`）

## 正在做

導入 AI 結構 2.0.0（進度表 R22）。文件與檢查腳本已完成並通過本機檢查，已在分支 `docs/ai-structure-v2` 本機提交；未推送、未開 PR（使用者決定本機提交不推送，開 PR 由使用者決定）。

## 已完成

- 入口：`AGENTS.md` bootloader（四條規則）、`CLAUDE.md`、`project-rules.md`（SOLID、四種輸出、Step Protocol、Git、Commit 訊息）。
- `docs/decisions.md` 拆成 `docs/adr/` 24 檔加索引，新增 ADR-025；新增 `docs/00-master-plan.md`、`docs/plan/`、`docs/steps/_template/`、`tools/ste-lint.mjs`。
- `docs/current-status.md` 開頭為需求進度表（R01–R25）與待使用者決定。
- `check-ai-structure.ps1` 換成 2.0.0 並補回專案檢查、修 Linux 根目錄解析。

## 驗證

- VERIFIED：`sync-skills.ps1`／`-Check`、`check-ai-structure.ps1 -Strict`（0 失敗、1 警告）、`check-model-routing.mjs` 74/74、`ste-lint` 0 errors。
- NOT VERIFIED：Linux pwsh 實際執行；Codex／Claude 實際載入；`scripts/ci/check.mjs` 全套（未改程式，未跑）。

## 下一步

1. 使用者決定是否推送並開 PR；開 PR 後 CI 的 `verify` job 會在 ubuntu 與 windows 跑結構檢查，留意結果（Linux 尚未驗證）。
2. 使用者決定進度表 R23–R25（baseline 失敗測試、驗證缺口、Git 綁定）。

## 相關檔案

`AGENTS.md`、`CLAUDE.md`、`AI_CONTEXT.md`、`MODEL_ROUTING.md`、`.agents/harness/*`、`.claude/agents/architect*.md`、`scripts/ai/check-ai-structure.ps1`、`docs/00-master-plan.md`、`docs/current-status.md`、`docs/decisions.md`、`docs/adr/`、`docs/plan/`、`docs/steps/_template/`、`tools/ste-lint.mjs`。

## 不要動

真實任務資料（`.data`、SQLite、profile、token）、官方 App 安裝檔；`sync-skills.ps1`／`skill-sync.json` 是專案舊格式，不要換成範本版（不相容）；`check-ai-structure.ps1` 刷新範本後要重新補回專案檢查（見 ADR-025）。

## 已知問題

- `docs/current-status.md` 337 行，超過檢查的 150 行建議值（只是警告）；舊狀態段落保留。
- `tests/taskboard-details.test.mjs` 第 33 行 baseline 失敗（2026-10-14 記錄，未重跑）。

## 未提交變更／假設

- 無（本次修改已提交）。`D:\CodexWork\TaskBoardTool` 主 checkout 有他人未提交的 `.ai/handoff.md`、`.github/workflows/*` 修改，本次未碰，合併時要避開（本檔會與主 checkout 未提交的 handoff 衝突）。
- 假設：`Co-Authored-By` 在 Codex 提交沿用先例寫 `Codex`（見 `896470a`）。
