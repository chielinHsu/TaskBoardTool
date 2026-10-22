# ADR-020：鏡像卡標題跟隨 Claude App 的 session 標題，看板手改後鎖定（2026-10-13）

- 背景：鏡像卡在首回合 `turn.start` 就建立，但 Claude App 的 session 標題（`local_*.json` 的 `title`，`titleSource: 'auto'`、`titleTurn: 0`）在首回合結束後才由模型產生，所以卡片標題退回首句第一行。worktree 或未選資料夾的 session，App 會在首句前插一個 `<system-reminder>` 文字區塊，第一行因此變成 `<system-reminder>`（本機 15 個 session 如此、正式看板 3 張卡）。ADR-018 規定 start／complete 不改標題，在 App 改名也不會同步。
- 決定：(1) `claude_sessions.strip_reminders` 只去掉提示詞**開頭**完整的 `<system-reminder>…</system-reminder>` 區塊，套用在 transcript 使用者回合與 `/api/claude-turns` 的 `text`；使用者在句中自己打的標記保留。(2) 卡片新增 `titleSource`：建卡時 App 已有標題為 `app`，否則首句第一行為 `seed`；`seed`／`app` 在每個 start／complete 與每次 `claude_list` 同步時改用 App 標題（與 session id 相同代表尚未命名，不採用）；`update` 改了標題即 `manual`，之後永不覆寫。沒有 `titleSource` 的舊鏡像卡在下一個回合判定一次：標題等於 App 標題為 `app`，以 `<system-reminder>` 開頭或等於首句第一行為 `seed`，其他為 `manual`。本條取代 ADR-018「start／complete 不改 title」的部分，簡介規則不變。
- 理由：App 的標題就是使用者在側欄看到的名字，與卡片一致最容易對照；跟 brief 同樣的「自動內容可更新、手改優先」規則，使用者不需學新概念；舊卡不在背景改寫，只在該 session 有新回合時判定。
- 替代方案：只在建卡時等 App 命名（首回合開始時還沒有標題，否決）；只過濾 `<system-reminder>`、標題仍一次定案（不解決改名與不一致）；每次都強制跟隨 App（會覆蓋看板手改，否決）；session 同步時就遷移舊卡（每張舊卡要讀 transcript，且使用者同意的是下一個回合處理）。
- 後果：App 改名在下一次 Claude session 同步（約 15 秒週期）反映到卡片並增加 version，若詳情草稿此時開著，儲存會收到既有的「任務已更新」409；鏡像卡的簡介初稿與聊天紀錄的「你」不再含 App 提示。`titleSource` 為附加欄位，匯出沿用 schemaVersion 5；API 1.9.0。
