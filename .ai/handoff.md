# 交接（2026-10-12）：Claude App 對話鏡像為看板卡片（mod turn 事件 → /api/claude-turns）

## 正在做
使用者指出同步的唯讀 session 卡片會出現在「進行中／待審核」卻不能拖，按「建立派工卡片」後又退回列管，狀態對不上。決定改為：Claude App 的 session 送出需求時由 mod 自動建卡並直接進「進行中」，回合結束進「待審核」；同 session 後續每句都是同一張卡的 run，已完成的卡收到新需求重開。本輪已實作與驗證，未 stage／commit。

續（同日 15:40 起）：使用者看了鏡像卡的聊天紀錄後提出三點：回合要摺疊、你／Claude 訊息配色區分、需求簡介與驗收條件未填時依第一句擬一份且後續對話不得改動。已實作、測試，正式服務重啟為 1.7.0，仍未 stage／commit。

## 本輪已完成
- server.py：`Board.mirror_turn` 與 `POST /api/claude-turns`（event=start／complete；sessionId、turnId、text、answer、reason、aborted、cwd、model）。首句建卡（priority high、tool claude、sourceId／sourceTool、cwd 存在才填、project 取群組或資料夾名）、run kind=`mirror`；start 重複 turnId 忽略、前一筆 running 未收到結束改 `unknown`；complete 寫 result／error，`aborted`→interrupted→列管、`error`／`refusal`→failed→待審核、其餘 completed→待審核；有 nextRun 則回待辦。看板自己派工中的 Claude run（active run 的 threadId 未綁定或相同）回 `board-run` 不鏡像；孤立 complete 或空需求回 `no-card`。
- 守衛：`update` 拒絕把鏡像執行中的卡片改狀態（其他欄位可存；同狀態 PATCH 不再撞「請用開始執行」）；`start` 拒絕 in_progress 卡片；followup 本來就拒絕。排程只看 todo。API_VERSION 1.6.0。
- index.html：`mirroring(t)`（非唯讀、in_progress、非 activeId）→ 不可拖、徽章「Claude App 對話執行中」、詳情停用狀態／開始執行／後續需求；run 標籤 `mirror`＝「Claude App 對話」。
- mod register.tsx：`turn.start`／`turn.complete`（略過 subagent）呼叫 `mirror()` POST；session.id／cwd／model 讀取失敗不阻擋回合。taskboard.test.ts 新增鏡像測試（測試底層 `on('session.id', () => ({ value }))`）。已 `node outputs/taskboard/setup-claude-mod.mjs` 同步全域副本（--check 就緒，「缺少 Python」為 cmd 誤判）。
- 測試：tests/test_taskboard_mirror.py 7 項；版本斷言改 1.6.0（test_taskboard_plans、test_taskboard_tools、taskboard-sessions-app）。
- 文件：current-status、changelog-ai、ADR-017、architecture（前後 Mermaid）、AI_CONTEXT（目錄表、不變條件、`py -3` 註記）。
- VERIFIED：`py -3 -m py_compile`；Python 57 測試通過；`claude plugin validate`／`test` 7 項通過；隔離服務（`--port 47999 --data-dir work/mirror-verify --no-connect`）用 curl 送 start → Browser 窗格看到卡片在進行中、徽章、詳情狀態／開始執行／後續需求停用、`draggable=false`；送 complete 後卡片移到待審核、run 結果與系統留言正確。驗證後已 `/api/shutdown`，正式 47824 服務未動（仍是舊碼）。
- 真實 session 驗證（2026-10-12 15:19–15:26，本 Claude App session）：VERIFIED 真實 session 的 `turn.start`／`turn.complete` 會送 `POST /api/claude-turns`（舊碼先回 404，重啟後 200）；`$.session.id()` 等於 transcript 的 session id（卡片 sourceId＝`75317312-…`，而桌面側 `list_sessions` 的 id 是 `local_c2bfbe8c-…`）；首句建卡進「進行中」（priority high、tool claude、project 取資料夾名）並取代同 session 的唯讀追蹤卡；run 為 `mirror`／執行中、model 存 `claude-fable-5-1`；卡片 `draggable=false`、徽章「Claude App 對話執行中」；詳情狀態選單、開始執行、後續需求區停用，停止執行／建立派工卡片隱藏。前一回合的孤立 `complete` 回 200（no-card）。正式 47824 服務已在 15:21 以 stop.ps1／start.ps1 重啟為 1.6.0，卡片保留。
- NOT VERIFIED：真實 `turn.complete` 後卡片移到「待審核」（隔離服務已驗證，正式服務要在回合結束後再看）；`claude -p` 派工子程序是否也載入 mod（伺服器已靠 active run 排除）；Codex App DOM 測試（details／drag／projects）因 `python` alias 與專用 renderer 未跑。
- 附帶觀察：server.log 從未出現 `POST /api/claude-groups`，`claudeGroups` 為空，所以鏡像卡 project 取資料夾名而非側欄群組（mod 的 `$.mcp.call('ccd_session_mgmt','list_sessions')` 可能靜默失敗，屬先前功能）；stop.ps1 的 Invoke-WebRequest 缺 `-UseBasicParsing`；start.ps1 在 bash 內因子程序繼承管線不會自行結束（改用 `Start-Process powershell … start.ps1` 分離啟動即可）。
- 續輪實作：index.html 聊天紀錄每回合 `details.chat-turn`（只展開最新；summary＝回合 N · 狀態 · 首句摘要 · 時間，回合 ID 在 title）＋ `msg-user`（accent-light 底、accent 左框）／`msg-progress`（灰、虛線）／`msg-agent`（hover 底），詳情簡介在 brief seed／drafted 時附說明。server.py：`brief` seed→drafted→manual、`event=brief`／`apply_brief`、`first_prompt`（transcript 最早一句）、`update` 改 description→manual、舊鏡像卡（無 brief 鍵且簡介＝首筆 mirror run 需求）在下一個事件重播種為 seed、Store 啟動復原跳過最後 run 為 mirror 的進行中卡片、API 1.7.0。register.tsx：`draftBrief`（`$.model.complete` haiku／low／800 tokens／60 s，固定繁中格式，失敗則保留第一句）。tests：test_taskboard_mirror 11 項、mod 鏡像測試含 brief（`on('model.complete')` 模擬）、版本斷言 1.7.0。文件：ADR-018、architecture 擬稿序列圖、current-status、changelog、AI_CONTEXT。全域 mod 副本已以 setup-claude-mod.mjs 同步。
- 續輪 VERIFIED：Python 61 測試、mod validate／test 7 項、index.html 內嵌 script 解析、Browser 窗格實測聊天紀錄三回合摺疊與三種配色、真實回合結束→待審核（卡 118e063ee674 run 1 completed）、正式服務 1.7.0。實際失敗：15:48 重啟時舊復原碼把鏡像中的 run 2 標為「已中止」並把卡片推到待審核（已修；本回合結束訊號到達後 run 2 會以 turnId 對上改為 completed，並因簡介仍等於首筆需求而重播種 brief=seed）。NOT VERIFIED：真實 `$.model.complete` 擬稿與 brief 回寫（需下一句 start 觸發）。
- 實際失敗：bash `python`／`py -3.12` 皆為失效的 Store alias，改用 `py -3`（3.9）；Python `write_text` 把 LF 檔寫成 CRLF，已逐檔還原（tsx／ts 依 autocrlf 保持 CRLF）。

