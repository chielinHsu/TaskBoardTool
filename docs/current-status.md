# 目前狀態（專案層級）

> 原地修改，保持精簡。只寫**整個專案**的快照：階段、跨計畫的已知問題與待使用者決定。
> 各計畫的細項、進度與變更紀錄在自己的資料夾，入口是 [`plans/INDEX.md`](plans/INDEX.md)；不要把計畫的細節寫進本檔（規則見 `.agents/harness/engineering-workflow.md`「計畫分開管理」）。
> 3.0.0 之前的需求進度表與目前狀態封存在 [legacy/current-status.md](legacy/current-status.md)（只讀）。

- 更新日期：2026-10-27
- 階段：功能開發與維護中。main 包含 R01–R26（最近是 R26「PR 自動合併支援其他目標分支」，`02b2b3b`）；2026-10-27 AI 結構升級到 3.0.0（R27，本次修改未提交、未推送）。沒有進行中的實作，未完成的 R23–R25 都在等使用者決定或人工操作。

## 計畫

- 所有計畫與狀態：[`plans/INDEX.md`](plans/INDEX.md)。
- 目前都不是實作中：R23 受阻（`taskboard-details` 測試失敗，等使用者決定是否修）、R24 需要人工或授權、R25 等使用者決定要不要做。

## 跨計畫的已知問題

- 真實 GitHub 多目標 CI／模型審查／合併 NOT VERIFIED（R26 的實作只在腳本與 Actionlint 驗證）；舊分支的 CI 要包含新版 workflow 才會對非 main 目標觸發。
- Claude control 協定與 transcript 格式是內部格式，依本機 CLI 2.1.283 實測，版本更新可能失效；Codex App 大改版可能使 DOM／CSS 選擇器與 CDP 注入失效；`server.py`、`index.html` 單檔過大（`docs/00-master-plan.md` 第 8 節）。
- 本機 `python` 可能是失效的 Store alias，測試用 `py -3`（見 `AI_CONTEXT.md`）；`tests/taskboard-projects.test.mjs` 需要專用 Codex App profile，在 worktree 沒有 `.data/app-integration.json` 時未執行。
- 2026-10-14 的紀錄：正式服務當時仍為 1.10.0，伺服器端「未分組」與舊卡跟隨待重啟後生效；之後是否已重啟沒有紀錄。
- 先前 squash 合併時作者信箱被換成 GitHub noreply（`gh pr merge --author-email` 未生效），原因（信箱未驗證或隱藏信箱設定）仍待查；rebase 合併可保留提交者信箱。
- ADR-025 補回的 `check-ai-structure.ps1` 專屬檢查已還原並改成 3.0.0，登記在 `.agents/harness/template-overrides.txt`（見 ADR-027）；3.0.0 結構檢查在 GitHub CI（Linux pwsh）上是否通過未驗證。

## 待使用者決定（跨計畫）

- R26 的後續：PR 合併後，用小 PR 驗收非 main 目標（例如 develop）的 CI 與自動合併；其他分支的 protection／ruleset 要不要設定。
- ADR-024 的伺服器端規則與舊卡跟隨：正式服務是否已重啟，需確認。
- 屬於單一計畫的決定放在各計畫的 `status.md`：R23（是否先修失敗的測試）、R24（哪些驗證缺口排人工驗收）、R25（Git 綁定要不要做）。
