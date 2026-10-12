# 交接（2026-10-12）：看板左上角名字改讀 Codex／Claude Code 登入帳號；服務識別不再看名字

## 正在做
使用者問看板左上角「Caspar」從哪來、要求改成自動讀使用者名稱，再改成讀 Codex／Claude Code 的登入帳號（不用電腦的使用者名稱）。已完成並重啟服務與 Codex helper，使用者授權 commit 與 push，本輪已執行。

## 本輪已完成
- Observed Fact：名字原本寫死在 index.html（`<title>` 與 `.brand`），server.py 送頁面只替換 `__BOARD_TOKEN__`。第一版改成 `getpass.getuser()`（電腦帳號 `Caspar.Hsu`）；使用者改要登入帳號。
- Observed Fact（畫面一直閃的根因）：舊 server 行程每次請求重讀 index.html 但不替換新佔位 `__BOARD_USER__`；而 app-injector.mjs 用 `html.includes('Caspar')` 當服務身分檢查，名字換掉後檢查失敗、helper 不斷重載 frame。start.ps1／stop.ps1 也用 `*Caspar*` 判斷埠的歸屬（PowerShell 不分大小寫，所以仍會命中 `caspar-board-*`，沒有壞）。
- server.py：新增 `claude_account_name()`（`~/.claude.json` 或 `CLAUDE_CONFIG_DIR` 的 `oauthAccount.displayName`→`fullName`→email 本機名）、`codex_account_name()`（`~/.codex/auth.json` 或 `CODEX_HOME` 的 id_token，只解碼 `name`／`email` 兩個 claim，不保存、不記錄 token）、`board_user_name(tool)`：`embed=1`（Codex App 嵌入）用 Codex 帳號、其餘用 Claude Code 帳號，缺的用另一個，都沒有顯示「使用者」；每次送頁面重新讀。
- index.html：`<title>` 與 `.brand` 改佔位 `__BOARD_USER__`（HTML 跳脫後填入）；加 `<meta name="taskboard-service" content="caspar-taskboard">` 當固定的服務識別。
- app-injector.mjs 身分檢查改看該 meta；start.ps1 改 `*content="caspar-taskboard"*`、stop.ps1 改 `*caspar-taskboard*`（舊版頁面的匯出檔名也含它，停舊服務不受影響）。
- VERIFIED：py_compile、`node --check`、兩個 .ps1 的 Parser 檢查無錯誤且仍為 UTF-8 BOM＋CRLF；暫時服務（47899）與重啟後的正式服務（47824）：`/` 標題「CasparHsu 的任務看板」、`/?embed=1`「Hsu Shih Lin 的任務看板」；`stop-app.ps1`＋`start-app.ps1` 後 `.data/app-status.json` 為 `ready`、`frameLoaded: true`；`test_taskboard_*.py` 50 項通過。重啟前確認 `activeId` 為 None、兩張進行中都是唯讀 session 卡片。
- NOT VERIFIED：Codex App 視窗內實際畫面（只看 app-status.json）；`node tests/taskboard-app.test.mjs` 未跑；沒有登入資料時的「使用者」退路只靠程式邏輯。
- 實際失敗：bash 的 `python` 是 Store alias stub，heredoc 腳本靜默沒寫入；改用 `C:\Users\Caspar.Hsu\AppData\Local\Programs\Python\Python39\python.exe` 跑補丁腳本。

## 下一步
1. 若 Codex App 內看到的名字或主題不對，跑 `node tests/taskboard-app.test.mjs` 看四組檢查。
2. 兩邊帳號名不同（Codex 全名「Hsu Shih Lin」、Claude「CasparHsu」）是帳號各自登記的；要統一顯示可在 `board_user_name` 改優先順序。
3. AI_CONTEXT 的驗證指令 `python` 在本機要改實際的 Python 路徑或 `py -3.9`（前一輪已提）。

## 相關檔案
outputs/taskboard/server.py（`claude_account_name`、`codex_account_name`、`board_user_name`、dispatch 的 `/`）、index.html（`<title>`、`.brand`、meta）、app-injector.mjs（loadFrame 身分檢查）、start.ps1／stop.ps1（埠歸屬判斷）。

## 不要動
真實 .data／profile／認證（auth.json 只讀名字 claim，不複製）、一般 App、官方安裝檔、使用者 settings.json 其他鍵；不直接編輯 SQLite。stage 明列路徑，禁止 git add .。

## 未提交變更
本輪全部已 commit 並 push（見 docs/changelog-ai.md 最上方）。無 ADR：顯示名稱來源與服務識別標記屬局部行為，沒有新的設計決策。

## 已知問題與未驗證事項
真實模型派工與核准往返 NOT VERIFIED。Store Python 3.12 登錄失效、`python` alias 靜默失敗屬系統問題，未處理。Claude 新 session 自動開窗與 App 群組同步仍未驗證。
