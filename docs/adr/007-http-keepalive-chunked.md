# ADR-007：看板 HTTP 改用 keep-alive 與分段寫出（2026-10-11）

- 背景／Evidence：真實服務的 `/api/state`（178 KB）與 Codex 對話讀取（853 KB）約 10% 在 19 秒後被 RST；`/health`、`/api/export`、`/api/models` 從未失敗。19 秒等於 Windows 5 次 TCP 重傳退避；同程序內的客戶端從不失敗，跨程序最小重現（`work/loopback_probe_server.py`）：HTTP/1.0＋單次大寫出後立即關閉 27/30，HTTP/1.1 keep-alive 30/30，分段 flush 30/30。前次交接記錄的「載入服務時 HTTP body 傳輸中斷」即此問題。
- 決定：`Handler.protocol_version='HTTP/1.1'`，`reply()` 以 16 KB 分段寫出並 flush；所有回應維持 Content-Length。
- 理由：避免大回應後立即關閉連線造成的 loopback 段遺失；標準函式庫即可，不加依賴。替代方案：縮小 state（仍會失敗）、前端重試（只掩蓋）。
- 後果：連線由客戶端保持；`/api/shutdown` 回覆後仍正常關閉。前端保留「連續兩次失敗才顯示斷線」作為保險。
- Verification：拋棄式實例（真實 Codex 同步、178 KB state）新連線 40/40、keep-alive 40/40、Codex 對話 853 KB 0.1–0.2 秒；後端 30/30。
