# 交接（2026-10-13）：Claude App 倒回對話後不再多建一張鏡像卡

## 最新（同日續四）：App 倒回（rewind）沿用原卡
- 根因（Observed Fact）：App 倒回訊息會改用新的 CLI session id，舊 id 記在 local_*.json 的 `priorCliSessionIds`／`rewindEdges`；`mirror_turn` 只以 (tool, sessionId) 找卡，新 id 便另建卡（8142B6 與 056C36 同標題）。
- 修正：claude_sessions.py `list()` 回傳 `priorIds`；server.py `forked_card()`／`adopt_fork()`：鏡像回合找不到卡時依 priorIds 找原卡並把 sourceId 改成新 id，系統留言說明；`fold_forks()` 把舊 id 的 runs／workerThreadId 改到新 id（倒回會把對話複製進新 session，詳情不再重複列同一段 session），舊 id 存 `priorSessionIds`，`task_session_keys` 仍認得；`claude_list()` 同步時也先改綁，避免出現唯讀卡、狀態列對不上；新 id 已有自己的卡則不動。
- 資料：使用者同意後把 056C36 合併進 8142B6（runs／留言依時間合併、sourceId=6a7af013、workerThreadId／result 取較新者）並刪除 056C36。合併前備份 `work/db-backup-<時間>/taskboard.sqlite`；停服務→合併→start.ps1 -NoBrowser 重啟。
- 使用者回報合併後詳情仍列出兩個相同 session，因此加入 fold_forks；同步時已在新 id 上的卡也會折疊。合併留言的「保留在原 session 下」改為「併入這個 session」（第二次停服務前再備份）。
- VERIFIED：Python 76 項（mirror 新增 4 項、tools priorIds 斷言）；正式 /api/state 只剩 8142B6，runs 已無 23a057d3、`priorSessionIds` 為舊 id；Browser 窗格詳情只列 6a7af013 一個來源 session（另有 6 次延續對話）及看板自開的 c1ef9f4b、a413b722。NOT VERIFIED：真實 App 再倒回一次的端到端；未提交。
- 實際失敗：以 Python 文字模式改測試檔寫出 CRLF，已改回 LF。

## 最新（同日續三）：session 只顯示真正的第一次提問
- claude_sessions.py `first_prompt()` 讀 transcript 開頭並快取；`/api/chat` 回 `firstPrompt`；`Board.first_prompt` 優先採用。index.html session 區塊改為純文字「第一次提問」＋「另有 N 次延續對話」純文字，不顯示回報、不收合縮排；`loadFirstPrompt()` 懶載入。
- VERIFIED：Python 72、Node details／drag／projects、正式服務已重啟（PID 36212）並在 Browser 窗格看卡片 056c36。未提交（含上一輪「只列第一筆」的修改）。
- NOT VERIFIED：Codex 來源 session 的第一句（無檔頭讀取，hasMore 時退回第一筆需求）。

## 同日續：run 紀錄收合、新 session 以需求命名（已提交 2284a2e）
- index.html `sessionTitle()`、run 紀錄 `<details>` 預設收合＋縮排、`openRuns` 保存展開狀態；claude_adapter.py `session_name()` 給 `--name`。
- VERIFIED：Python 72、Node details／drag／projects／markdown、Browser 窗格實看正式卡片 8142b6；auto 模式已由真實派工實證（permissionMode=auto、0 拒絕）。
- NOT VERIFIED：Codex App 側欄的 thread 名稱；`--name` 改動需重啟正式服務才生效（index.html 已即時生效）。未提交。

## 最新（同日）：Claude 派工權限改 auto（ADR-021）
- claude_adapter.py `PERMISSION_MODE = 'auto'`，取代 acceptEdits；看板全部自動 allow 的做法被 auto mode 分類器拒絕，未採用。
- VERIFIED：py_compile、Python 72 項、真實 CLI auto 參數 initialize 握手。NOT VERIFIED：真實派工的分類器行為；正式 47824 服務尚未重啟，未提交。
- 下一步：重啟服務後用卡片送一次需要 git 指令的後續需求，確認不再跳核准；若 run 的 permissionMode 不是 auto 或 CLI 報 auto 不可用，再評估。

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

## 同時進行：卡片 Session 心智圖（另一個 session，只改 index.html）
- 卡片頁尾「◎ N session · M 對話」與詳情「◎ Session 心智圖」開 `#map-dialog`：SVG 卡片 → session（工具分色）→ 每次對話（狀態色點）；點 session 開聊天紀錄、點對話跳到詳情該次回報。無看板 run 的 session 開圖時讀 `/api/chat` 計回合（最多 20，「20+」）。區段 `/* taskboard-session-map:start/end */`；`RUN_KIND`／`RUN_STATUS` 與詳情共用。純前端，API 不變。
- VERIFIED：inline script 解析、Node 18 項、Browser 窗格隔離 fixture 實測計數／跳轉／明暗／375px。NOT VERIFIED：正式服務、Codex App 內嵌；未加自動化測試（DOM 測試需專用 App CDP）。
- 展開縮放（同日續）：session 右側 ＋／− 收合、全部展開／收合、放大視窗、縮放 30%～300%（按鈕、Ctrl＋滾輪、＋／−／0 鍵）、拖曳平移；隔離 fixture 實測通過，觸控雙指縮放未實作。
- Ctrl＋M 快捷鍵（同日續）：全域 keydown（Ctrl 或 Cmd，不含 Alt／Shift）開關心智圖；對象依序為已開的卡片詳情、鍵盤焦點所在卡片、滑鼠指著的卡片（`pointerover` 記 `mapHoverId`），都沒有則 toast 提示；心智圖已開則關閉。一律 preventDefault，避免 Electron 宿主的 Ctrl＋M（最小化）在看板有焦點時觸發。隔離 fixture 以 CDP 真實按鍵實測通過；正式服務、Codex App 內嵌 iframe、Claude App Browser 窗格未實測。

## 下一步
1. 讓 `taskboard-sessions-app.test.mjs` 比對卡片時排除衍生的 `sessionStatus`（目前活躍 session 會讓它失敗）。
2. 在 Claude App 改一個 session 名稱，約 15 秒後確認卡片標題跟著變；在看板改標題後再於 App 改名，確認不覆寫。
3. （已修正，見下方 8bfb6c9）App 開著時服務重啟後 frame RPC 無回應。

## 相關檔案
outputs/taskboard/server.py、outputs/taskboard/claude_sessions.py、tests/test_taskboard_mirror.py、tests/test_taskboard_plans.py、tests/test_taskboard_tools.py、tests/taskboard-sessions-app.test.mjs、outputs/taskboard/index.html（心智圖）、AI_CONTEXT.md、docs/decisions.md、docs/architecture.md、docs/current-status.md、docs/changelog-ai.md、.ai/handoff.md。

## 不要動
真實 .data／profile／認證；正式 47824 服務與專用 App 除非使用者要求；不提交 vendor/；stage 明列路徑，禁止 git add .／-A。

## 未提交變更
標題修正已 commit（只 stage 本輪 hunk）。仍未提交、屬另一個 session：index.html 心智圖；`TASKBOARD_DISPATCHED`（claude_adapter.py、mod register.tsx／taskboard.test.ts、server.py 遲到 board-run 判斷、test_taskboard_mirror.py 對應測試）及其文件段落。
