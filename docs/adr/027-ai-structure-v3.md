# ADR-027：AI 結構 3.0.0：每個計畫一個資料夾（2026-10-27）

- 日期：2026-10-27
- 決定者：使用者（要求依 ChatGPT「架構分類建議」調整，各計畫的紀錄分開）；Claude Code (Claude Sonnet 5.5) 套用
- 狀態：採用；取代 [ADR-025](025-ai-structure-v2.md) 裡「需求進度表與 `docs/changelog-ai.md`」的部分，其餘照舊

## 背景

2.0.0 把所有需求的進度放在 `docs/current-status.md` 開頭的一張表（R01–R26，約 350 行，另有日期段落）、所有 session 的紀錄放在 `docs/changelog-ai.md`（325 行）。需求一多，兩份檔案越來越長，不同需求的紀錄混在一起，難維護也難找。使用者 2026-10-27 要求：一個計畫拆成細項時記錄在自己的地方，另一個計畫的紀錄要分開。

ADR-025 保留了舊格式的 `skill-sync.json`（`source`／`targets`／`shared`）與專案版的 `check-ai-structure.ps1`（補回的專屬檢查）。3.0.0 的範本管理的 `sync-skills.ps1` 讀 `sourceDirectory`／`targetDirectory`，舊格式的 manifest 會讓它失敗；`check-ai-structure.ps1` 本來也是範本管理的檔案，遷移時被 `-Refresh` 蓋成範本版。

## 決定

套用範本 3.0.0（`ai-project-template/README.md`「計畫分開管理」）：

- `docs/plans/INDEX.md` 是計畫索引；每個計畫一個資料夾 `docs/plans/<active|completed|cancelled>/<ID>-<slug>/`：`plan.md`（細項表是單一事實來源）、`status.md`（現況快照）、`changelog.md`（只記這個計畫）、選用的 `tasks/`。
- `docs/current-status.md` 只放專案層級的快照（階段、跨計畫的已知問題與待使用者決定）。
- 2.x 的 `current-status.md`（含需求進度表與日期段落）、`changelog-ai.md` 原樣封存在 `docs/legacy/`（只讀）；未完成的 R23–R25 拆成計畫，編號照舊；這次遷移本身是 R27。
- `.agents/harness/skill-sync.json` 換成範本的格式；`sync-skills.ps1` 用範本管理的 3.0.0 版；`check-ai-structure.ps1` 保留專案版並改成 3.0.0（見「後果」），登記在 `.agents/harness/template-overrides.txt`。
- `AGENTS.md` 的「Codex 專屬」一節、`CODEX.md`、`project-rules.md` 的 Git 與 Commit 訊息規定（Codex 不讀上層 `D:\CodexWork\CLAUDE.md`）照舊。

## 否決的替代方案

- 把 2.x 的歷史紀錄拆進各計畫：R01–R22、R26 都已完成，拆開只增加工作量、不增加可追蹤性；封存一份就好。
- 保留舊格式的 `skill-sync.json` 並改 `sync-skills.ps1`：範本管理的檔案不應在專案裡改；改 manifest 只動一個專案擁有的小檔案。

## 後果

- 開工時先在 `INDEX.md` 找到計畫，只讀那個計畫的 `plan.md` 與 `status.md`；收工時只更新那個計畫（`ai-handoff` skill）。
- `check-ai-structure.ps1` 會擋下索引與資料夾不一致、搬動後斷掉的連結。
- ADR-025 補回的專屬檢查（git work tree 檢查、`.claude/settings.json` 不得 bypassPermissions 且 deny `git add .`／`git add -A`、agent frontmatter 名稱、`.gitignore` 樣式、文件 UTF-8 無 U+FFFD、`bench-model-routing.mjs` 與 `.claude/skills` 為必要檔案）隨 `-Refresh` 一度被範本版覆蓋；已從 `HEAD` 還原專案版並改成 3.0.0（版本主版本 3、required files、`docs/plans/INDEX.md` 與計畫資料夾的一致性檢查取代需求進度表檢查、`current-status.md` 上限 80 行），登記在 `.agents/harness/template-overrides.txt`：`New-AiProject.ps1 -Refresh` 不覆蓋列在那裡的檔案，範本升級時要手動比對合併。專案版沿用 `Split-Path` 解析根目錄（CI 在 Linux 的 pwsh 跑 `check-ai-structure.ps1 -Strict`）；hook 維持 `node "$CLAUDE_PROJECT_DIR/..."` 的寫法（`check-model-routing.mjs` 要求），所以不檢查大括號形式。
- 這次修改沒有在 GitHub CI 上實跑；CI 的 `check-ai-structure.ps1 -Strict` 在 Linux 是否通過未驗證。
