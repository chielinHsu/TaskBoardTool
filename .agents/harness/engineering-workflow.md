# 共用工程流程

開始先確認根目錄、Git repository／分支與未提交修改。缺 repository 才 git init，不建立巢狀庫，不改全域 Git 設定。

- 問答／狀態：理解 → 查證 → 回報。
- 診斷：證據 → 重現 → 追查根因 → 回報。
- 修改：理解 → 探索 → 決策審查 → 計畫 → 實作 → 驗證 → 審查 → 交接。
- 效能：基準 → 量測 → 瓶頸 → 修改 → 再量測。

區分 Observed Fact、Hypothesis、Conclusion。對受影響的架構、契約、資源生命週期、並行、安全、效能與相容性記錄 Decision、Evidence、Verification。
跨函式、模組或執行緒變更保存依實際程式碼推導的前後 Mermaid 圖；局部修改不強制。驗證指令用 AI_CONTEXT.md 與實際檔案。
採 VERIFIED、PARTIALLY VERIFIED、NOT VERIFIED；實際失敗另外明列。
只在獨立子任務、可平行處理、大量整理或不同推理需求時委派；小任務主 agent 處理。委派提供目標、範圍、檔案、驗收、證據、失敗紀錄，主 agent 核對重要结論。
收工依 ai-handoff 更新交接、狀態、changelog 與必要 ADR。commit、push、部署與額度測試依當次授權。
