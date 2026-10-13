# 交接（2026-10-13）：GitHub AI PR／CI 與 Pages 展示

## 正在做
獨立 clone／feat/ai-cicd-pages-demo 分支；使用者選擇 Claude 實作、Codex 審查，成功後自動合併／發布。

## 已完成
- 跨平台 CI、Chromium 展示驗證、三種路由、維護者 Issue 指令與手動派工。
- 模型 job GitHub 唯讀；独立 job 驗證 JSON 後建立 PR，明確 dispatch CI。
- 成功 CI 後只讀 diff，合法核准／最新 SHA／範圍 gate 再合併、dispatch Pages。
- Pages 沿用看板 UI，獨立範例 API／localStorage；派工模擬，不連模型／真實資料。
- 設定見 docs/github-automation.md；ADR-022 與架構圖記錄邊界。

## 驗證
- VERIFIED：Python 77、Node 30、路由 74；合併 API mock 通過。
- VERIFIED：Chrome 子路徑、CRUD、重新載入、模擬派工、拖曳、對話、心智圖、375px、零 API。
- 實際失敗：展示建置 root 尾端分隔符比對錯誤，已修正通過建置／瀏覽器驗證。
- 實際失敗：既有 handoff 65 行超過 60；本輪以新交接取代，歷史保留在 current-status／changelog。
- NOT VERIFIED：真實 Claude／Codex 模型與自動合併端到端，需要 GitHub Secrets。
- GitHub CI run 38383501615 的三項檢查通過；actionlint 與 Strict 檢查通過；Pages 於合併後發布。

## 下一步
驗證合併 API mock、workflow 格式與 AI 結構，建立 PR，跑 GitHub CI 後發布。
使用者設定兩種工具的 Secrets，再以小 Issue 做模型端到端验收。

## 不要動
真實卡片、SQLite、session、認證、正式本機服務、官方 App；不提交 work/ 或 vendor/。
既有 App 未驗證事項見 current-status，不能因本輪 CI 宣稱桌面整合已驗證。

## 相關檔案
.github/workflows、.github/ai、scripts/ci、sites/demo、tests/ai-automation.test.mjs、tests/taskboard-demo.test.mjs。
scripts/ai/check-ai-structure.ps1 加入 Linux pwsh fallback；共用技能與鏡像不變。

## 未提交變更／假設
本 clone 原本乾淨，本輪變更待提交；舊 handoff 的未提交資訊屬歷史，不代表此 clone。
Pages 只發布展示，完整後端仍本機執行；敏感改動人工核准。
