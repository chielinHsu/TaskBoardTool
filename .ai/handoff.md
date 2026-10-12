# 交接（2026-10-12）：驗收完成時清除舊失敗；Codex App 入口啟用（前一輪，未提交）

## 正在做
使用者回報兩個現象：待審核卡片顯示「需要處理」、拖到已完成時 toast 出現舊的 OAuth 錯誤。已說明原因並依使用者決定修正。本輪未 stage、commit、push（未授權）。

## 本輪已完成
- Observed Fact：「需要處理」＝卡片 `error` 非空且不在額度等待（index.html card()）。來源是 Claude CLI 回 `is_error` 的 result（OAuth session expired），claude_adapter 存為卡片 error 並放到待審核。
- Observed Fact：狀態變更事件的 message 優先採用卡片現有 `error`（server.py Store.put），前端對 in_review／done 新事件 toast；PATCH 到 done 以前不清 error，因此「驗收完成」事件重播舊錯誤並以紅色顯示。
- 修正 server.py Board.update：狀態為 `todo` 或 `done` 時清除 `error`／`retryAt`（原本只有 todo）。runs 內保存的 run.error 不動，歷史仍可查。
- 使用者第 1 點（後續對話／二次修正解決後要更新卡片）：既有流程已滿足，start 清 error、complete_run 以本次結果覆寫 error；本輪以測試固定此行為，不另改程式。
- 新增 tests/test_taskboard_tools.py `test_failed_run_clears_after_successful_followup_or_acceptance`：CRASH 失敗 → 改需求 → followup 成功 → error 空、事件為「執行已結束，等待人工驗收」且 error=False；另一張失敗卡 PATCH done → error 空、retryAt 0、事件「使用者已驗收，任務完成」。
- VERIFIED：新測試在修正前失敗（error 仍為 CRASH 訊息）、修正後通過；`py -3.9 -X utf8 -m unittest discover -s tests -p 'test_taskboard_*.py'` 50 測試通過；py_compile 通過。
- NOT VERIFIED：真實看板拖曳到已完成後 toast 顯示（服務需重啟載入新 server.py）；Node／App 測試未跑（未改前端）。
- 實際失敗：本機 bash／PowerShell 的 `python` 是 Store alias stub，靜默結束（exit 49）；用它做的 heredoc 編輯沒有寫入，改用 Edit 工具重做。`py -3.12` 登錄失效，改 `py -3.9`。

## 前一輪（未提交）：Codex App 任務看板入口啟用
- 執行 start-app.ps1 重用 47824 服務、啟動專用 profile／9232 renderer；真實 DOM 入口與 `node tests/taskboard-app.test.mjs` 四組 VERIFIED；無程式變更。完整關閉／桌面捷徑冷啟動 NOT VERIFIED。
- 更早：新電腦安裝（setup-claude-mod、桌面捷徑、start.ps1）與詳情「建立派工卡片」漏傳 tool 修正已提交 49b65da。

## 下一步
1. 使用者授權後 stage 明列：outputs/taskboard/server.py、tests/test_taskboard_tools.py、docs/current-status.md、docs/changelog-ai.md、.ai/handoff.md；commit `fix: clear stale run error when a card is accepted`。
2. 重啟看板服務（stop.ps1 後桌面捷徑或 start.ps1）讓新 server.py 生效；把「任務看板安裝」卡片拖回待辦前先在終端機 `claude` 重新登入，再開始執行。
3. 驗證指令文件中的 `python` 在本機請改 `py -3.9`（或 start.ps1 用的 Codex runtime Python）；可考慮 AI_CONTEXT 註記。
4. setup-claude-mod.mjs 的 Python 檢查可改為同 start.ps1 的 runtime 路徑優先。

## 相關檔案
outputs/taskboard/server.py（Board.update、Store.put 事件、complete_run）、claude_adapter.py（finish failed）、index.html（card() 徽章、refresh() toast）；tests/test_taskboard_tools.py、tests/fake_claude_cli.py。

## 不要動
真實 .data／profile／認證、一般 App、官方安裝檔、使用者 settings.json 其他鍵；不直接編輯 SQLite。stage 明列路徑，禁止 git add .。

## 未提交變更
server.py（4 行）、test_taskboard_tools.py（新測試）、docs/current-status.md、docs/changelog-ai.md、本檔（後三者含前一輪 Codex 入口啟用的未提交內容）。無 ADR：行為修正沿用既有 todo 清除規則，無新設計決策。

## 已知問題與未驗證事項
真實模型派工與核准往返 NOT VERIFIED。Store Python 3.12 登錄失效、`python` alias 靜默失敗屬系統問題，未處理。Claude 新 session 自動開窗與 App 群組同步仍未驗證。
