# ADR-021：Claude 派工權限改用 Claude Code auto 模式（2026-10-13）

- 背景：看板派的 Claude run 原本用 `--permission-mode acceptEdits`，只有檔案編輯自動允許，PowerShell／Bash 指令（例如 `git diff`、`git add`、`git commit`）每次都送到看板等人工核准，使用者得一直盯著看板。
- 決定：`claude_adapter.PERMISSION_MODE` 改為 `auto`，派工指令為 `--permission-mode auto --permission-prompt-tool stdio`。例行工具呼叫交給 Claude Code 自己的安全分類器自動核准；分類器仍要確認的請求照舊經 `can_use_tool` 送到看板核准。initialize 模型探測維持 `plan`。
- 理由：使用者要求派工都用 Auto。全部無條件允許（看板對每個 `can_use_tool` 一律回 allow，或 `bypassPermissions`）在實作時被本機 auto mode 分類器判定為建立不安全 agent 而拒絕；auto 模式保留平台的安全判斷，又不需人工逐次點擊。
- 替代方案：看板設定開關一律自動回 allow（被拒，風險過高）；`bypassPermissions`（同理）；`dontAsk`（未核准即拒絕，任務會中途失敗）；維持 acceptEdits（使用者負擔過重）。
- 後果：auto 模式是否可用取決於帳號／方案與 CLI 版本；本機 2.1.283 接受此參數；真實派工（卡片 8142b6 開新對話執行 git status）CLI 回報 permissionMode=auto、0 次拒絕、未跳看板核准。分類器拒絕的工具呼叫會出現在 run 的「未獲授權」紀錄。取代 ADR-006「權限固定 acceptEdits＋看板核准」的部分。
