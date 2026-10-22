# ADR-010：嵌入看板的滑鼠拖曳（2026-10-11）

- 背景／Evidence：使用者要求滑鼠拖曳卡片切換狀態。既有 HTML5 drag/drop 的來源 DOM 每 2.5 秒由輪詢重建；內嵌看板使用 opaque iframe 與 capability RPC，操作需在此環境驗證。
- 決定：用 Pointer Events 在 6px 移動後開始拖曳，board 捕捉指標；clone 顯示浮動預覽、elementFromPoint 找目標欄、RAF 執行邊緣捲動。拖曳期間持續更新 state，延後卡片 DOM 重建，放開以版本檢查防止舊卡片覆蓋新狀態。
- 理由：不新增依賴，能從標題起拖並保留普通點擊、取消與失焦清理；沿用既有 PATCH／start，保留單一派工、前置限制與已完成驗收。替代方案：只修 HTML5 重建時機仍需依賴瀏覽器原生 drag 在 iframe 的行為；加入拖曳套件對本次需求過重。
- 後果：滑鼠可移動已保存且未執行的卡片；唯讀同步需先匯入。進行中呼叫 start 且不 force，done 要 confirm；拖曳時最新進度到結束後才重畫卡片。觸控拖曳不在本次範圍。
- Verification：隔離真實滑鼠驗證跨輪詢／reload、取消、普通點擊、唯讀／執行中／版本、驗收、模擬派工、前置阻擋、窄視窗捲動（背景 RAF 顯式推進）、opaque iframe RPC；詳情及專用 App 回歸通過，主題 7/7、後端 42/42。真實任務拖曳派工 NOT VERIFIED。
