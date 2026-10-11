# Codex／Claude 共用協作入口

非單純任務依序讀取 `AI_CONTEXT.md`、`.agents/harness/engineering-workflow.md`、`.agents/harness/project-rules.md`、`.ai/handoff.md`、`docs/current-status.md`。架構變更加讀 architecture／decisions；其餘依 Context Routing 載入。

- 回應與文件使用繁體中文，保留來源不明的未提交修改。
- 不改真實任務資料，不複製認證資料，不改官方 App 安裝檔。
- Git 沿用目前 repository；stage 明列路徑，禁止 git add .、git add -A；commit、push、發布依本次實際授權。
- 共用技能唯一來源 .agents/skills；Claude 鏡像由同步腳本產生。
- 有意義變更後使用 .agents/skills/ai-handoff/SKILL.md 的 ai-handoff 流程，更新交接、狀態、changelog，有決策則新增 ADR。
- 靜態檢查通過不等於平台實際載入；明列失敗與未驗證能力。

Codex 自動讀取本檔，不解析 Claude 的 @ 匯入，也不載入 .claude/agents 或 Claude hooks；CODEX.md 是人類索引。
