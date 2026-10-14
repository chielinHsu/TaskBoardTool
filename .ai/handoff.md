# 交接（2026-10-14）：窗格下拉選單收起、Claude 卡片「未分組」

## 正在做
修正完成，未 commit／push（使用者本次要求不擅自提交）。全域 mod 副本已同步；正式服務未重啟。

## 已完成
- 窗格：snapshot 只在內容改變時寫入；新增表單開著時延後（核准／連線例外），收起或重新整理即套用。
- 群組同步：list_groups＋逐群組 list_sessions（一次讀全部過大被換成存檔說明，ADR-024）；錯誤送 `{error}`，無連接器的 session 不送，每回合同步。
- 綁定 Claude App session 的卡片專案＝群組名或「未分組」，`projectSource` app／manual，舊卡自動跟隨；計畫匯入 Claude 事項無專案為「未分組」；API 1.11.0。
- import_plan 工具回傳改為字串（舊格式被引擎拒絕）。

## 驗證
- VERIFIED：Python 84、mod validate＋test 12/12、CI check、隔離服務網頁、真實 App 讀到 39 群組／200 sessions、正式服務收到群組 200。
- NOT VERIFIED：真實 App 窗格下拉選單停留 10 秒（需使用者操作）；正式服務重啟後的舊卡跟隨（試算 52 張改、0 手動）；projects DOM 測試（需專用 Codex App）。
- 既有失敗：taskboard-details.test.mjs:33（baseline，未處理）。

## 下一步
1. 使用者實測窗格下拉選單。
2. 授權後 commit／PR／合併，主 checkout pull，確認無派工後以 stop.ps1＋start.ps1 -NoBrowser 重啟正式服務，檢查卡片專案。

## 相關檔案
claude-mod/taskboard-pane/hooks/register.tsx、taskboard.test.ts、types/index.d.ts、server.py、session_sync.py、index.html、tests/test_taskboard_{mirror,groups,plans,tools}.py、tests/taskboard-sessions-app.test.mjs。

## 不要動
真實卡片除自動跟隨外不手動改；SQLite、session、認證、官方 App；不提交 work/、vendor/、.data/。

## 未提交變更／假設
worktree 分支 claude/epic-raman-a7ff6b 上 16 個檔案未提交。全域 mod 已是新版（含舊伺服器相容：`{error}` 在 1.10.0 回 400 並被忽略）。
單一群組超過約 200 個 session 時 list_sessions 結果可能再過大，會以錯誤顯示。
