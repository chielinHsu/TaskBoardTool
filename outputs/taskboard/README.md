# Caspar 的任務看板

## Claude Code App 內的看板窗格（mod）安裝

mod 原始碼在 `claude-mod/taskboard-pane/`，但 Claude App 不會因為 clone／pull 專案就載入它。安裝方式與 usage-bar 等全域 mod 相同：複製到 `~/.claude/mods/taskboard-pane`，再把這個全域路徑登記到使用者層 `~/.claude/settings.json` 的 `env.CLAUDE_CODE_PLUGIN_DIRS`（Claude App 啟動的每個 session 都會讀取；專案層 settings 不行；不依賴專案 clone 在哪裡）。在專案根目錄執行：

```powershell
node outputs/taskboard/setup-claude-mod.mjs
node outputs/taskboard/setup-claude-mod.mjs --check
```

腳本以 SHA-256 比對後只覆寫有差異的來源檔案，保留引擎寫入的 `.claude-plugin/types/` 與 `tsconfig.json`，覆寫前備份到 `work/claude-mod-backups`；settings.json 只改 `CLAUDE_CODE_PLUGIN_DIRS`／`CLAUDE_CODE_PLUGIN_DIR_WATCH` 兩個鍵、其餘原樣保留，寫入前備份到 `work/claude-settings-backups`，若先前登記過專案來源路徑會移除以免重複載入；同時回報 Node／Python／Claude CLI／Codex 是否齊全、`.claude/launch.json`、舊的 session 專屬 dev-mods 副本，並以 `claude plugin validate` 做靜態檢查（不耗額度）。設定只對**新啟動**的 session 生效：重開 Claude App 或開新 session 後窗格會自動出現，關閉後輸入 `/taskboard` 重開。之後 `git pull` 更新專案後重跑同一支腳本即同步全域副本（已載入全域版的 session 會熱重載）。若改用 `--plugin-dir` 直接載入來源資料夾，引擎會在其中寫入 types／tsconfig，已列入 .gitignore。另一台電腦 clone 後除了這支腳本，還需要安裝並登入 Claude Code CLI（`claude auth login`）、Python 3、Node 22+；Codex 側才需要 Microsoft Store Codex App。看板資料庫 `.data/` 不在 Git 內，新機器是空白看板。

Claude App 的「開發 mod」機制會把安裝副本放在 `~/.claude/dev-mods/<建立它的 session id>/taskboard-pane`，**只在那一個 session 載入**；改用上述設定後該副本已多餘，確認新路徑可用後可手動刪除。以下舊流程只服務仍在使用 dev-mods 副本的情況：

