---
name: ai-handoff
description: 本專案有意義修改完成或需要交接時，依 Git diff 與實際驗證更新交接、狀態、AI changelog 與必要 ADR。
---

# AI 交接
蒐集 git status --short --branch、git diff --stat、相關 diff 與實際驗證結果，不用推測補上成功。
覆寫 .ai/handoff.md，保持 60 行內：正在做、已完成、下一步、相關檔案、不要動、已知問題、未提交變更、假設與未驗證事項。
原地更新 docs/current-status.md；changelog-ai 新增置頂。有設計決策時 decisions 新增置頂 ADR，含背景、決定、理由、替代方案、後果。
入口或技能修改後執行結構檢查；共用技能只改 .agents/skills，再用 sync-skills.ps1 產生鏡像並執行 -Check。
記錄 VERIFIED／PARTIALLY VERIFIED／NOT VERIFIED，另列實際失敗；不因交接自行 stage、commit、push、傳送訊息或發布，依當次授權。
保留來源不明的未提交修改。驗證與 Context Routing 見 AI_CONTEXT.md。
