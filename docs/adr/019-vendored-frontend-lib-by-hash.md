# ADR-019：前端渲染函式庫由安裝腳本下載固定版本並以雜湊核對（2026-10-12）

- 背景：工程流程要求跨模組變更附修改前／後 Mermaid 圖，但看板回報只顯示純文字。專案規則是原生 JS、不加框架；一般網頁 CSP 為 `default-src 'self'`，Codex 內嵌 frame 以 `Page.setDocumentContent` 寫入、CSP 為 `default-src 'none'; script-src 'unsafe-inline'`，只能經 RPC 呼叫 `/api/` JSON，都不能從 CDN 載入。自寫 Mermaid 解析與排版不切實際。
- 決定：允許「前端渲染函式庫」作為不加框架規則的例外，條件是：安裝腳本下載寫死的版本與 URL、以腳本內的位元組數與 SHA-256 核對，不符即刪除並失敗；檔案放在 gitignore 的 `outputs/taskboard/vendor/`；服務經 token／Host／Origin 保護的 `GET /api/vendor/mermaid` 以 JSON 供應並依安裝紀錄再核對雜湊；頁面只在需要時以 inline script 注入，網頁版與內嵌版同一路徑；不放寬任何 CSP、不加 `unsafe-eval`。第一個套用者為 Mermaid 11.17.2（`securityLevel: 'strict'`、輸出再以 template 惰性解析並移除主動內容）。Markdown 本身以原生 JS 小型轉換器處理，只建立元素與文字節點。
- 理由：一份檔案、一條路徑同時滿足兩種 CSP；JSON 供應讓內嵌 frame 的路徑白名單與回應格式不必改；雜湊固定讓 CDN 遭竄改或版本漂移時失敗而不是執行未知程式碼。版本選 11.17.2 而非原先建議的 11.6.0，因為 11.6.0～11.16.0 有已公開的 XSS（CVE-2025-54881、CVE-2025-54880）、HTML／CSS 注入與 DoS 公告，看板渲染的是 AI 產生的文字。
- 替代方案：CSP 加 CDN 來源（兩種 CSP 都要放寬、內嵌 frame 無網路來源，否決）；把函式庫提交進 Git（3.5 MB 第三方產物進版控，使用者否決）；`/vendor/` 靜態路徑（內嵌 frame 無 `script-src` 來源、橋接只允許 JSON，否決）；伺服器端預先渲染 SVG（需要 Node／瀏覽器排版，否決）；只做 Markdown 不做圖（不滿足需求）。
- 後果：每個 checkout（含新電腦、每個 worktree）要各自執行一次 `node outputs/taskboard/setup-mermaid.mjs`；未安裝時圖改顯示原始碼與安裝提示，其他功能不受影響。升級版本需同時改腳本的版本、URL、大小與雜湊。第一次載入經 RPC 傳約 3.5 MB，之後在頁面記憶體中重用。API 1.8.0。
