# ADR-024：Claude 卡片專案＝App 側欄群組，無群組為「未分組」（2026-10-14）

- 背景：使用者決定沒有 Claude App 側欄群組的 Claude 卡片顯示「未分組」，不再用資料夾名；Codex 與手動卡維持「個人任務」。查證發現群組同步從未送達（正式看板 claudeGroupsAt=0、server.log 無 `/api/claude-groups`）：mod 以 `list_sessions({limit:500})` 一次讀全部，結果約 178,962 字超過引擎上限，被換成「Output has been saved to …」說明（isError=false），`JSON.parse` 失敗而被 catch 靜默吞掉。
- 決定：mod 改為 `ccd_sidebar.list_groups` 後逐群組 `list_sessions({group, limit})`；讀取失敗送 `{error}`，伺服器存 `claudeGroupsError`（最近 10 分鐘有成功同步則忽略），網頁橫幅與窗格顯示；沒有 App 連接器的 session（終端機 CLI）不送；未改變的對應每 5 分鐘重送一次作為新鮮度證明；每回合（每分鐘至多一次）也同步，不依賴窗格開著。卡片新增 `projectSource` app／manual：綁定 Claude App session 的卡片專案＝群組名或「未分組」，群組首次送達前不動（未知≠未分組）；看板上改專案即 manual；舊卡專案為資料夾／repository 名、個人任務、未分組或現有群組名時視為自動並跟隨。匯入計畫未給專案的 Claude 事項為「未分組」。API 1.11.0。
- 理由：群組是使用者在 App 裡的實際分類；資料夾名（含 worktree 隨機名）不可靠。逐群組讀取讓每次結果在數十 KB 內。錯誤可見，避免「全部未分組」卻不知原因。
- 替代方案：較小的 `limit`（只看得到最近的 session，舊 session 會被誤判為未分組）；把未知當成未分組（群組同步失敗時整批卡片被改名）；只套用新卡（使用者選擇舊卡也跟隨）。
- 後果：每次同步約 1＋群組數 次連接器呼叫（目前 39 個有 session 的群組）；單一群組超過約 200 個 session 時結果可能再次過大，會以錯誤顯示。正式服務需重啟才會套用伺服器端規則與舊卡跟隨（唯讀試算 52 張會改、0 張手動保留）。
- Verification：Python 84、mod 12、validate；真實 App 內 mod 經暫時診斷工具讀到 39 群組／200 sessions；同步後正式服務收到 `POST /api/claude-groups` 200。
