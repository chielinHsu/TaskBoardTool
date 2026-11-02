---
id: R28
title: App 群組讀取遇到只有本身的群組時失敗
type: 修正
status: 完成
created: 2026-11-02
updated: 2026-11-02
depends_on: []
related: []
branch: fix/group-self-session
---

# R28 — App 群組讀取遇到只有本身的群組時失敗

## 目標

窗格不再顯示「App 群組讀取失敗：list_sessions 回傳的不是 JSON：No other sessions found in group …」，所有 Claude 卡片（含執行 mod 的 session 本身）都能拿到正確的群組名。

## 範圍

- `ccd_session_mgmt.list_sessions` 不列出發問的 session；群組只有本身時回一段文字而不是 `[]`，mod 把它當成整次讀取失敗。改成視為空清單。
- 同一原因，發問的 session 本身從未出現在對照表裡，各 session 的 mod 輪流送出時，這張卡會在群組與「未分組」之間跳動。改用 `get_session("self")` 補上本身的群組。

## 不做

- 不改看板服務 `server.py` 的 `/api/claude-groups` 契約。

## 細項

| 編號 | 細項 | 狀態 | 分支／commit | 驗證 |
|---|---|---|---|---|
| R28.1 | `register.tsx` 的 `connectorJson` 接受「No other sessions found」為空清單；`readGroups` 以 `get_session("self")` 加入本身的群組並去重 | ✅ | `fix/group-self-session` | VERIFIED：`claude plugin validate`／`claude plugin test` 12 pass |
| R28.2 | `taskboard.test.ts` 模擬只有本身的群組與 `get_session("self")` | ✅ | `fix/group-self-session` | 同上 |
| R28.3 | `setup-claude-mod.mjs` 同步全域副本 | ✅ | — | `--check`：副本與來源一致（6 個檔案） |

圖例：✅ 完成　⏳ 進行中　⬜ 尚未開始　⚠️ 有未解決問題　⛔ 取消

## 決策

- `get_session("self")` 回傳的 `sessionId`（`local_…`）與 `group` 欄位格式和 `list_sessions` 的列相同（本機 App 實測）；讀取失敗會讓整次讀取送 `{error}`，不會送出少了本身的對照表。

## 完成定義

- [x] `claude plugin validate`、`claude plugin test` 通過
- [x] 細項表全部 ✅；`status.md`、`changelog.md` 已更新
- [x] 資料夾在 `docs/plans/completed/`，`INDEX.md` 已更新
