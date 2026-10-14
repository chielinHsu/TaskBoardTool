# 交接（2026-10-14）：專案篩選、資料夾選擇與附件

## 正在做
使用者回報的四項看板使用問題已實作、驗證、提交（fb58e0a，未 push），正式服務已重啟為 1.10.0。

## 已完成
- 專案篩選：全部工具時改為單一合併清單（標註 Codex／Claude），原本 Codex 群組在前、Claude 被擠出第一屏。
- 資料夾選擇：select-folder.ps1 改新式 IFileOpenDialog（網址列可輸入／貼上路徑，TopMost）。
- 工作資料夾欄改可換行文字框；「用過的資料夾」以完整路徑按鈕列出。
- 附件（ADR-023）：attachments.py、`POST /api/attachments`、`GET /api/attachments/<id>`；需求、後續需求、聊天延續可選檔／拖放／貼上截圖；派工帶路徑與原生圖片。API 1.10.0。

## 驗證
- VERIFIED：Python 81（新增 test_taskboard_attachments 4 項）；check.mjs（PYTHON_BIN 指實際 Python）Node 30、路由 74、展示建置。
- VERIFIED：taskboard-projects、taskboard-drag、taskboard-demo；隔離服務 47999 瀏覽器操作與 0 console 錯誤。
- VERIFIED：資料夾視窗由隔離服務開啟，Win32 按「選擇資料夾」回傳路徑、取消保留原值。
- 實際失敗：taskboard-details.test.mjs:33 `detail.editor` 斷言；git stash 後 baseline 同樣失敗，既有問題。
- 實際失敗（已修正）：fake_claude_cli 修改時 heredoc 把 `\n` 轉成換行造成語法錯誤。
- PARTIALLY VERIFIED：背景服務開的視窗為 TopMost 但不取得前景焦點（Windows 前景鎖），需點一下。
- NOT VERIFIED：真實 Codex／Claude 讀取附件、Codex App 嵌入時上傳。

## 下一步
使用者授權後 push；在正式看板實際附加檔案派工，驗收模型能讀到附件。
可另案：taskboard-details 既有失敗、草稿附件孤兒清理、Claude worktree 名稱成為專案名。

## 相關檔案
outputs/taskboard/attachments.py、server.py、tool_adapters.py、claude_adapter.py、index.html、select-folder.ps1；
tests/test_taskboard_attachments.py、fake_claude_cli.py（FAKE_CLAUDE_INPUT_LOG）、taskboard-projects.test.mjs；sites/demo/demo.js。

## 不要動
真實卡片、SQLite、session、認證、官方 App；不提交 work/、vendor/、.data/。

## 未提交變更／假設
本輪已提交於 main（fb58e0a 與本交接更新），未 push。附件存 `.data/attachments`，匯出不含檔案。
正式服務以 stop.ps1＋start.ps1 -NoBrowser 重啟；重啟前無派工中任務，只有本對話的鏡像卡。
`--add-dir` 為可變參數，須保持在 Claude CLI 參數最後。
