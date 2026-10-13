# TaskBoardTool：本機 AI 任務管理看板

Windows 本機工具，讓 Codex 與 Claude Code 共用任務看板、排程、任務紀錄與人工驗收；也能唯讀追蹤本機既有對話。

## 執行

本專案使用 Python 標準函式庫、原生 JavaScript、Node 與 Windows PowerShell，沒有 npm build。已驗證環境為 Node 24 與 PowerShell 5.1；請安裝 Python，以及要使用的 Codex／Claude Code CLI，並透過各工具自己的流程登入。

在專案根目錄啟動網頁看板：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File outputs/taskboard/start.ps1
```

完整操作手冊（安裝、啟動、卡片操作、Session 連動、對話分類、心智圖、計畫匯入、排錯）見 [docs/user-guide.md](docs/user-guide.md)，開頭附 45 秒功能展示影片；Codex App 專用視窗整合與 Claude Code 原生窗格的背景說明見 [看板 README](outputs/taskboard/README.md)。

## 近期功能

- 五欄：列管、待辦、進行中、待審核、已完成；支援滑鼠拖曳與人工驗收。
- 專案名稱可選既有名稱或輸入新名稱；唯一對應工作資料夾自動帶入，同名多路徑提供候選。
- 「選擇資料夾」開啟 Windows 資料夾視窗，也保留文字輸入；取消保留原值。
- Codex／Claude 派工、後續對話、計畫匯入、任務前置依賴與完成後釋放。

私人 SQLite、App profile、認證、測試截圖與工作資料夾不納入 Git；請勿將 `outputs/taskboard/.data/` 上傳。

開發與驗證指令見 [AI_CONTEXT.md](AI_CONTEXT.md)，協作規範見 [AGENTS.md](AGENTS.md)。
