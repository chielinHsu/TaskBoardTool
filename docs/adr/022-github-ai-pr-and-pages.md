# ADR-022：GitHub AI 自動 PR 與 Pages 展示（2026-10-13）

- 背景：使用者要求各工具單獨可用、搭配時 Claude 實作／Codex 審查，成功後 AI 核定、合併、發布。Pages 無法執行本專案 Windows Python／SQLite／CLI 後端。
- 決定：AI_MODE 三種路由；維護者 Issue 指令／workflow_dispatch。模型 job GitHub 唯讀，輸出完整檔案 JSON，獨立 job 驗證後建立 PR。成功 CI 後只讀 diff，合法核准／最新 SHA／CI／範圍 gate 才帶 SHA squash merge，明確 dispatch 後續 CI／Pages。
- Pages：原 index.html 加展示資料層，範例只存 localStorage，派工固定模擬；只發布三個靜態檔。
- 理由：單一 UI 來源，沿用原生 JS／Python，模型不持有 repository 寫入權限，發布端不執行產物；敏感權限邊界保留人工確認。
- 替代方案：整個 repository 上 Pages（後端不能工作、複製無關檔案）；AI 推 main（缺 PR／可靠 gate）；同一 bot Approve 自己（GitHub 不允許）；完整 SaaS 後端（超出展示範圍）。
- 後果：需要供應商 Secrets；沒有認證／不確定就停止，不做無限修復迴圈。Playwright 只為隔離 CI dev 依賴，不改看板 runtime。
- Verification：Python 77、Node 30、路由 74、Chrome 展示通過；真實模型／自動合併 NOT VERIFIED，待 Secrets。GitHub Windows／Ubuntu／瀏覽器 CI 已通過（run 38383501615）；Pages 於 main 合併後發布。
