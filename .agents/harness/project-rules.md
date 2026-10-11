# 本專案規則

- 沿用 Python 標準函式庫與原生 JS／Node API，不為局部修正加入框架。
- 延續現有函式與檔案命名。文件繁體中文、UTF-8；中文 .ps1 用 UTF-8 BOM；PowerShell 5.1 讀取加 -Encoding UTF8，HTTP 探測加 -UseBasicParsing。
- 事實與規範集中在共用来源；docs/DEVELOPMENT.md 保留為索引。
- Appearance 背景、前景、accent、字型同步原生 token，不硬編碼綠色；保留原生 icon 呈現 attributes。
- 不關閉一般 App，不改安裝檔、不複製登入資料；CDP 只接已驗證的專用 profile。
- .data／SQLite／profile／token／截圖不進 Git；測試不可改真實卡片。
- 所有 subagent 不 stage、commit、push，不再委派，不覆蓋來源不明的未提交修改。
- 主 agent 依當次授權明列 stage 路徑，禁止 git add .／git add -A。沿用既有 type: description 提交格式；補骨架不代表取得 commit／push／發布授權。
- 啟動器確認埠／profile 所有權；mutex 避免雙擊啟動競態。未驗證的平台 runtime 不得稱已生效。
