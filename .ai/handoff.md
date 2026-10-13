# 交接（2026-10-13）：修正 App 開著時重啟服務後嵌入看板卡死

## 正在做
使用者要求查原因並修正：Codex App 開著時重啟看板服務，嵌入看板一直「連線中斷」。已查明、修正、實機驗證；在 worktree `claude/distracted-colden-4e156a`（main 已在 920d808，含 Mermaid 功能），本修正未 commit。

## 根因
服務換 token → 嵌入頁 403 → app-injector `loadedFrame=null` → 對同一 iframe `Page.setDocumentContent`（document.open 語意：保留 JS realm、清 window 監聽）→ 新主程式 `const TOKEN` 重複宣告失敗不執行，舊程式發 RPC、回應送達但無監聽器。證據：frame 全域 TOKEN 舊值 vs 頁面 HTML 新值、body 無 embedded、包住 `respond()` 追蹤到回應以正確 capability 抵達 frame 而 `api()` 不完成。

## 本輪已完成
- app-panel.js：`createFrame()`；`resetFrame()` 以新 iframe 取代舊的並清 capability／frameLoaded，掛在 `window.__casparTaskboard`。
- app-injector.mjs：403 → `bound.reloadFrame=true`；主迴圈先 `resetFrame()`、重讀 status 再 `loadFrame()`（新 frame id）；新 CDP 連線先存 `connection={cdp,scriptId:null}`，設定中途失敗由外層 catch 關閉。
- tests/taskboard-app.test.mjs：入口圖示 idle／selected 檢查改最多輪詢 2 秒（主頁面因 634 KB state 每 2.5 秒輪詢會停頓 200～570 ms）。
- 文件：current-status、changelog、本檔。

## 驗證
- VERIFIED：node --check 三檔；以 worktree helper（PID 35648，日誌在 scratchpad）接專用 App、正式 47824 服務：App 開著重啟服務 → 約 35 秒換上新 iframe（名稱改變）、3 秒內 ready、新主程式執行、frame token＝服務 token、RPC 正常；helper 僅 2 條 CDP 連線。App 測試（scratchpad 副本改絕對路徑指向主 checkout）視窗可見時 4 項 PASS。
- 實際失敗：視窗最小化／被遮住（visibilityState hidden）時動畫檢查失敗（環境）；一次重新載入前後卡片總數不同（session 同步增減，測試競態，未修）；舊 helper（30748）stop-app 後因外洩連線不退出，已手動結束。
- NOT VERIFIED：重啟後約 35 秒～2 分鐘才重新載入的延遲成因（推測隱藏 iframe 計時器節流）；主 checkout 部署後的 helper。

## 下一步
1. 使用者授權後 commit、push、快轉 main。
2. 部署：stop-app.ps1 停掉目前的 worktree helper（PID 35648），再以主 checkout start-app.ps1（或桌面捷徑）啟動 helper；重開 App 不會換 helper。
3. 視窗可見時在主 checkout 跑 `node tests/taskboard-app.test.mjs`。
4. 可考慮：卡片總數比對改為等穩定；減少 state 體積（386 張唯讀同步卡每 2.5 秒傳 634 KB）。

## 相關檔案
outputs/taskboard/app-panel.js、app-injector.mjs、tests/taskboard-app.test.mjs、docs/current-status.md、docs/changelog-ai.md。

## 不要動
真實 .data／profile／認證；PID 44464 的 `taskboard-sessions-app.test.mjs` 不是本 session 啟動的；stage 明列路徑。

## 未提交變更
app-panel.js、app-injector.mjs、tests/taskboard-app.test.mjs、current-status、changelog、本檔。ignore 的本機產物：worktree `outputs/taskboard/.data`（誤啟動的空資料庫）、`vendor/`、`work/preview-isolated`。

## 假設與未驗證事項
假設 resetFrame 後舊 iframe 殘留的訊息因 `event.source` 不符被 panel 忽略（程式邏輯如此，未單獨實測）。