## 下一步
1. 下一句送出後確認卡 118e063ee674：回進行中、新增 run、`brief` 由 seed 變 drafted（詳情簡介出現「需求簡介／驗收條件」與自動擬定說明、標題不變）；若沒變，看 server.log 該 start 之後是否多一筆 `/api/claude-turns`（沒有＝`$.model.complete` 失敗或空白，有但 brief 未變＝回應 reason）。
2. 查 `claude-groups` 為何從未送達（mod `syncGroups` 的 `$.mcp.call` 結果），決定鏡像卡 project 要不要補群組名。
3. 每句都建卡是否太吵，實測後再決定是否加開關（設定或 /taskboard 切換）。
4. stop.ps1 補 `-UseBasicParsing`（專案規則）。

## 相關檔案
outputs/taskboard/server.py（mirror_turn、update／start 守衛、dispatch）、index.html（mirroring、card、refreshDetail）、claude-mod/taskboard-pane/hooks/register.tsx（mirror、turn hooks）、hooks/taskboard.test.ts、tests/test_taskboard_mirror.py。

## 不要動
真實 .data／profile／認證；正式 47824 服務除非使用者要求重啟；~/.claude/settings.json 其他鍵；不直接編輯 SQLite。stage 明列路徑，禁止 git add .。

## 未提交變更
本輪修改：server.py、index.html、register.tsx、taskboard.test.ts、三個版本測試、新增 test_taskboard_mirror.py、AI_CONTEXT.md、docs 四檔、本檔；續輪再改同一批檔案並加 docs/decisions.md（ADR-018）；全部未 stage。work/mirror-verify 為驗證用隔離資料，不進 Git。

## 假設與未驗證事項
App 內 session 的 turn 事件會送到 mod 且 session.id 與 transcript 一致已由真實 session 證實；仍假設 `claude -p` 派工子程序的事件會被 active run 守衛擋掉。真實模型派工與核准往返仍 NOT VERIFIED。
