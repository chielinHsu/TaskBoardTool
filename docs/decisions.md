# 設計決策索引（ADR）

> 一檔一決策：每個決策是 `docs/adr/NNN-slug.md`（範本 `docs/adr/_template.md`），本檔只是索引，新的放表格最上方。內容只寫在 ADR 檔，不要在這裡複製。
> 已記錄的決定，沒有新證據不推翻；要推翻就新增一筆，並在新舊兩筆都標明取代關係。
> ADR-001 至 ADR-024 原本內嵌在本檔，2026-10-21 導入 AI 結構 2.0.0 時原文搬到 `docs/adr/`（編號與內容不變，見 ADR-025）。

| 編號 | 標題 | 狀態 | 日期 |
|---|---|---|---|
| [ADR-027](adr/027-ai-structure-v3.md) | AI 結構 3.0.0：每個計畫一個資料夾（取代 ADR-025 的需求進度表與 changelog 部分） | 採用 | 2026-10-27 |
| [ADR-026](adr/026-pr-automerge-any-base.md) | PR 自動合併接受其他目標分支 | 採用 | 2026-10-15 |
| [ADR-025](adr/025-ai-structure-v2.md) | 導入 AI 結構 2.0.0（需求進度表、ADR 一檔一決策、總體計畫、SOLID 與四種輸出） | 採用 | 2026-10-21 |
| [ADR-024](adr/024-claude-card-project-from-app-group.md) | Claude 卡片專案＝App 側欄群組，無群組為「未分組」 | 採用 | 2026-10-14 |
| [ADR-023](adr/023-task-attachments.md) | 需求與後續需求的附件 | 採用 | 2026-10-14 |
| [ADR-022](adr/022-github-ai-pr-and-pages.md) | GitHub AI 自動 PR 與 Pages 展示 | 採用 | 2026-10-13 |
| [ADR-021](adr/021-claude-auto-permission-mode.md) | Claude 派工權限改用 Claude Code auto 模式 | 採用 | 2026-10-13 |
| [ADR-020](adr/020-mirror-card-title-follows-app.md) | 鏡像卡標題跟隨 Claude App 的 session 標題，看板手改後鎖定 | 採用 | 2026-10-13 |
| [ADR-019](adr/019-vendored-frontend-lib-by-hash.md) | 前端渲染函式庫由安裝腳本下載固定版本並以雜湊核對 | 採用 | 2026-10-12 |
| [ADR-018](adr/018-mirror-card-brief-seed-once.md) | 鏡像卡的需求簡介／驗收條件只從 session 第一句擬一次，手改後鎖定 | 採用 | 2026-10-12 |
| [ADR-017](adr/017-claude-app-mirror-runs.md) | Claude App 對話以鏡像 run 進入看板，而非排程派工 | 採用 | 2026-10-12 |
| [ADR-016](adr/016-queue-timestamp-monotonic.md) | 待辦排隊時間戳嚴格遞增 | 採用 | 2026-10-11 |
| [ADR-015](adr/015-claude-session-root-localcache.md) | Claude App session 目錄以套件 LocalCache 為優先候選 | 採用 | 2026-10-11 |
| [ADR-014](adr/014-global-claude-mod-install.md) | 看板 mod 安裝為全域 ~/.claude/mods 副本並以 CLAUDE_CODE_PLUGIN_DIRS 載入 | 採用 | 2026-10-11 |
| [ADR-013](adr/013-github-connector-snapshot-publish.md) | Git 認證缺失時使用 GitHub 連接器發布提交快照 | 採用 | 2026-10-11 |
| [ADR-012](adr/012-claude-app-snapshot-sync.md) | Claude App 安裝快照需明確同步 | 採用 | 2026-10-11 |
| [ADR-011](adr/011-project-candidates-folder-picker.md) | 專案候選與原生資料夾選擇，不遷移任務資料 | 採用 | 2026-10-11 |
| [ADR-010](adr/010-embedded-board-pointer-drag.md) | 嵌入看板的滑鼠拖曳 | 採用 | 2026-10-11 |
| [ADR-009](adr/009-codex-native-auto-review.md) | Codex 原生自動審核 | 採用 | 2026-10-11 |
| [ADR-008](adr/008-plan-import-dependencies.md) | 計畫匯入、有向依賴與完成後自動釋放 | 採用 | 2026-10-11 |
| [ADR-007](adr/007-http-keepalive-chunked.md) | 看板 HTTP 改用 keep-alive 與分段寫出 | 採用 | 2026-10-11 |
| [ADR-006](adr/006-shared-execution-interface-claude-adapter.md) | 共用執行介面與 Claude Code CLI adapter | 採用 | 2026-10-11 |
| [ADR-005](adr/005-right-properties-model-relations.md) | 右側屬性、執行模型與雙向相關議題 | 採用 | 2026-10-10 |
| [ADR-004](adr/004-task-brief-runs-sessions.md) | 任務承載簡介、逐次回報與多個 session | 採用（屬性版面由 ADR-005 取代） | 2026-10-10 |
| [ADR-003](adr/003-readonly-session-projection.md) | 既有 session 的唯讀同步投影 | 採用 | 2026-10-10 |
| [ADR-002](adr/002-shared-ai-skeleton.md) | 完整共用骨架 | 採用 | 2026-10-10 |
| [ADR-001](adr/001-desktop-launcher-theme-bridge.md) | 桌面啟動器與主題 bridge | 採用 | 2026-10-10 |
