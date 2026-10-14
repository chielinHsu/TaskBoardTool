# 交接（2026-10-14）：Claude worktree 名稱不再成為專案名

## 正在做
修正 Claude 卡片以 worktree／暫存資料夾隨機名當專案；分支 fix/worktree-project-name，依自動流程開 PR、CI 通過自動合併。

## 已完成
- session_sync.py `project_from_cwd()`：worktree 取 repository 名，scratch-workspaces 為「Claude 暫存工作區」，PureWindowsPath 解析。
- 唯讀同步卡、匯入卡、鏡像新卡共用；server.py `follow_cwd_project()` 在 Claude 同步時修正舊鏡像卡（只限專案仍等於資料夾原名）。
- 前一輪（PR #2，9ed444f）：專案篩選合併清單、新式資料夾選擇、附件，正式服務已為 1.10.0。

## 驗證
- VERIFIED：Python 82（新增 mirror 測試 1 項）。
- VERIFIED：正式看板資料唯讀試算，20 張已保存卡與 22 張唯讀卡皆對應正確 repository。
- NOT VERIFIED：正式服務未重啟；Ubuntu CI 上的 Windows 路徑解析待 PR CI 證實。
- 既有失敗：taskboard-details.test.mjs:33（baseline 即失敗，未處理）。

## 下一步
合併後經使用者授權重啟正式服務，確認 20 張卡專案在第一次 Claude 同步後改為 repository 名。

## 相關檔案
outputs/taskboard/session_sync.py、server.py、tests/test_taskboard_mirror.py。

## 不要動
真實卡片除上述自動跟隨外不手動改；SQLite、session、認證、官方 App；不提交 work/、vendor/、.data/。

## 未提交變更／假設
本輪變更在 fix/worktree-project-name，依工作區 CLAUDE.md 自動 PR／合併。
重啟後已保存卡 version 增加，開著的詳情草稿儲存會收到 409（與 App 標題跟隨相同）。
