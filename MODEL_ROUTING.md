# Claude 模型路由（擴充版本 1.0）

僅適用 Claude Code 的五級角色；Codex 不載入此 hook。這是建議机制，不會切換主 session 的模型或 effort。主 agent 依實際內容重新判斷，小任務直接處理。

| Agent | model | effort | 界線 |
|---|---|---|---|
| fast-worker | haiku | low | 明確唯讀查詢，不寫入或執行 shell |
| developer | sonnet | medium | 既有架構的一般實作 |
| developer-deep | sonnet | high | 低風險複雜實作或高驗證成本 |
| architect | opus | high | 高風險分析與計畫，唯讀 |
| architect-deep | opus | xhigh | 高風險且高度不確定分析，唯讀 |

本機 Claude CLI 2.1.283，官方文件支援 model 別名與 effort 欄位；實際模型解析、帳號可用性與 effort 生效尚未驗證，尤其 haiku 能力依 alias 解析結果。官方參考：[subagent frontmatter](https://code.claude.com/docs/en/sub-agents)。不要宣稱靜態檢查已證明平台生效。

## 評分與判斷

複雜度／風險／推理／不確定性各 1–5，每項取命中最高值，不累加。範圍 single-file／module／cross-module／unknown；驗證成本 low／medium／high。

- 1：局部文字、已知事實；2：既有行為；3：一般功能、API、排程；4：跨環境 iframe／啟動器整合、安全／資料與生命週期、設計推理；5：全面重寫、不可逆資料、發布、嚴謹證明、偶發且不可重現。
- 高風險：CDP、capability、CSP、sandbox、認證、SQLite migration、權限、資料完整性與並行生命週期。Appearance 明暗、自訂色彩、截圖、重開與效能為 high 驗證。

| 軸 | 本專案命中條件（其餘預設 2） |
|---|---|
| 複雜度 | 1 錯字；3 新增功能／API；4 iframe、啟動器、跨模組整合；5 全面重寫 |
| 風險 | 1 錯字；3 HTTP／API／排程；4 CDP／capability／SQLite／權限；5 刪除卡片資料庫／profile、覆寫或發布 |
| 推理 | 3 一般除錯／失敗；4 根因／設計／競爭條件；5 安全模型／一致性模型證明 |
| 不確定性 | 4 未知／平台限制／版本差异調查；5 偶發／無法重現／原因不明 |

依序判斷：明確純唯讀且無分析／設計 → fast-worker；風險 ≥4 且推理 ≥5 或不確定性 ≥4 → architect-deep；其餘風險 ≥4 → architect；複雜度／推理／不確定性任一 ≥4 或 high 驗證 → developer-deep；其餘 developer。

## 本專案案例

| 需求 | 建議 |
|---|---|
| 列出 outputs/taskboard/index.html 的表單欄位 | fast-worker |
| 找出 server.py 的排程函式 | fast-worker |
| 修正 README.md 的錯字 | developer |
| 在 index.html 調整按鈕間距 | developer |
| 修改 iframe 主題同步，驗證明暗與自訂色彩 | developer-deep |
| 修改 CDP capability 權限檢查 | architect |
| 新增 SQLite migration | architect |
| 分析 CDP 重開後偶發空白的根因 | architect-deep |

## 升降級與委派

同一問題兩次有證據、有不同方法的有效失敗升一級，重複做法不算。hook 只計明確標記：`[router:fail] attempt=唯一嘗試ID; evidence=具體失敗證據; change=本次方法調整`；普通「還是不行」只作需求，不自動累積。
下限保留至 `[router:resolved]`／已解決；`[router:reset]` 清除。最高級兩次失敗標記 maxed，由主 agent 整理證據／排除假設／缺少資訊交使用者决定。
只在獨立或可平行子任務、大量整理、不同推理需求時委派。提供目標、範圍、檔案、驗收、證據及失敗紀錄；所有 subagent 不再委派、不 stage／commit／push，不覆蓋未知修改。主 agent 核對結論。

**規劃與進度由主 agent 寫（AI 結構 3.0.0）**：architect／architect-deep 唯讀、只回傳計畫（細項編號 `Rnn.m`、檔案、順序、驗證方式）；由主 agent 把計畫寫進 `docs/plans/active/<ID>-<slug>/` 的 `plan.md` 細項表與 `docs/plans/INDEX.md`，再交給 developer 系列或自己實作。subagent 不直接修改這些文件，實作完成時在回報裡逐項列出結果，由主 agent 更新狀態。委派 prompt 要寫明「回覆使用繁體中文（zh-TW）」。

## 功能展開 → 看板計畫匯入

計畫的細項表（repository 內的文件，換 session 也看得到）是需求的單一事實來源；下面的看板匯入是額外把細項排進任務看板自動派工，兩者不互相取代。


把一個功能展開成事項後，不要只在對話裡列清單：依上表為每個事項評分、決定角色，再把整份計畫匯入任務看板，讓自動派工依序執行。

- 每個事項一張**積壓**卡片；Claude Code 事項帶 `role`，看板依本表對應 `model`／`effort`（fast-worker=haiku/low、developer=sonnet/medium、developer-deep=sonnet/high、architect=opus/high、architect-deep=opus/xhigh），明確給 `model`／`effort` 可覆蓋；Codex 事項只保存角色標籤，模型沿用 Codex 設定。
- 有先後關係的事項用 `dependsOn` 指向前置事項的 `key`；看板建立有向依賴，排程跳過仍被阻擋的卡片，前置卡片**全部驗收完成（已完成欄）**後，被阻擋的卡片自動從積壓排入待辦，自動派工時接著執行。循環依賴會被拒絕。
- 卡片依依賴順序建立（createdAt 單調遞增），同優先級時排程順序即計畫順序；需要插隊再給 `priority`。
- 匯入途徑：Claude Code 對話呼叫看板工具 `import_plan`（taskboard-pane mod）；Codex 或終端機執行 `python outputs/taskboard/plan_import.py plan.json`；或在網頁看板按「匯入計畫」貼上 JSON。格式見 plan_import.py 檔頭。
- 匯入只建立卡片，不派工、不耗額度；真正執行仍由排程或「開始執行」觸發，完成後進待審核等人工驗收。

## hook 狀態與驗證

UserPromptSubmit 經 .claude/settings.json 接線；僅本機規則，不呼叫 API。狀態依專案／session hash 隔離；`TASKBOARD_ROUTER_DISABLED=1` 停用，`TASKBOARD_ROUTER_STATE_DIR` 自訂路徑。預設 OS 暫存目錄。通知、slash、其他事件、壞輸入、損壞狀態與寫入失敗不阻斷需求。

`node scripts/ai/check-model-routing.mjs` 驗證五級、角色工具邊界、hook 接線、狀態與失敗流程；不耗額度。
`node scripts/ai/bench-model-routing.mjs` 預設只顯示計畫。實際執行需當次使用者授權、`TASKBOARD_ROUTER_BENCH_AUTHORIZED=1` 及 `--run`；結果寫 .ai/bench，记录實際 model／effort／時間／tokens／可取得費用，缺資料 n/a。不假裝測量值已生效。
