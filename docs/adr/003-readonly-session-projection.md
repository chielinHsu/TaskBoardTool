# ADR-003：既有 session 的唯讀同步投影（2026-10-10）

- 背景／Evidence：只手動匯入積壓；實測獨立 app-server 將本工作聊天回報 notLoaded，回合查詢回 interrupted，不能當跨程序真實 runtime；JSONL 有回合開始／活動／結束訊號。
- 決定：官方 thread/list metadata 加受限本機 JSONL 尾端，背景同步記憶體，API state 衍生唯讀卡片並依來源 ID 去重。近期訊號明列推論、過期／未知待確認、回合結束不宣稱已驗收。
- 理由：反映既有工作並保留 scheduler／DB 邊界。替代方案自動寫入 SQLite 會污染任務／事件並可能重複派工；直接接其他 App 私有 runtime 缺穩定公開介面。
- 後果：不含雲端／其他主機／subagent；不判定視窗開啟或精確跨程序核准。每檔 256 KiB，10 分鐘活動、60 秒快照新鮮度，錯誤保留；未知格式待確認。
- Verification：隔離 6/6、實際 App 86 張自動卡片／聊天閱讀／保存資料不變通過。介面依 [官方 App Server 文件](https://learn.chatgpt.com/docs/app-server)；JSONL 是本機觀察，非官方跨程序狀態契約。