Claude App 若仍顯示舊名稱「積壓」，是 dev-mods 安裝副本尚未同步。更新專案後，在專案根目錄執行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File outputs/taskboard/update-claude-mod.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File outputs/taskboard/update-claude-mod.ps1 -Check
```

腳本只更新目前使用者 `.claude/dev-mods` 中唯一的 `taskboard-pane` 副本，更新前備份差異檔至不進 Git 的 `work/claude-mod-backups`，更新後核對雜湊；若找到多個副本，需用 `-InstalledModPath` 明確指定。已開啟的 Claude Code App session 接著輸入 `/reload-plugins`，再用 `/taskboard` 重開窗格。只按窗格的「重新整理」不會重新載入外掛程式；目前外掛版本為 `0.1.1`。

2026-10-11 更新：看板同時支援 **Codex** 與 **Claude Code** 兩種執行工具，共用同一個 SQLite、排程與介面。卡片右側新增「執行工具」選單，模型選單依工具從真實來源讀取（Codex `model/list`；Claude Code CLI 的 initialize 握手，不送 prompt、不耗額度）。卡片、每次 run、同步追蹤卡片與對話都標示來源工具；舊卡片讀取時一律視為 Codex，不改寫資料庫。

Claude Code 的整合方式是 **CLI 整合**：看板在工作資料夾執行 `claude -p --input-format stream-json --output-format stream-json`，新對話用 `--session-id`，延續用 `--resume <session>`，模型以 `--model` 傳入，權限採 `acceptEdits` 並把工具呼叫核准請求送到看板「狀態列表」。執行結束進入待審核；停止時先送 interrupt，逾時才結束程序；程序異常結束或服務重啟都保存為中止／失敗，不會偽造完成。限制與未驗證事項：

- **Claude Code App 內的入口（mod）**：`claude-mod/taskboard-pane/` 是 Claude Code 官方 mods 機制的外掛，載入後會在 Code 分頁旁停靠一個「任務看板」側邊窗格（session 開始自動開啟；關閉後輸入框上方會多一列「▦ 任務看板」按鈕，按它、在空的輸入框按 **9**、或輸入 `/taskboard` 都可重新開啟。鍵綁定檔只能對應引擎內建動作，無法指派真正的快捷鍵。輸入框上方的位置由所有 mod 共用：本 mod 會把其他 mod 的列一起畫出，但排在前面的 mod 也必須呼叫 `next(e)` 往下傳，否則這列不會出現——使用者的 `usage-bar` mod 已改為往下傳），以原生元件顯示派工卡片、工具徽章、核准請求，並提供重新整理、自動／手動派工、開始執行、停止、驗收完成、核准／拒絕與開啟完整看板的按鈕；「＋ 新增任務」可直接在窗格建立卡片（標題、單行需求、執行工具、模型、優先級、列管／待辦、專案、工作資料夾，可「建立並開始執行」）。資料來自同一個 loopback 服務。mods 只能畫 Box／Text／Button 等原生元件，沒有網頁內嵌，也不能在 App 最左側的導覽清單（New／Artifacts／…）新增項目，所以完整的新增任務、後續需求與對話閱讀仍在網頁版。安裝：執行 `node outputs/taskboard/setup-claude-mod.mjs` 複製到全域 `~/.claude/mods/taskboard-pane` 並登記到 `~/.claude/settings.json` 的 `CLAUDE_CODE_PLUGIN_DIRS`（見本檔開頭）；`/plugin install taskboard-pane --marketplace <本機 claude-mod/taskboard-pane 路徑>` 為替代途徑，本機未實測。
- 看板**不內嵌**於 Claude App 的網頁層（Claude App 沒有像 Codex 專用 profile／CDP 那樣的嵌入入口）。可用方案：`start.ps1` 開啟的瀏覽器版、或在 Claude App 的 Code 分頁用內建 Browser 窗格開啟 `http://127.0.0.1:47824`（專案根目錄 `.claude/launch.json` 提供 `taskboard` 設定，附掛既有服務）。這與 Codex 專用視窗的側欄嵌入不同，沒有側欄入口。
- 看板派工產生的 Claude session 存於 `~/.claude/projects/`，可用 `claude --resume <session>`（對話視窗提供複製）在終端機延續；Claude App 的 `/resume` 清單依官方文件會列出本機 CLI sessions，但 `-p` 建立的 session 是否出現未實測。`claude://` 深連結只支援 App 自己的 `local_<id>` session，不能開啟看板建立的 session。
- 真實派工已驗證（haiku、隔離看板）：首次執行與同 session `--resume` 後續需求都正確完成並回報；非唯讀 Bash 指令會以核准請求出現在看板「狀態列表」，核准後才執行（`git status` 等唯讀指令由 CLI 自動允許，不會提示）。若 CLI 尚未登入，派工會以「Failed to authenticate」失敗進待審核；請先在終端機執行 `claude auth login`。control_request／control_response 的訊息格式沒有公開文件，依 Agent SDK 與本機 2.1.283 實測；CLI 改版時可能需要調整，失敗會以錯誤顯示。
- Claude App 的 Code sessions 以唯讀方式同步：讀 `claude-code-sessions\*\*\local_*.json` 的標題／資料夾／模型／活動時間（Store 版 Claude App 的 AppData 被 MSIX 虛擬化，檔案實際在 `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\claude-code-sessions`，看板先找這裡、再找 `%APPDATA%\Claude\`；橫幅顯示「資料未找到」時會附上實際檢查的路徑），以及對應 transcript 尾端 256 KiB 的回合訊號（官方標示 transcript 格式為內部格式，解析為盡力而為）。封存的 session 不列出；同步不寫入任務資料庫、不派工。
- 看板 HTTP 服務改為 HTTP/1.1 keep-alive 並分段寫出回應：先前大回應（session 清單、長對話）約 10% 會在 19 秒後連線重置，現已修正（ADR-007）。
- **工具篩選與 Claude App 群組**：工具列新增「全部工具／Codex／Claude Code」篩選，專案選單依工具分組（Codex 專案／Claude Code 專案）並只列所選工具的專案；搜尋也可輸入工具名。Claude App 的側欄群組（例如「交易工具」）不存在於任何磁碟檔案，看板本身讀不到；由 App 內的看板窗格 mod 透過 App 的 session 連接器讀取 `{session → 群組}` 並回報到 `POST /api/claude-groups`（開啟窗格、每 60 秒、按「重新整理」時），看板把群組名當作該 Claude session 卡片的專案名，沒有群組的 session 退回資料夾名；對應保存在設定中，重啟仍在。沒有在 Claude App 內開過看板窗格時，Claude 卡片的專案就只會是資料夾名。
- **計畫匯入與依賴**：功能展開後把事項整份匯入（網頁「匯入計畫」貼 JSON、終端機 `python outputs/taskboard/plan_import.py plan.json`、或 Claude Code 對話呼叫 mod 工具 `import_plan`）。每個事項成為列管卡片；Claude Code 事項以 `role` 依 MODEL_ROUTING 自動設定模型與推理強度（卡片右側新增「推理強度」欄，啟動前依模型支援等級驗證）；`dependsOn` 建立有向依賴，卡片顯示「等待前置卡片」，排程與「開始執行」會跳過／拒絕被阻擋的卡片；前置卡片全部驗收完成（已完成欄）後，被阻擋的卡片自動排入待辦並留言，自動派工時接著執行。右側「前置卡片」可手動增刪，循環依賴會被拒絕。前置還在待審核（例如功能大致可用但仍想繼續優化、尚未按已完成）時，若要先跑後續卡片，可在卡片內按「略過前置，開始執行」（需確認；窗格內為「略過前置執行」）：這是明確的人工略過，會在卡片留言記錄略過了哪些前置與其狀態；自動派工永遠不會略過前置。
- 一次只執行一個任務（跨工具共用同一排程）。延續對話只能用原工具；換工具會建立新對話並帶入原需求與最近三次回報摘要，標示「跨工具接手」，不會假裝恢復原 session。排隊中的後續需求會固定保存工具、模型與資料夾；要更改請先「取消排隊」。

2026-10-10 更新：桌面現在有「Codex」捷徑，經 `launch-app.vbs`／`desktop-launch.ps1` 自動啟動看板服務、專用 App 與整合 helper。執行 `install-desktop-shortcut.ps1` 可重新安裝此捷徑；同名舊捷徑會備份到 `.data/desktop-shortcut-backup/`。直接使用開始功能表或其他官方啟動入口仍只啟動原生 App。

啟動器現在以 UTF8 讀取 JSON，中文 PowerShell 腳本使用 UTF8 BOM；HTTP 探測使用 `-UseBasicParsing`，避免隱藏啟動時等待網頁內容解析確認；mutex 防止連續雙擊啟動多組 helper。

App 內看板現在同步 Appearance 的明暗、自訂背景／前景／accent 與字型。隔離 iframe 的首次主題及即時訊息沿用 capability 和来源檢查。左側看板 icon 保留原生呈現 attributes：未選取透明，選取底色使用原生 `::before` 背景；文字入口也使用主題 token。獨立網頁版採系統明暗主題。

完整 Codex／Claude 共用環境見根目錄 `AGENTS.md`、`CLAUDE.md`、`AI_CONTEXT.md` 與 `.agents/harness/`；Claude 專屬五級角色與建議 hook 見 `MODEL_ROUTING.md`。共用技能只修改 `.agents/skills/`，以 `scripts/ai/sync-skills.ps1` 產生鏡像；`-Check` 唯讀檢查。結構檢查、路由檢查與交接方式見 `AI_CONTEXT.md`。Claude 平台實際模型／effort／hook 載入未執行耗額度驗證。

雙擊 `開啟 Codex 看板.cmd`，或執行 `start-app.ps1`。它會開啟／重用專用的官方 Codex App 視窗並帶到前景。在左側「New chat／新聊天」下方有文字按鈕「任務看板」，最左側也保留看板圖示；點擊後在主工作區使用看板。原本這個聊天視窗不會新增入口，請切到專用的看板視窗；其他原生導覽按鈕可切回原本的工作區。

如果看板服務或背景整合程式曾停止，重新執行啟動器會恢復服务並清除殘留入口，不需要關閉原本的 Codex 視窗。整合狀態現在也會檢查服務是否實際可用，避免將已停止的服務誤報為就緒。

App 整合已實際驗證：側欄入口、隔離頁面、預設自動模式、保存的卡片、完成訊息展開、返回原工作區、App 重新整理後保留單一入口／看板。派工核心的 7 項檢查通過。

2026-10-10 修正切頁後入口選中但看板不可見的問題：原生 App 會保留已隱藏的頁面節點，整合現在只使用可見工作區計算尺寸，並觀察工作區尺寸與顯示狀態變化。原生聊天列（`div[role="button"]`）也會正確收起看板、清除選中狀態；入口重掛時會保留選中狀態且維持單一入口。另修正 iframe 載入事件與已就緒回應的先後競態，避免重新整理後將已連線的看板誤報為載入中。已透過實際滑鼠切換 Home、既有聊天與 Scheduled，文字／圖示入口各驗證三輪，並驗證 App 重新整理後仍可返回有實際內容的 iframe。卡片、設定與狀態紀錄未因測試改動。

支援新增、編輯、拖曳狀態、搜尋、專案與優先級篩選、任務留言、成果連結，以及複製交給 Codex 的任務指令。介面為繁體中文；時間以台北時區呈現。

新增任務的「專案名稱」可從既有名稱候選選取，也可以輸入新名稱；唯一對應工作資料夾會同步帶入。同名專案有多個路徑時會提供候選供選擇。新名稱會在儲存任務後出現在清單。工作資料夾可直接輸入，或按「選擇資料夾…」開啟 Windows 視窗；取消保留原值，選擇不會自動儲存或派工。Claude 原生窗格也提供既有專案選單與資料夾按鈕。

滑鼠按住卡片（標題也可以）拉到另一個狀態欄，放開即保存；拖曳時會顯示浮動卡片與目標欄位，靠近看板左右邊緣會自動捲動。按 Esc 或放到看板外可取消。拖到「進行中」會開始執行，仍遵守單一執行與前置條件；拖到「已完成」需確認成果驗收。執行中的卡片需先停止；同步對話卡片為唯讀，先按「建立派工卡片」才能移動。

卡片詳情現在以需求簡介與驗收條件為主，右側集中創建日期、狀態、優先級、負責模型、標籤、專案名稱、工作資料夾、成果連結與相關議題。下方按「來源對話／首次執行／後續對話」分類列出多個 session，每個 session 保留逐次需求、時間、執行結果及「查看對話」。已保存卡片可編輯簡介；同步追蹤卡片先按需讀取最近可讀回合的需求與回報，標示參考且保持唯讀，先建立派工卡片才能送後續需求。

負責人依本看板需求代表執行模型；下拉選單由本機 Codex 的 `model/list` 讀取，留白沿用設定。儲存不派工；開始執行時才將所選模型傳給新建／延續對話及本次回合，run 記錄本次模型。不可用模型會保存派工錯誤，請重新選擇。標籤以逗號／頓號分隔，最多 20 個，顯示在卡片上。

相關議題可選已保存卡片，按「加入關聯」後儲存；雙方均顯示連結，任一方移除或刪除卡片會同步清除。唯讀同步卡片需先建立派工卡片；不因關聯自動排程。創建日期自動保存，不能手動修改；不提供截止日期或阻塞關係。

參考上游 dashi-taskboard：舊版工作流是綁定命名的流程，[最新版已移除議題中的工作流欄位](https://github.com/chuspeeism/dashi-taskboard/commit/59d0c698b683914945d6988aa0aa3bcfcbb23d72)，因此此處不新增該欄位。[開發上下文是 Git 分支或 worktree 綁定](https://github.com/chuspeeism/dashi-taskboard/blob/main/README.zh-CN.md)，不是需求說明；本次暫沿用工作資料夾，不加入 Git 綁定或自動切換。

成果未符合需求時，按「延續這個對話」，填寫後續需求並排入待辦；「查看對話」內也可送出修正需求。可選「開新對話」帶入原任務與最近三次回報。儲存卡片或排入待辦不會建立／續跑聊天；自動派工或按「開始執行」才建立／延續 Codex 對話。開始新一輪不覆蓋先前回報，失敗／中止／額度重試保留原需求與結果；舊卡片相容讀取其已保存的最新回報，不推造已被舊版本覆寫的歷史。

在專案篩選下新增卡片會帶入名稱；該分類只有一個已知工作路徑時一併帶入路徑。選單仍由卡片與 session 的資料夾名稱衍生，不是直接讀原生 Project ID；同名多路徑需自行指定，原生側欄歸屬尚未做實際模型派工驗證。

預設開啟「自動派工」：每 5 秒檢查待辦，**先比優先級，同優先級依進入待辦的先後**（`queuedAt`；卡片每次進入待辦都重新記錄，離開再回來就排到後面；舊卡片沒有此欄位時用建立時間），一次執行一個任務，仍被前置阻擋的卡片跳過。待辦欄的排序與排程一致，卡片會標「下一個執行」或「排隊 #n」。後續需求送出時可選「排入待辦」或「立即開始執行」：後者會馬上派工，若此刻有別張卡片在執行或前置未完成，會留在待辦並提示原因。關閉後可按卡片中的「開始執行」，或複製指令到 Codex 手動執行。關閉自動不會中止正在執行的任務；可在卡片內停止。

Codex 執行結束後移到「待審核」，由你確認後移到「已完成」。左側「狀態列表」顯示時間、完成訊息、錯誤與驗收紀錄；完成時會在介面提示。需要核准操作或回答問題時，也會出現在狀態列表。

「Codex 聊天」與看板現在自動同步本機未封存 sessions，完成一輪後每 15 秒更新標題、工作資料夾與回合訊號。看板顯示「同步 session」唯讀追蹤卡片，點卡片可閱讀最近 20 回合，不能拖曳或自動派工；不存入任務 SQLite，也不包含在任務備份內。已連結保存卡片的 session 只加狀態提示，避免重複；封存後下輪移除追蹤卡片，保存卡片仍保留。同步失敗保留上次清單並標待確認，可用「更新清單」重試。

回合訊號由唯讀 thread/list metadata 與 CODEX_HOME/sessions 內 JSONL 尾端事件取得，每檔最多讀 256 KiB、有快取，只對外提供狀態與時間。其他 App runtime 無法由獨立 app-server 精確得知，因此 10 分鐘內活動在進行中標「近期有執行訊號」，較舊未結束訊號在列管標待確認；回合結束在待審核，仍需確認成果。這不是視窗開啟判定，也不自動認定已驗收。本機清單不含 ChatGPT 雲端、其他主機或 subagent。

若要派新工作，聊天清單或唯讀卡片按「建立派工卡片」，先放入列管並連結來源。補上這次需求、移到待辦才派工；預設新工作使用獨立執行聊天。只有使用者明確選擇「延續」並送出後續需求，才會在執行時續跑來源對話。[官方 App Server 文件](https://learn.chatgpt.com/docs/app-server) 說明 thread/resume 後 turn/start 接續同一 thread；本機仍一次派一個任務，已知活躍訊號先阻擋續跑，無法保證其他 App 的精確並行狀態。

資料保存於 `.data/taskboard.sqlite`，重新啟動會保留卡片、設定與紀錄。匯出按鈕可備份已保存的任務。服務需保持運行，電腦休眠或關機時不會派工；重新啟動時未確認結束的任務會進入待審核，避免重複執行。

此版本透過已安裝的 `codex app-server` 與目前 Codex 登入／模型設定工作，沒有額外 API Key。Codex 新建／延續任務採原生 `auto_review` 自動審核工具操作，保留 `on-request`、workspace-write 與網路預設關閉；審核者仍可拒絕受限制操作。需要本人輸入或卡片成果驗收時，仍會在看板顯示。此設定只作用於本看板派出的 Codex 任務，Claude Code 核准機制不變。額度限制錯誤會保留待辦、10 分鐘後重試；其他錯誤會留給人工處理。

整合方式參考 [dashi-taskboard](https://github.com/chuspeeism/dashi-taskboard)：使用獨立 App profile、僅監聽 127.0.0.1 的 CDP 埠 9232，以及執行期間加入的側欄入口／看板。沒有改寫 Codex 安裝檔或複製登入資料。它是 App 內的執行期嵌入整合，不是官方內建功能；Codex 大幅改版時可能需要調整。

此版 App 會限制直接導向本機網址的 iframe，因此採用隔離的空白 iframe 與 CDP 文件載入。看板與主 App 的通訊檢查來源 frame 及隨機 capability，再由啟動器呼叫本機 API；原本的 API token／Origin 保護保留。CDP 僅對專用視窗設定 CSP bypass，移除整合時會恢復。

執行 `stop-app.ps1` 可移除側欄入口與嵌入頁面、停止整合程式；關閉專用 Codex 視窗才會關閉其除錯埠。它不會關閉其他 Codex 視窗或停止看板服務。需要換除錯埠：`start-app.ps1 -DebugPort 9233`（請先關閉舊的專用視窗）。

也可執行 `start.ps1` 單獨使用本機網頁版，網址是 http://127.0.0.1:47824 。必須由本機服務開啟，不能直接雙擊 HTML。

需要換埠：`powershell -ExecutionPolicy Bypass -File .\start.ps1 -Port 47825`。

停止服務：執行 `stop.ps1`。正在執行的任務會中斷並保留待審核，其他卡片與紀錄會保留。

串接文件：https://developers.openai.com/codex/app-server
