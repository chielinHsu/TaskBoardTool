# 交接（2026-10-11）：看板 mod 跨 session／跨電腦安裝腳本

## 正在做
使用者問另一台筆電 pull 後能否直接用，以及為何目前 session 看不到看板窗格。已查明原因並寫 setup-claude-mod.mjs；使用者已執行並 /reload-plugins，本 session 已載入全域 mod。使用者授權 commit 與 push。

## 已完成
- Observed Fact：mod 只裝在 `~/.claude/dev-mods/93244cc6-…/taskboard-pane`，資料夾名即建立它的 session id，所以其他 session（含本 session 1bb9f879-…）與其他電腦都不載入。usage-bar 等 mod 是靠 `~/.claude/settings.json` env.CLAUDE_CODE_PLUGIN_DIRS 載入。
- 新增 outputs/taskboard/setup-claude-mod.mjs（使用者要求改成全域）：SHA-256 比對後把來源同步到 `~/.claude/mods/taskboard-pane`（保留引擎寫入的 types／tsconfig，覆寫前備份 work/claude-mod-backups），再把該全域路徑加入 CLAUDE_CODE_PLUGIN_DIRS、設 DIR_WATCH=1，移除先前若有的專案來源路徑，其餘鍵原樣保留，寫前備份 work/claude-settings-backups，寫後回讀核對；--check 唯讀；回報 Node／Python／claude／codex／launch.json／.data／舊 dev-mods 副本；預設跑 claude plugin validate（--no-validate 略過）。
- outputs/taskboard/.gitignore 加入引擎寫入的 claude-mod/taskboard-pane/.claude-plugin/types/ 與 tsconfig.json。
- README、AI_CONTEXT 改為以此腳本為正規安裝方式；update-claude-mod.ps1 降為舊 dev-mods 流程。ADR-014。

## 驗證
VERIFIED：node --check；--check 乾跑正確偵測 6 個待複製檔案與缺少的全域路徑（exit 1），列出舊 dev-mods 副本與工具版本（Node 24.21.0、Python 3.11.7、claude 2.1.283、Codex 快取）。
VERIFIED：使用者執行腳本後 --check 回報「全域 mod 與 settings.json 已就緒」（exit 0），~/.claude/mods/taskboard-pane 存在且引擎已寫入 types／tsconfig；/reload-plugins 回報 4 plugins，本 session 出現 taskboard-pane 工具（自動模式拒絕 Claude 自行寫入，由使用者執行）。
NOT VERIFIED：筆電環境、`/plugin install --marketplace` 替代途徑、新開 session 的自動開啟窗格（本 session 為重載）。

## 下一步
1. 全域版已可用；可手動刪除 dev-mods 舊副本 93244cc6-…/taskboard-pane 避免該 session 重複載入。
2. 筆電：clone、安裝並登入 claude CLI、Python 3、Node 22+，執行同一腳本；之後每次 pull 後重跑同步全域副本。Codex 側需 Store App。.data 不同步，為空白看板。
3. 未知 .codex/ 未納入 Git，是否版控由使用者決定。
4. 後續推送可沿用 `git -c http.sslBackend=schannel`；若要永久修正需使用者自行決定是否改 gitconfig。

## 相關檔案
outputs/taskboard/setup-claude-mod.mjs、.gitignore、README.md；AI_CONTEXT.md；docs/current-status、changelog-ai、decisions（ADR-014）。
舊副本：~/.claude/dev-mods/93244cc6-c0a4-4bbe-b655-dc0052dbb963/taskboard-pane。

## 不要動
未知 .codex/、真實 .data／profile／認證、一般 App、官方安裝檔、使用者 settings.json 其他鍵；不直接編輯 SQLite。stage 明列路徑。

## 發布
本機 master c9b3519（作者以 -c 一次性指定 Caspar Hsu，未改全域 Git 設定）。Git HTTPS 以 OpenSSL 後端失敗（unable to get local issuer certificate），改以 `git -c http.sslBackend=schannel` 一次性使用 Windows 憑證庫，未修改 gitconfig。依 ADR-013 以 commit-tree 在 origin/main 99b12d7 之上建立同樹快照 cf3f1cf 並 fast-forward 推送 main；fetch 回讀 tree 51dd2bca 與本機 HEAD 一致（VERIFIED）。

## 未提交變更
本節發布紀錄待提交；.codex/ 仍為未追蹤。

## 已知問題與未驗證事項
mod 的 AbovePrompt 重開列依賴前面的 mod 呼叫 next(e)；筆電若有其他 band mod 需同樣處理。dev-mods 舊副本與新路徑在 session 93244cc6 內會重複載入，需人工刪除。
