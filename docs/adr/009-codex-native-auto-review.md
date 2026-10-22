# ADR-009：Codex 原生自動審核（2026-10-11）

- 背景／Evidence：使用者要求看板自動派工時不要逐次人工核准工具操作。原 CodexAdapter 固定 user 審核；本機 codex-cli 0.162.0-alpha.17.2 的 ThreadStartParams／ThreadResumeParams／TurnStartParams 支援 auto_review。[官方設定文件](https://learn.chatgpt.com/docs/config-file/config-reference) 列出 approvals_reviewer，指出審核者與 sandbox 限制為不同設定。
- 決定：在 thread/start、thread/resume、turn/start 指定 approvalsReviewer=auto_review；保留 approvalPolicy=on-request、workspace-write、networkAccess=false。由原生審核者依風險決定，拒絕不轉成自動 accept。
- 理由：例行命令可自動審核，同時維持工作目錄與網路邊界；新建與續跑都必須明確指定，避免沿用舊 user 設定。
- 替代方案：approvalPolicy=never 會拒絕受阻操作；danger-full-access 或看板無條件回答 accept 會取消目前邊界；因此不採用。Claude 的權限協定不同，不順帶改動。
- 後果：例行工具核准由原生審核者處理；資料／帳號選擇、工具要求本人輸入及卡片成果驗收仍保留。版本不支援時應報錯，不默默放寬權限。重新載入服務時保留原 run，以既有 session 接續當前任務。
- Verification：隔離後端 42/42；本機 schema 支援三個設定邊界；正式服务已載入新 adapter、原任務 followup 執行且當時人工核准清單為空，已有 2 個命令完成。並未全面覆蓋所有風險審核情境。
