# ADR-004：任務承載簡介、逐次回報與多個 session（2026-10-10）

- 背景／Evidence：使用者指定卡片主區顯示簡介、左側屬性與分類的多 session 清單，成果不符可再次對話；舊版只有最新 result 與 workerThreadId，重試清空結果。儲存時不建立聊天的設計已獲使用者確認。
- 決定：JSON body 增加 append-only 的 runs 與單筆 nextRun；明確後續需求排入待辦，start 才新建／resume；按 thread 分類各輪回報，全部歷史 thread ID 參與去重。唯讀卡片按需閱讀最近需求／回報，明確匯入後才可派工。
- 理由：一張任務卡保存跨對話的執行脈絡，仍保持單一 scheduler 與人工驗收。替代方案每次另建卡片會分散任務；只保存留言或事件會欠缺每次需求／thread／cwd 對應且事件清單有 300 筆上限。
- 後果：舊資料相容讀取、不背景寫入；已被舊版覆蓋的結果不推造。後續需求需版本與 thread 歸屬檢查、活躍訊號保護；來源只在明確送出延續需求後續跑。新對話帶原需求與有限回報摘要，對話保留在原 session，介面讀取最近 20 回合；原生 Project ID／側欄歸屬不宣稱已驗證。
- Verification：隔離後端 13/13（含原 session 6 項）；專用 App 的隔離真實 DOM／模擬 RPC 驗證簡介、左側屬性、專案預填、多 session、同／新對話、回報保存、未儲存保護、唯讀及窄螢幕；不耗模型額度。官方契約依 [App Server](https://learn.chatgpt.com/docs/app-server)，真正模型派工與側欄歸屬 NOT VERIFIED。
