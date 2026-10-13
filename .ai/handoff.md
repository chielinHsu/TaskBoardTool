# 交接（2026-10-13）：鏡像卡標題去掉 `<system-reminder>`，並跟隨 Claude App session 標題

## 正在做
使用者問為何鏡像卡標題是 `<system-reminder>`、在 Claude App 改名後卡片會怎樣，同意改為「標題來源狀態」。已實作、驗證並 commit（使用者授權）；正式 47824 服務已重啟為 1.9.0。

## 本輪已完成
- 根因：worktree／未選資料夾的 session，App 在首句前插一個 `<system-reminder>` 文字區塊（本機 15 個 session）；App 的 `local_*.json` `title` 在首回合結束後才產生，`turn.start` 建卡時退回首句第一行；舊規則（ADR-018）start／complete 不改標題，App 改名不同步。
- claude_sessions.py：`strip_reminders()` 只去掉開頭完整的 `<system-reminder>…</system-reminder>`；`_parse_tail` 使用者回合套用（只剩提醒的回合略過）。
- server.py：`app_title()`（與 session id 相同代表未命名）、`first_line()`、`Board.follow_app_title()`、`Board.legacy_title_source()`；`mirror_turn` 的 text 去提示、建卡 `titleSource` = app／seed、每個 start／complete 跟隨；`claude_list` 同步後對 `sourceTool=claude` 的卡跟隨；`update` 改標題 → manual。API 1.9.0。
- 測試：test_taskboard_mirror.py 新增 3 項（去提示＋跟隨＋App 改名經同步＋手改鎖定；舊卡三種判定；transcript 只去開頭提醒）；plans／tools／sessions-app 版本斷言 1.9.0。
- 文件：ADR-020（取代 ADR-018 的標題部分）、architecture 流程圖、AI_CONTEXT、current-status、changelog-ai。

## 驗證
- VERIFIED：`py -3 -m py_compile` server.py／claude_sessions.py；Python 70 測試；Node details／drag／projects（PATH 前置 `/c/Users/Caspar.Hsu/AppData/Local/Programs/Python/Python39`）；scratchpad 腳本以隔離 DB 讀真實 Claude session 索引（唯讀），6c527b01／b153962e／88fd7583 首回合標題為真實需求第一行，`claude_list` 後變 App 標題。
- VERIFIED：正式服務已重啟為 1.9.0（使用者授權，stop.ps1＋start.ps1 -NoBrowser 絕對路徑，主 checkout、同一資料庫）：重啟後已有回合事件的鏡像卡 0fcf4c、97c1ac、37970a、f8578d 為 titleSource=app 且標題等於 App 標題；ad11df 仍是 `<system-reminder>`，等該 session（AlgoParamFineTune）下一個回合。`taskboard-sessions-app.test.mjs` 重跑：版本 1.9.0、模型清單、frame 重新載入、同步卡片與聊天紀錄皆通過，最後「卡片未改變」的 deepEqual 失敗，差異只在 `sessionStatus`（活躍 session 的訊號時間與標籤在測試期間變動，為衍生欄位），屬測試對活躍 session 的既有脆弱性。
- NOT VERIFIED：真實 App 改名端到端；ad11df 改名；mod 未改，不需同步。
- 實際失敗：Python `write_text` 把 server.py 寫成 CRLF，已還原 LF；`taskboard-sessions-app.test.mjs` 打正式舊服務（版本 1.8.0、活躍 session 訊號時間變動）失敗，與修改無關，重啟後重跑。

## 下一步
1. 讓 `taskboard-sessions-app.test.mjs` 比對卡片時排除衍生的 `sessionStatus`（目前活躍 session 會讓它失敗）。
2. 在 Claude App 改一個 session 名稱，約 15 秒後確認卡片標題跟著變；在看板改標題後再於 App 改名，確認不覆寫。
3. （已修正，見下方 8bfb6c9）App 開著時服務重啟後 frame RPC 無回應。

## 相關檔案
outputs/taskboard/server.py、outputs/taskboard/claude_sessions.py、tests/test_taskboard_mirror.py、tests/test_taskboard_plans.py、tests/test_taskboard_tools.py、tests/taskboard-sessions-app.test.mjs、AI_CONTEXT.md、docs/decisions.md、docs/architecture.md、docs/current-status.md、docs/changelog-ai.md、.ai/handoff.md。

## 不要動
真實 .data／profile／認證；正式 47824 服務與專用 App 除非使用者要求；不提交 vendor/；stage 明列路徑，禁止 git add .／-A。

## 未提交變更
標題修正已 commit（只 stage 本輪 hunk）。仍未提交、屬另一個 session：index.html 心智圖；`TASKBOARD_DISPATCHED`（claude_adapter.py、mod register.tsx／taskboard.test.ts、server.py 遲到 board-run 判斷、test_taskboard_mirror.py 對應測試）及其文件段落。

## 假設與未驗證事項
App 改名寫入 `local_*.json` 的 `title`：本機 35 個 session 為 `titleSource: 'user'`，推定是手動改名；本輪未實際改名觀察寫入時機。

## 合併進來：App 開著時重啟服務，嵌入看板卡死（8bfb6c9）
- 根因：403 後 app-injector 對同一 iframe `Page.setDocumentContent`（document.open 語意保留 JS realm、清 window 監聽），新主程式因 `const TOKEN` 重複宣告不執行，舊程式收不到 RPC 回應。
- 修正：app-panel.js `createFrame()`／`resetFrame()`；app-injector.mjs 403→`reloadFrame`→換新 iframe 再載入，新 CDP 連線先持有、失敗關閉（舊 helper 洩漏 19～31 條、stop 後不退出）；taskboard-app.test.mjs 入口動畫檢查改輪詢。
- VERIFIED：worktree helper 接專用 App，App 開著重啟服務後約 35 秒換新 iframe、3 秒內 ready、token 一致、RPC 正常、CDP 連線 2 條；App 測試視窗可見時 4 項 PASS。NOT VERIFIED：主 checkout helper 部署（需 stop-app.ps1＋start-app.ps1，重開 App 不換 helper）。
