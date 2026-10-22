# ADR-026：PR 自動合併接受其他目標分支（2026-10-15）

- 背景：使用者要求本人／維護者建立、目標不是 main 的 PR 也可自動合併；原 CI trigger、prepareReview 與 canMerge 都限定 main，合併後一律部署 Pages。
- 決定：CI 接受所有 PR 目標；自動審查保留同 repo／維護者／檔案允許範圍，記錄目標 ref 及 base SHA。模型依固定目標 SHA 快照檢視程式碼，審查控制程式與規則仍讀 main；結案核對目標、head 與最新 CI，有目標變更即拒絕舊審查。僅 main 合併啟動 Pages。
- 理由：開發分支能沿用既有 CI＋AI 流程，並避免拿 main 的程式碼當其他目標的上下文、沿用換目標前的 verdict 或誤部署正式站。
- 替代方案：只拿掉 canMerge 的 main 條件（CI 與 PR 篩選仍阻擋）；任意目標仍讀 main（上下文錯誤）；從目標載入控制程式（擴大憑證 job 的信任範圍）。均不採用。
- 後果：同 head 多 PR 只在 CI 可唯一對應時自動選取，否則需明確填 PR 編號；其他分支的 protection／ruleset 不自動改動。base 更新的最後競態仍依 GitHub 分支規則控制。Issue AI Task 仍以 main 為目標；需發布這次 workflow 後才會在 GitHub 生效。
- 驗證：完整 CI 腳本通過（Python 82、Node 31、路由 74、展示建置），包含 develop／release／功能分支、main 部署、非 main 不部署、目標改變／base 更新／失敗 CI／不同 PR 或分支／fork／敏感檔拒絕；Actionlint 1.7.12 通過。真實 GitHub 多目標合併及模型審查 NOT VERIFIED。

- 編號：原作者寫成 ADR-025；整合到主線時 ADR-025 已是「導入 AI 結構 2.0.0」，改為 ADR-026，內容不變。
