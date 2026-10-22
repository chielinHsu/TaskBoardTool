# ADR-018：鏡像卡的需求簡介／驗收條件只從 session 第一句擬一次，手改後鎖定（2026-10-12）

- 背景：鏡像卡的簡介原本直接存建卡那句需求；若卡片在較晚的回合才建立，簡介是中途那句；後續每句都是修改需求，使用者要求簡介與驗收條件不能跟著變，否則卡片本質被破壞。看板沒有模型，mod 引擎有 `$.model.complete`。
- 決定：卡片新增 `brief` 狀態 `seed`→`drafted`→`manual`。建卡時簡介以 transcript 可讀的最早一句（讀不到才用當句）播種為 `seed`，start 回應 `wantsBrief`／`briefSource`；mod 以 haiku／low、800 tokens、60 秒逾時一次擬出「需求簡介＋驗收條件」送 `event=brief`，伺服器只在 `seed`／`drafted` 時接受並記 `drafted`；`update` 改了 description 即 `manual`，之後任何 brief 一律拒絕（`brief-manual`）。start／complete 永不改 description 或 title。舊碼建立且簡介仍等於首筆 mirror run 需求的卡片視為 `seed` 並改用 transcript 第一句重播種；沒有 `brief` 鍵的其他卡片等同 manual。服務重啟不再把鏡像中的卡片標為中止（App 回合仍在跑，結束訊號稍後才到）。
- 理由：擬稿需要模型，放在 mod 端用最便宜的模型與最低推理一次完成，看板本身仍不耗額度；真相來源是 session 第一句，使用者的手改優先於任何自動內容。
- 替代方案：伺服器用模板拼「需求簡介＝首句、驗收條件待填」（不算擬稿，否決）；每回合重擬（違反使用者要求）；由 `claude -p` 擬稿（另起子程序、額度較高，否決）。
- 後果：每張新鏡像卡多一次 haiku 呼叫；擬稿失敗或空白時簡介維持第一句；transcript 尾端視窗（20 回合）之外的第一句讀不到時以可讀最早一句代替；`brief` 為新任務欄位，匯出沿用 schemaVersion 5（附加欄位），API 1.7.0。
