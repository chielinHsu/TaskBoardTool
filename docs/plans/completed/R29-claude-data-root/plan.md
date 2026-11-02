---
id: R29
title: Claude App 資料搬到 Claude-Data 後找不到 session
type: 修正
status: 完成
created: 2026-11-02
updated: 2026-11-02
depends_on: []
related: [R28]
branch: fix/claude-data-root
---

# R29 — Claude App 資料搬到 Claude-Data 後找不到 session

## 目標

窗格與看板的「同步 session：Claude Code N」恢復正確數字，依 Claude session 清單運作的功能（標題跟隨、倒回改綁、唯讀追蹤卡的群組專案、session 標題）恢復。

## 範圍

- Store 版 Claude App 在 2026-10-20 把資料從套件 `LocalCache\Roaming\Claude\` 搬到 `%LOCALAPPDATA%\Claude-Data\claude_pzs8sxrjxfjjc\`，舊位置只留 `.user-data-left.claude_pzs8sxrjxfjjc` 標記檔；`desktop_root_candidates()` 沒有這個位置，清單一直是空的。
- 候選路徑最前面加入 `%LOCALAPPDATA%\Claude-Data\claude_*\claude-code-sessions`，舊的兩處保留為備援。

## 不做

- 不重啟正在執行的看板服務（需使用者當次授權）。

## 細項

| 編號 | 細項 | 狀態 | 分支／commit | 驗證 |
|---|---|---|---|---|
| R29.1 | `claude_sessions.py` 的 `desktop_root_candidates()` 加入 Claude-Data，順序 Claude-Data → 套件 → Roaming | ✅ | `fix/claude-data-root` | VERIFIED：本機唯讀實讀找到 Claude-Data，列出 433 個未封存 session |
| R29.2 | `test_taskboard_sessions.py` 新增搬遷後的測試（含未重啟的索引重新探測） | ✅ | `fix/claude-data-root` | VERIFIED：`scripts/ci/check.mjs` exit 0，Python 85 項 OK |
| R29.3 | `AI_CONTEXT.md`、`architecture.md`、`user-guide.md`、`outputs/taskboard/README.md` 路徑說明 | ✅ | `fix/claude-data-root` | — |

圖例：✅ 完成　⏳ 進行中　⬜ 尚未開始　⚠️ 有未解決問題　⛔ 取消

## 決策

- 新位置放在最前：兩處同時存在時，套件內的是搬遷前留下的舊資料。
- 未找到時 `desktop_available` 每次重新探測（既有行為），但正在執行的服務跑的是舊程式碼，要重啟服務才會讀新位置。

## 完成定義

- [x] `scripts/ci/check.mjs` 通過
- [x] 細項表全部 ✅；`status.md`、`changelog.md` 已更新
- [x] 資料夾在 `docs/plans/completed/`，`INDEX.md` 已更新
