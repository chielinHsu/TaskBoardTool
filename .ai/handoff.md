# 交接（2026-10-14）：Claude worktree 名稱不再成為專案名

## 正在做
已完成：PR #3 自動合併（50632a8），正式服務已重啟，舊鏡像卡專案已改為 repository 名。

## 已完成
- session_sync.py `project_from_cwd()`：worktree 取 repository 名，scratch-workspaces 為「Claude 暫存工作區」，PureWindowsPath 解析。
- 唯讀同步卡、匯入卡、鏡像新卡共用；server.py `follow_cwd_project()` 在 Claude 同步時修正舊鏡像卡（只限專案仍等於資料夾原名）。
- 前一輪（PR #2，9ed444f）：專案篩選合併清單、新式資料夾選擇、附件，正式服務已為 1.10.0。

## 驗證
- VERIFIED：Python 82（新增 mirror 測試 1 項）。
- VERIFIED：正式看板資料唯讀試算，20 張已保存卡與 22 張唯讀卡皆對應正確 repository。
- VERIFIED：PR #3 CI 三項（含 Ubuntu）通過；重啟後隨機資料夾名專案 0 張，專案下拉 69→38 項。
- 實際失敗：`gh pr merge --author-email` 未生效，合併提交作者仍為 GitHub noreply。
- 既有失敗：taskboard-details.test.mjs:33（baseline 即失敗，未處理）。

## 下一步
查明 GitHub squash 作者：確認 chielin0025@hotmail.com 是否為帳號已驗證信箱、是否開啟「Keep my email addresses private」。

## 相關檔案
outputs/taskboard/session_sync.py、server.py、tests/test_taskboard_mirror.py。

## 不要動
真實卡片除上述自動跟隨外不手動改；SQLite、session、認證、官方 App；不提交 work/、vendor/、.data/。

## 未提交變更／假設
本機 main 已同步 origin/main；本文件更新另開 PR 自動合併。
重啟後已保存卡 version 增加，開著的詳情草稿儲存會收到 409（與 App 標題跟隨相同）。
