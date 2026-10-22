# ADR-023：需求與後續需求的附件（2026-10-14）

- 背景：使用者要求需求與驗收條件、延續／新對話都能附加檔案或圖片。API 只有 JSON；嵌入的 Codex App 經 CDP capability RPC 轉送 JSON；CSP `img-src 'self' data:`。
- 決定：`POST /api/attachments` 收 base64（單檔 10 MB、每項最多 20 個，只有此路由放寬請求上限），存 `.data/attachments/<16 hex id>/<安全檔名>` 與伺服器自寫的 meta.json；卡片 `attachments`、nextRun／run／後續需求留言只存 id／name／size／mime。派工時 prompt 列出絕對路徑；圖片另以原生輸入：Codex `localImage`、Claude stream-json image block（≤3.75 MB），Claude 加 `--add-dir` 附件根目錄。延續同一 session 只重送該次後續需求的圖片。卡片移除附件或刪卡時刪檔。
- 理由：不把檔案複製進使用者工作資料夾或 Git；沿用現有 JSON／RPC 通道與 CSP；圖片原生輸入讓模型確實看到截圖，路徑讓非圖片檔可被工具讀取。
- 替代方案：multipart 上傳（RPC 通道只轉 JSON）；複製到工作資料夾（污染 repository）；把 base64 存進 SQLite（state 每 5 秒輪詢會變大）；blob: 預覽（需放寬 CSP）。
- 後果：匯出 JSON 只含附件中繼資料、不含檔案（沿用 schemaVersion 5，附加欄位）；上傳後未儲存的草稿附件會留在 .data，目前不自動清理；API 1.10.0。
- Verification：Python 81（新增 4）；隔離服務瀏覽器驗證貼上／選檔上傳、縮圖、預覽、儲存、後續需求排隊與取消。NOT VERIFIED：真實 Codex／Claude 模型讀取附件。
