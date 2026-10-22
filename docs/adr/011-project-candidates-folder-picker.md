# ADR-011：專案候選與原生資料夾選擇，不遷移任務資料

- 背景：使用者要求「積壓」改「列管」，新增任務可重用 ProjectName 並同步工作資料夾，路徑須能透過資料夾視窗選擇。
- 決定：保留 `backlog` 鍵，只改 UI／新事件文案；專案名稱由既有 state 去重，網頁 input＋datalist、Claude 窗格 Select＋Input 可選可輸入。唯一路徑自動帶入，同名多路徑明確選擇；新名稱在儲存任務後才成為候選。
- 決定：由受 token／Host／Origin 保護的 loopback API 啟動 PowerShell STA FolderBrowserDialog；非同步工作 ID 輪詢、取消、300 秒逾時與服務關閉回收。資料夾選擇不建立目錄、不保存任務、不派工，參數不經 shell 拼接；保留手動輸入。
- 理由：瀏覽器資料夾上傳／File System Access API 不提供可供本機 subprocess 使用的絕對路徑；Windows 原生視窗能直接回傳路徑。非同步 API 沿用既有 opaque iframe capability bridge，避免使用者選擇時間超過單次 RPC 逾時。
- 替代方案：新增專案表需要遷移且不涵蓋同步 session；任意選取同名專案的第一個路徑會有派工到錯誤位置的風險；同步等待視窗會占住 HTTP 請求。均未採用。
- 後果：原生資料夾視窗限 Windows；候選來自現有卡片，不是獨立專案登錄。保留原卡片資料；既有事件中的歷史文案不背景改寫。原生實際點選仍待人工驗收。
- 驗證：後端 46/46（含認證／Origin、取消／逾時／關閉回收）；隔離 DOM 檢查專案保存、唯一／多路徑、手動值與 opaque iframe 選擇；Claude 外掛 6/6、validate 通過。
