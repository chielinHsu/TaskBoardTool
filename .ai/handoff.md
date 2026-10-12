# 交接（2026-10-12）：新電腦安裝看板；詳情「建立派工卡片」漏傳工具修正

## 正在做
使用者在新電腦（HQ 帳號筆電）安裝看板並開始使用。安裝完成；使用者回報 Claude 同步卡片無法匯入，已修正一行前端程式並實測。本輪未提交（使用者尚未授權 commit／push）。

### 安裝（本輪）
- Observed Fact：全新環境，無 .data、無全域 mod、服務未啟動。Codex App 26.1002、Claude App 2.31226 皆為 Store 版；claude CLI 2.1.294、codex-cli 0.136.0、Node 22.16。Codex runtime Python 3.12.14 存在（start.ps1 優先使用）；另有 Python 3.9；Store Python 3.12 登錄失效（`py -3.12` 無法建立程序），cmd 下 `python` 回 9009，bash 下 Store alias `python` 會靜默不執行腳本。
- 執行：setup-claude-mod.mjs（6 檔同步、CLAUDE_CODE_PLUGIN_DIRS 加入全域路徑、settings 備份 work/claude-settings-backups、validate 通過；exit 1 只因 Python 誤判）、install-desktop-shortcut.ps1（Desktop\Codex.lnk）、start.ps1 -NoBrowser（.data 建立，為空白看板）。
- VERIFIED：Browser 窗格 http://127.0.0.1:47824 正常、無 console 錯誤；Codex 已連線、Claude Code 可用；30 Codex／351 Claude sessions 同步（Store 路徑解析在本機正常）；使用者 /reload-plugins 後 4 plugins 含 taskboard-pane，本 session 有 import_plan 工具。
- NOT VERIFIED：專用 Codex App 視窗（未啟動，由桌面捷徑啟動）、新 session 自動開窗、App 群組同步（需在 App 內開窗格）。

### 修正（本輪）
- Observed Fact：詳情視窗「建立派工卡片」對 Claude 同步卡片回「請先更新聊天清單，再選擇匯入」。根因：index.html `#import-task` 只送 `threadId`，server `import_chat` 預設 tool=codex 於 Codex 清單查不到。既有對話頁（renderChats）同功能有帶 tool；Codex 卡片因預設值剛好正常；後端測試直接呼叫 import_chat 帶工具故未抓到。
- 修正：index.html:367 加 `tool: editing.sourceTool||toolOf(editing)`。index.html 每次請求讀檔，不需重啟。
- VERIFIED：真實看板同卡片匯入成功（toast「已建立派工卡片」、狀態欄可改、tool=claude、卡片可拖曳並標「請補上這次的需求」）；兩段 inline script vm 解析通過。未執行 tests/taskboard-details.test.mjs（需專用 Codex App）。
- 拖曳／改狀態對同步卡片不可用為設計行為（唯讀追蹤卡片），已向使用者說明。

## 下一步
1. 使用者授權後 stage 明列：outputs/taskboard/index.html、docs/current-status.md、docs/changelog-ai.md、.ai/handoff.md；commit `fix: send session tool when importing from task details`。
2. 可考慮在 details Node 測試加 Claude 同步卡片的詳情匯入案例（需專用 App 才能跑）。
3. setup-claude-mod.mjs 的 Python 檢查可改為同 start.ps1 的 runtime 路徑優先，避免誤報。
4. 桌面捷徑啟動 Codex 專用視窗後，執行 node tests/taskboard-app.test.mjs 驗證 App 整合。

## 相關檔案
outputs/taskboard/index.html（#import-task）、server.py（import_chat）、session_sync.py（session_card 的 sourceTool）、setup-claude-mod.mjs、start.ps1；docs/current-status、changelog-ai。

## 不要動
真實 .data／profile／認證、一般 App、官方安裝檔、使用者 settings.json 其他鍵；不直接編輯 SQLite。stage 明列路徑，禁止 git add .。

## 未提交變更
index.html 一行修正；docs/current-status.md、docs/changelog-ai.md、本檔。無 ADR（無設計決策）。

## 已知問題與未驗證事項
setup-claude-mod.mjs 在本機誤報缺 Python（cmd 解析）。Store Python 3.12 登錄失效屬系統問題，未處理。筆電 .data 為空白看板，先前電腦的卡片不在此。
