# ADR-014：看板 mod 安裝為全域 ~/.claude/mods 副本並以 CLAUDE_CODE_PLUGIN_DIRS 載入（2026-10-11）

- 背景：mod 先前以 Claude App「開發 mod」機制安裝在 `~/.claude/dev-mods/<session id>/`，只在該 session 載入；其他 session 與另一台電腦 clone 後都看不到窗格，且更新需 update-claude-mod.ps1 複製。
- 決定：新增 setup-claude-mod.mjs，以 SHA-256 比對把 `claude-mod/taskboard-pane` 同步到全域 `~/.claude/mods/taskboard-pane`（保留引擎寫入的 `.claude-plugin/types/`、`tsconfig.json`，覆寫前備份），再把該全域路徑加入使用者層 `~/.claude/settings.json` env.CLAUDE_CODE_PLUGIN_DIRS、設 CLAUDE_CODE_PLUGIN_DIR_WATCH=1，移除若有的專案來源路徑。只改這兩個鍵、備份後寫入、回讀核對，--check 唯讀。來源資料夾被 --plugin-dir 直接載入時會產生的 types／tsconfig 列入 gitignore。
- 理由：使用者明確要求全域，與既有 usage-bar、agents-panel 等 mod 同一位置與載入機制；每個 App session 都載入；不依賴專案 clone 位置；不依賴未實測的 marketplace 安裝。
- 替代方案：直接登記專案來源路徑（第一版；pull 即生效但綁定專案位置，使用者否決）；`/plugin install --marketplace` 本機資料夾（未實測）；維持 dev-mods 快照（session 專屬，否決）。
- 後果：設定只對新 session 生效；git pull 後需重跑腳本同步副本（已載入的 session 熱重載）；舊 dev-mods 副本在原 session 內會重複載入，需人工刪除；update-claude-mod.ps1 降為舊流程。Claude 自身設定的寫入不能由自動模式的 Claude 執行，需使用者執行腳本。
