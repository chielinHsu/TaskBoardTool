---
id: R24
title: 補驗證缺口（人工或授權）
type: 雜項
status: 規劃中
created: 2026-10-21
updated: 2026-10-27
depends_on: []
related: [R18, R21]
branch: 未定
---

# R24 — 補驗證缺口（人工或授權）

> 2.x 的需求進度表遷移而來（AI 結構 3.0.0，ADR-027、R27）；舊表只有頂層一列、沒有細項，內容照抄，細項編號由遷移時補上。

## 目標

補上先前標 NOT VERIFIED 的驗證缺口：窗格下拉選單停留 10 秒、實際重開機後自動啟動、Claude 核准往返、Claude 角色與 hook 實際的 model／effort。需要人工操作或授權。

## 範圍

- 窗格下拉選單（既有專案、負責模型）打開後停留 10 秒以上不收起（真實 Claude App 窗格）。
- 實際重開機後看板自動啟動。
- Claude 核准往返。
- Claude 角色與 hook 實際的 model／effort。

## 不做

- 不改程式；發現問題另開計畫。

## 細項

細項表是這個計畫進度的單一事實來源。完成的列不刪除。

| 編號 | 細項 | 狀態 | 分支／commit | 驗證 |
|---|---|---|---|---|
| R24.1 | 補驗證缺口：窗格下拉選單停留 10 秒、實際重開機後自動啟動、Claude 核准往返、Claude 角色／hook 實際 model／effort | ⬜ |  | NOT VERIFIED（需人工或授權） |

圖例：✅ 完成　⏳ 進行中　⬜ 尚未開始　⚠️ 有未解決問題　⛔ 取消

## 決策

- 哪些缺口要排人工驗收，待使用者決定（`docs/00-master-plan.md` 風險表第 5 項）。

## 完成定義

- [ ] 使用者決定要驗收哪些項目
- [ ] 每項結果記在 `changelog.md`（VERIFIED、PARTIALLY VERIFIED 或 NOT VERIFIED）

## Start prompt（開新 session 時貼上）

```
你正在 D:\CodexWork\TaskBoardTool 繼續專案。回覆一律使用繁體中文（zh-TW），完成時總結修改內容。
請先讀 AGENTS.md、docs/plans/INDEX.md，以及計畫 docs/plans/active/R24-verification-gaps/ 的 plan.md 與 status.md，
只做 R24：處理 R24：補驗證缺口的逐項檢查清單，需要使用者人工操作或授權。
完成後更新該計畫的細項表、status.md、changelog.md（ai-handoff skill），
計畫層級的狀態改變時才改 INDEX.md，並依 project-rules.md 的 Git 規則提交。
```
