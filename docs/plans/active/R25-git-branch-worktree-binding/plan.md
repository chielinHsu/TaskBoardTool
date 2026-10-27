---
id: R25
title: Git 分支／worktree 綁定、截止日期等
type: 功能
status: 規劃中
created: 2026-10-21
updated: 2026-10-27
depends_on: []
related: []
branch: 未定
---

# R25 — Git 分支／worktree 綁定、截止日期等

> 2.x 的需求進度表遷移而來（AI 結構 3.0.0，ADR-027、R27）；舊表只有頂層一列、沒有細項，內容照抄，細項編號由遷移時補上。

## 目標

決定是否做 Git 分支／worktree 綁定與截止日期等欄位（`AI_CONTEXT.md` 記為尚未實作；`docs/00-master-plan.md` 寫明目前不做截止日期、阻塞關係欄位與工作流欄位）。

## 範圍

- 先由使用者決定要不要做、做哪些。
- 決定做之後：展開細項、寫設計決策（ADR）、實作與驗證。

## 不做

- 沒有使用者決定之前，不實作。

## 細項

細項表是這個計畫進度的單一事實來源。完成的列不刪除。

| 編號 | 細項 | 狀態 | 分支／commit | 驗證 |
|---|---|---|---|---|
| R25.1 | Git 分支／worktree 綁定、截止日期等（AI_CONTEXT 記為尚未實作；是否要做待決定） | ⬜ |  |  |

圖例：✅ 完成　⏳ 進行中　⬜ 尚未開始　⚠️ 有未解決問題　⛔ 取消

## 決策

- 目前未實作也未排程；是否要做待使用者決定。

## 完成定義

- [ ] 使用者決定
- [ ] 決定做時：類型為「功能」，需四種輸出與 `perf.md`；測試與 `node scripts/ci/check.mjs` 通過

## Start prompt（開新 session 時貼上）

```
你正在 D:\CodexWork\TaskBoardTool 繼續專案。回覆一律使用繁體中文（zh-TW），完成時總結修改內容。
請先讀 AGENTS.md、docs/plans/INDEX.md，以及計畫 docs/plans/active/R25-git-branch-worktree-binding/ 的 plan.md 與 status.md，
只做 R25：處理 R25：Git 分支／worktree 綁定等功能，等使用者決定要不要做。
完成後更新該計畫的細項表、status.md、changelog.md（ai-handoff skill），
計畫層級的狀態改變時才改 INDEX.md，並依 project-rules.md 的 Git 規則提交。
```
