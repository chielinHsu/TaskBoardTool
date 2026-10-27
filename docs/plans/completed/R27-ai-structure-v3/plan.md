---
id: R27
title: AI 結構 3.0.0：每個計畫一個資料夾
type: 雜項
status: 完成
created: 2026-10-27
updated: 2026-10-27
depends_on: [R26]
related: []
branch: docs/ai-structure-v3
---

# R27 — AI 結構 3.0.0：每個計畫一個資料夾

## 目標

依使用者 2026-10-27 的要求，把全域的需求進度表與 AI 工作紀錄改成每個計畫一個資料夾，不同計畫的紀錄分開維護。決策：[ADR-027](../../../adr/027-ai-structure-v3.md)。

## 範圍

- 範本管理的檔案換成 3.0.0、`migrate-ai-structure-3.mjs`、專案擁有的規則文字、未完成需求拆成計畫。

## 不做

- 把 2.x 的歷史紀錄拆進各計畫（原樣封存在 `docs/legacy/`）。
- 修改程式原始碼。

## 細項

| 編號 | 細項 | 狀態 | 分支／commit | 驗證 |
|---|---|---|---|---|
| R27.1 | 範本管理的檔案換成 3.0.0（`New-AiProject.ps1 -Refresh`）；`skill-sync.json` 改成範本的欄位格式；`migrate-ai-structure-3.mjs` 搬舊紀錄到 `docs/legacy/`、改寫連結與 14 行範本原句 | ✅ | `docs/ai-structure-v3`（未提交） | 腳本輸出；結構檢查 |
| R27.2 | 未完成的 R23–R25 拆成 `docs/plans/active/` 的計畫，`INDEX.md` | ✅ | 同上 | 同上 |
| R27.3 | 專案擁有的規則文字改寫；新的 `current-status.md`、ADR-027、交接單 | ✅ | 同上 | 同上 |

圖例：✅ 完成　⏳ 進行中　⬜ 尚未開始　⚠️ 有未解決問題　⛔ 取消

## 完成定義

- [x] `check-ai-structure.ps1`、`sync-skills.ps1 -Check`、`check-model-routing.mjs` 結果見 changelog.md
- [x] `git grep` 只剩 `docs/legacy/`、歷史 ADR 與說明遷移的句子提到 2.x 的做法
