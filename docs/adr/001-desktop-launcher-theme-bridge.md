# ADR-001：桌面啟動器與主題 bridge（2026-10-10）

- 背景：原生啟動無入口；iframe 寫死色彩；clone 剝除呈現 attributes。
- 決定：桌面使用可重入 launcher，原生 token 初始及即時傳至 iframe，保留按鈕樣式 attributes。
- 理由：沿用 profile 與安全邊界；替代方案為修改安裝檔或硬編碼兩套主題。
- 後果：App DOM／CSS 大改時需調整；普通原生啟動仍不載入看板。
