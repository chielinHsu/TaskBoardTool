# TaskBoardTool 動態簡報影片

成品（皆為 1920×1080、30 fps、H.264 High + AAC 48 kHz 立體聲，標準非分段 MP4）：
- `TaskBoardTool-promo-45s.mp4`：45 秒六段版（集中管理、Session 自動同步、對話分類、心智圖、計畫派工、驗收追蹤），來源 `promo-long.html`。
- `TaskBoardTool-promo.mp4`：15 秒三段版，來源 `promo.html`。

## 檔案
| 檔案 | 用途 |
|---|---|
| promo.html | 15 秒版 Canvas 動畫本體（共用繪圖函式、場景 1–3、音樂）；用瀏覽器直接開啟可按「播放（含音樂）」預覽，拖曳滑桿逐格檢視 |
| scenes-long.js、build-long.py | 45 秒版新增場景（Session 同步、對話分類、心智圖、六段排程、45 秒音樂）；`py -3 build-long.py` 把 promo.html 的共用程式與場景 1–3 併成 `promo-long.html`（產物，勿手改） |
| encode.mjs | 以 headless Chrome 的 WebCodecs 逐格編碼 H.264 與 AAC，輸出 `enc/`（確定性，不受即時效能影響） |
| mux.py | 純標準函式庫把 `enc/` 封裝成標準 MP4（stts／stss／stsc／stsz／co64、avcC、esds） |
| verify.mjs | 在 headless Chrome 內解碼成品：回報長度、解析度、音軌 RMS／峰值，並擷取指定秒數影格到 `verify/` |
| frames.mjs | 由 promo.html 直接輸出指定秒數的影格 PNG 到 `frames/`（視覺檢查用） |
| cdp-lib.mjs | 最小 CDP 客戶端（啟動 headless Chrome、evaluate、截圖） |

## 重新產生
在本資料夾執行（需本機 Chrome 與 Node 22+、Python 3.9+，不需 ffmpeg）：
```powershell
# 45 秒版
py -3 build-long.py
$env:PAGE='promo-long.html'; $env:OUT='enc-long'; node encode.mjs
py -3 mux.py enc-long TaskBoardTool-promo-45s.mp4
node verify.mjs TaskBoardTool-promo-45s.mp4 9.5 16 23 44.2
# 15 秒版
node encode.mjs
py -3 mux.py enc TaskBoardTool-promo.mp4
node verify.mjs TaskBoardTool-promo.mp4 2.2 8.0 12.9 14.8
```
環境變數 `PAGE`（動畫頁）、`OUT`（輸出資料夾）、`FPS`、`BITRATE`（預設 30、10000000）可調整；`frames.mjs` 也吃 `PAGE`／`OUT`。

## 分鏡（45 秒版）
| 時間 | 內容 | 字幕 |
|---|---|---|
| 0–6 s | 看板五欄與卡片依序浮現 | Codex × Claude Code，一個看板掌握進度 |
| 6–13 s | 左側 Claude App 輸入首句，`turn.start` 事件飛向看板自動建卡進「進行中」（徽章「Claude App 對話執行中」）；回報後 `turn.complete` 移到待審核，App 命名 session 後卡片標題跟著更新；底部說明既有對話每 15 秒同步、來源 session 去重 | Claude Code 對話一開始，看板就有卡片 |
| 13–20 s | 聊天紀錄：回合 1、2 摺疊、回合 3 展開，訊息依「你／進度／回報」三色；右側對話方式依序選「延續同一 session」「開新對話」「跨工具接手 Codex」，輸入後續需求並送出 | 你／進度／回報分色，延續同一 Session 或開新對話 |
| 20–27 s | Session 心智圖：卡片 → 兩個 session（Claude Code／Codex 分色）→ 五次對話節點依序長出；收合／展開 Codex session、縮放到 112%、點第 2 筆對話跳回詳情 | Ctrl＋M 開啟心智圖，session 脈絡一目了然 |
| 27–34.5 s | 計畫匯入、依賴圖、派工設定、依序派工（同 15 秒版場景 2，放慢 1.5 倍） | 匯入計畫，依序執行 |
| 34.5–42 s | 任務詳情、回報、歷史對話、待審核 → 人工驗收 → 已完成（同 15 秒版場景 3，放慢 1.8 倍） | 完成先待審核，驗收後才算完成 |
| 42–45 s | 定格：TaskBoardTool、標語「讓 AI 執行，讓你掌握」、六大功能標籤 | — |

音樂結構（45 秒）：前 2 小節 intro（琶音＋hi-hat）、8 小節主段、2 小節 breakdown（對應心智圖段落，鼓組退場、pad 加厚）、10 小節主段加第二主旋律、每 4 小節尾小鼓滾奏、42 秒結尾重音與和弦尾韻後淡出。

## 分鏡（15 秒版）
| 時間 | 內容 | 字幕 |
|---|---|---|
| 0–5 s | 看板縮放進場，列管／待辦／進行中／待審核／已完成五欄依序浮現，卡片逐張彈入，進行中卡片帶進度條 | Codex × Claude Code，一個看板掌握進度 |
| 5–10 s | 左側 plan.json 計畫（含 role／dependsOn），事項飛出成依賴圖並畫出連線箭頭；派工設定列切換 Claude Code、模型 sonnet、推理 high；節點依序派工並打勾 | 匯入計畫，依序執行 |
| 10–15 s | 任務詳情：需求簡介、按 session 分組的執行回報、歷史對話、右側屬性；迷你看板中卡片進入待審核，游標按下「人工驗收通過」後移到已完成；最後定格 TaskBoardTool 與標語 | 完成先待審核，驗收後才算完成 → 讓 AI 執行，讓你掌握 |

音樂：D 大調 I–V–vi–IV、128 BPM，kick／snare／hi-hat、鋸齒波低音、方波琶音、三角波主旋律與 pad，結尾重音後一秒淡出；全部由 OfflineAudioContext 合成，無外部素材與授權問題。
