# ADR-013：Git 認證缺失時使用 GitHub 連接器發布提交快照（2026-10-11）

- 背景：使用者已授權 TaskBoardTool 公開 main；Git push 缺本機認證失敗，但既有 GitHub 連接器具有寫入權限，目的儲存庫尚無提交。
- 決定：僅從已提交 HEAD 擷取受版控檔案，使用 GitHub Git data API 建立檔案樹與獨立提交，正常建立／更新 main；回讀並比較 tree SHA。本機 master 與歷史保留，origin/main 供雲端追蹤。
- 理由：完成已授權發布而不複製憑證、不要求輸入 token、不改全域 Git 設定、不強制覆寫。
- 替代方案：等待使用者登入本機 Git 後原生 push；逐檔 contents API 會產生多個中間提交，不採用（僅空庫 README 初始化）。
- 後果：雲端包含完整目前檔案但不包含原本本機提交歷史，雲端 commit SHA 與本機不同、tree SHA 應相同。後續原生 push 需先登入並協調兩份歷史，禁止直接 force；發布驗證需說明此界線。
