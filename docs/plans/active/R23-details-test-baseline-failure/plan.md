---
id: R23
title: taskboard-details 測試第 33 行 baseline 失敗
type: 修正
status: 受阻
created: 2026-10-14
updated: 2026-10-27
depends_on: []
related: [R18]
branch: 未定
---

# R23 — taskboard-details 測試第 33 行 baseline 失敗

> 2.x 的需求進度表遷移而來（AI 結構 3.0.0，ADR-027、R27）；舊表只有頂層一列、沒有細項，內容照抄，細項編號由遷移時補上。

## 目標

2026-10-14 記錄 `tests/taskboard-details.test.mjs` 第 33 行（`detail.editor` 斷言）在未修改的 baseline（git stash）就失敗，之後沒有處理，也沒有重跑確認是否仍失敗。要先確認現況，再決定是否修。

## 範圍

- 重跑 `node tests/taskboard-details.test.mjs` 確認是否仍失敗。
- 仍失敗時：找出根因並修正，補回歸保護。

## 不做

- 沒有使用者決定之前，不改測試或產品程式。

## 細項

細項表是這個計畫進度的單一事實來源。完成的列不刪除。

| 編號 | 細項 | 狀態 | 分支／commit | 驗證 |
|---|---|---|---|---|
| R23.1 | `tests/taskboard-details.test.mjs` 第 33 行 baseline 失敗（2026-10-14 記錄，之後未見處理） | ⚠️ |  | NOT VERIFIED（是否仍失敗未重跑） |

圖例：✅ 完成　⏳ 進行中　⬜ 尚未開始　⚠️ 有未解決問題　⛔ 取消

## 決策

- 2026-10-14 的紀錄：`detail.editor` 斷言失敗，未修改的 baseline（git stash）同樣失敗，屬既有問題；2026-10-22 的交接單寫「本次未重跑桌面 DOM 測試」。是否先修待使用者決定。

## 完成定義

- [ ] 使用者決定是否處理
- [ ] 重跑結果已記錄（仍失敗或已通過）
- [ ] 修正時：`node scripts/ci/check.mjs` 與該測試通過

## Start prompt（開新 session 時貼上）

```
你正在 D:\CodexWork\TaskBoardTool 繼續專案。回覆一律使用繁體中文（zh-TW），完成時總結修改內容。
請先讀 AGENTS.md、docs/plans/INDEX.md，以及計畫 docs/plans/active/R23-details-test-baseline-failure/ 的 plan.md 與 status.md，
只做 R23：處理 R23：重跑 taskboard-details.test.mjs 並確認第 33 行是否仍失敗，等使用者決定是否修正。
完成後更新該計畫的細項表、status.md、changelog.md（ai-handoff skill），
計畫層級的狀態改變時才改 INDEX.md，並依 project-rules.md 的 Git 規則提交。
```
