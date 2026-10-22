# ADR-008：計畫匯入、有向依賴與完成後自動釋放（2026-10-11）

- 背景／Evidence：使用者要求功能展開後自動建卡、Claude Code 事項依 MODEL_ROUTING 角色設定模型與推理強度、有先後關係的事項建立依賴並在前置完成後自動推進。ADR-005 曾排除阻塞關係，當時沒有自動派工依序執行的需求；現在排程會從待辦取卡，缺少依賴會讓後續事項提前執行。
- 決定：新增 `task_dependencies(blocker_id, blocked_id)` 有向表，與對稱的 `task_relations` 並存；API 投影 `dependsOn`／`blocks`，寫入時檢查自我／循環／不存在，端點版本互相 bump。排程與 `start()` 跳過或拒絕仍有未完成前置的卡片；卡片進入 `done`（人工驗收）時 `release_dependents` 把前置全完成的積壓卡片移到待辦並留言，自動派工時接續執行。新增 `effort` 欄位（Claude 以 `--effort` 傳入，啟動前以 initialize 目錄的 `supportedEffortLevels` 驗證，不支援即失敗而非靜默降級）。`POST /api/plans` 以 Kahn 排序建立卡片、`ROLE_ROUTING` 對應角色、`plan{id,name,key,role}` 保存來源、label 帶計畫名與角色；提供 plan_import.py、網頁「匯入計畫」與 mod 工具 `import_plan`。失敗 run 的重試改用卡片目前的 model／effort（同工具），讓修正生效。export schema 5、API 1.5.0。
- 理由：依賴必須有方向才能驅動排程；釋放條件採「已完成」而非「待審核」，保留人工驗收作為前後事項之間的閘門；角色對應集中在伺服器，三個入口共用同一規則。替代方案：用優先級模擬順序（無法阻擋）、在 agent 端逐張呼叫建立 API（失去原子性與循環檢查）。
- 後果：被阻擋卡片即使手動移到待辦也不會被排程領取；刪除前置卡片會解除依賴；Codex 側無 effort；釋放只把卡片放入待辦，手動模式仍需人按開始。
- Verification：後端 36/36（含計畫匯入順序／角色對應／循環與錯誤拒絕、阻擋與自動釋放、依賴驗證與刪除清理、effort 驗證與 `--effort` 傳參、舊資料相容）；專用 Codex App 真實 DOM 測試含計畫匯入、阻擋徽章、驗收後釋放、依工具顯示推理強度；mod `plugin test` 3/3（含 import_plan 工具）。真實 Claude `--effort` 派工 NOT VERIFIED（未再耗額度）。
