# ADR-015：Claude App session 目錄以套件 LocalCache 為優先候選（2026-10-11）

- 背景：Store 版（MSIX）Claude App 的 AppData 被虛擬化，`%APPDATA%\Claude\claude-code-sessions` 只有 App 子程序看得到，實體檔案在 `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\claude-code-sessions`。桌面啟動的看板服務因此列不出 Claude sessions。
- 決定：`resolve_desktop_root()` 依序探測套件 LocalCache 路徑與 `%APPDATA%` 路徑，取第一個存在者；明確傳入的 desktop_root 不被取代；不可用時每次查詢重新解析。能力值回報 `sessionRoot`，橫幅顯示實際檢查路徑。
- 理由：兩條路徑在 App 子程序中指向同一實體目錄，套件路徑在任何程序都可讀，因此優先；仍保留 Roaming 以支援非 Store 版安裝；只讀、不建立目錄。
- 替代方案：要求使用者固定從 Claude Code 內啟動服務（會繼承 CLAUDECODE，派工時成巢狀 session，否決）；設定檔手動指定路徑（可作為後備，未實作）。
- 後果：多個 Claude 套件版本並存時取排序第一個；App 改回非套件安裝時自動回退 Roaming；文件與測試已更新。
