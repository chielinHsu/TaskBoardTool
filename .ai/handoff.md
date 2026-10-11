# 交接（2026-10-11）：86d197a4fe25 Claude 快照修正與授權推送

## 正在做
Claude 舊安裝副本已同步；使用者已授權公開 main。Git 缺認證，改用已授權 GitHub 連接器發布提交快照並核對檔案樹。

## 已完成
- master 69a7434 為本輪原 HEAD；origin 為使用者指定 TaskBoardTool，重新 ls-remote 無 ref。
- App dev-mods 副本 register.tsx／types 與 2a2609d 一致且非連結，已確認舊畫面的檔案來源。
- taskboard-pane 0.1.1；update-claude-mod.ps1 限定目前使用者 dev-mods、唯一副本／身分，僅同步已知五檔，差異先備份 work、更新後雜湊，保留 tsconfig。
- 同步前 -Check 找四個舊檔，同步後一致；模擬 UI 增加明確列管／無積壓斷言。說明、ADR-012、架構與協作文件已更新。
- 保留既有拖曳／auto_review／專案候選／路徑同步／原生資料夾功能；未改真實 DB、認證或官方 App。

## 驗證
VERIFIED：來源及安裝副本各 6/6 模擬測試、validate、同步 -Check／重複同步、PowerShell 語法。
VERIFIED：技能同步／-Check 一致、Strict 0 失敗／0 警告、路由 74/74、git diff --check；77 檔常見憑證模式無命中（有限模式掃描）。
PARTIALLY VERIFIED：App 檔案更新且與來源一致，但 Computer Use 未取得 Claude 控制許可，不能代為開啟／熱載入／驗證畫面。
先前 VERIFIED：後端 46/46、主題 7/7、專案三組／拖曳六組／詳情隔離 DOM、opaque iframe。

## 下一步
1. 使用者外部傳送授權已取得，不再詢問；Git push 缺認證，改以連接器建立 main，不 force。
2. GitHub API 與 git fetch 回讀 main，核對遠端 tree SHA 與本機 HEAD tree；完整本機歷史保留 master。
3. App 需人工 /reload-plugins、/taskboard 驗收；工具無 Claude 控制許可，不可稱畫面已驗證。
4. 本任務結束、無執行卡片後再重啟正式服務載入 folder API；原生視窗實際點選仍待驗證。

## 相關檔案
outputs/taskboard/update-claude-mod.ps1、claude-mod/taskboard-pane/.claude-plugin/plugin.json、hooks/taskboard.test.ts、README；AI_CONTEXT、docs/architecture、decisions、current-status、changelog-ai。
安裝副本：.claude/dev-mods/93244cc6-c0a4-4bbe-b655-dc0052dbb963/taskboard-pane；備份 work/claude-mod-backups（不進 Git）。

## 不要動
未知 .codex/、真實 .data／profile／認證、一般 App、官方安裝檔；不直接編輯 SQLite。stage 明列路徑，不 git add .／git add -A、不 force。

## 未提交變更
41c6fd5 已提交 manifest／測試、同步腳本與文件；發布方式說明待提交。未知 .codex/ 保留，遠端狀態以 Git／發布紀錄為準。

## 實際失敗與限制
Git push：Cannot prompt／unable to get password；GitHub 連接器有 push 權限。連接器產生獨立雲端提交，不能宣稱原 Git 歷史已推送。Computer Use 拒絕 Claude 控制，未嘗試繞過。rg 不在 PATH，改 Select-String；installed_plugins.json 不存在，依實際 dev-mods 找到副本。文件更新初次因 PowerShell 5.1 管線非 UTF8 比對失敗，未寫檔，設 OutputEncoding 後修正。
同名專案多路徑不任意選第一筆；backlog 不遷移、歷史文案不改寫；不以靜態／模擬驗證宣稱 App 已熱載入。
