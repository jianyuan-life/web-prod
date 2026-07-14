# 鑑源 jianyuan.life — 商業呈現設計系統

> 本文件定義公開網站、結帳、會員區與私人報告的呈現規則。命理計算、判定、方案代碼與付款流程不在設計層修改範圍內。
>
> 實作優先序：`app/presentation.css` 的 `--jy-ui-*` 與 `.jy-*` 是新頁面唯一來源；`app/globals.css` 僅維持舊頁相容。特定頁面可由 `pages/*.md` 加嚴，但不得降低本文件的可及性與信任門檻。

**品牌方向：** 現代典籍 × 私人顧問卷宗 × 觀測台
**產品語氣：** 冷靜、可核對、尊重判斷，不神化、不催迫、不用假精確數字
**更新：** 2026-07-13

## 1. 核心原則

1. **結論先行。** 每頁先回答「這是什麼、適合誰、下一步是什麼」，再展開證據與細節。
2. **可解釋比神祕重要。** 明確區分計算事實、傳統詮釋與行動建議；限制與缺資料就近呈現。
3. **資訊階層靠排版，不靠特效。** 以留白、字級、線條、表面層級建立節奏；靜態內容禁止 hover lift、大片 blur 與持續漂浮。
4. **一次只有一個主要動作。** 次要動作使用 outline/text，不與主 CTA 爭奪。
5. **不使用暗黑模式。** 禁止假倒數、假稀缺、虛構熱門、未驗證見證、預勾加購與晚揭露費用。
6. **繁中先行。** 版面以繁體中文實際字寬、斷行、標點與長文掃讀設計，不以英文 mockup 推回中文。

## 2. 語意色彩

所有新 UI 只使用 `--jy-ui-*`，component 內不得新增裸 hex。

| 語意 | Dark | Light | 用途 |
|---|---:|---:|---|
| `--jy-ui-canvas` | `#080b12` | `#f5f0e7` | 全頁底色 |
| `--jy-ui-canvas-raised` | `#111925` | `#f9f3e9` | 區段抬升 |
| `--jy-ui-surface` | `#121a27` | `#fffaf1` | 主要面板 |
| `--jy-ui-ink` | `#f4efe6` | `#241e18` | 主文字 |
| `--jy-ui-ink-muted` | `#bec4ce` | `#5e574e` | 次文字 |
| `--jy-ui-gold` | `#d5b261` | `#80581b` | 品牌、索引、證據 |
| `--jy-ui-action` | `#d5b261` | `#a33e32` | 唯一主要 CTA |
| `--jy-ui-focus` | `#91c7ff` | `#155d92` | 鍵盤焦點 |
| `--jy-ui-success` | `#72c59a` | `#2d714b` | 成功狀態 |
| `--jy-ui-danger` | `#ed8b80` | `#a5322a` | 錯誤狀態 |

Light 不是 Dark 反相：紙張、線條、陰影、CTA 均有獨立值。五行圖表仍使用 `globals.css` 既有 `--wx-*`；不得改變資料或類別映射。

## 3. 字體與閱讀尺度

- Display／H1／H2：Noto Serif TC，重量 500–700；用於編輯式敘事，不整頁 serif。
- Body／表單／表格：Noto Sans TC，16px 起；長篇報告 18px、行高 1.8。
- 拉丁小標：Cinzel 僅限極少量品牌 metadata，不得犧牲可讀性。
- 公開頁內容容器：`--jy-ui-content: 78rem`；左右 gutter 用 `--jy-ui-gutter`。
- 長文閱讀欄：`--jy-ui-reading: 42rem`，正文段落建議不超過 36–40em。
- 一頁一個 H1，H2/H3 不跳級；小標不得小於相鄰正文。
- 不用全大寫中文，不用超寬 tracking 於兩行以上文字。

## 4. 版面與元件語法

優先組合下列 class，不另造一套 page-local token：

- Shell：`.jy-page`、`.jy-container`、`.jy-reading-container`
- Section：`.jy-section`，必要時加 `--ruled`／`--raised`
- Type：`.jy-eyebrow`、`.jy-display`、`.jy-title`、`.jy-lede`、`.jy-copy`
- Actions：`.jy-button` + `--primary`／`--secondary`，`.jy-text-link`
- Surfaces：`.jy-panel`、`.jy-card`；只有能點擊的卡片才有互動狀態
- Layout：`.jy-grid-2`、`.jy-grid-3`、`.jy-stats`
- Commercial：`.jy-pricing-grid`、`.jy-price-card`、`.jy-comparison-wrap`

面板預設實色、1px semantic border、低對比陰影。Glass 僅可用於真正需要背景上下文的短暫浮層；報告正文與定價卡禁止 backdrop blur。

## 5. 商業漏斗

### 定價

每張方案卡在 CTA 前說清楚：適合誰、得到什麼、一次性或訂閱、幣別與最終價、交付格式／範圍、預計完成時間、資料更正與支援方式。推薦只能附可核對的推薦理由，禁止「最多人買」等無資料聲稱。

比較表使用真正的 `table`、`caption`、`th scope`。手機只讓表格容器局部橫向捲動，不得造成 body overflow。

### 結帳

標準閱讀順序：選方案 → 填資料 → 檢查資料與總價 → 付款 → 完成／追蹤。表單：

- 只收生成報告需要的資料，label 永遠可見。
- 錯誤訊息具體、靠近欄位，提交失敗保留所有輸入。
- 付款前顯示姓名、曆法、年月日時分、地點／時區、性別、方案、折扣與最終幣別金額。
- 付款 CTA 明寫金額與結果，例如「支付 US$___ 並開始生成報告」。
- 不用無法證實的 SSL 位數、永久保存、成功率或退款聲稱作 trust badge。

### 完成頁

必須包含付款／領取狀態、訂單編號、通知 Email、預計完成時間、追蹤連結、修正資料與客服方式，以及下一步說明。

## 6. 報告呈現

品牌北極星是「私人高端顧問 dossier」，不是 SaaS dashboard。標準骨架：

1. 封面與報告對象／資料摘要
2. 唯一一個三分鐘 Executive Brief
3. 重要限制與資料完整狀態
4. 目錄
5. 起：本源與你是誰
6. 承：形成脈絡與過去
7. 轉：目前週期與未來
8. 合：當下行動
9. 命理依據、術語與技術附錄
10. 信件、免責與回饋

每章固定採「一句論點 → 白話解讀 → 可核對證據 → 支持／衝突 → 可執行行動」。核心內容預設可讀；accordion 只收納術語與推導細節。

正式客戶頁目前仍是 `/report/[token]`。`/r/*` 的 adapter 含 mock fallback，在 real-only contract 完成前不可切換 production，也不可將 React PDF POC 當正式下載。

## 7. 可及性與響應式發布門檻

- WCAG 2.2 AA：正文 4.5:1，大字與非文字 UI 3:1。
- 設計目標觸控 44×44px；絕對不得低於 WCAG 24×24px。
- 320 CSS px／400% zoom 除真正二維表格與圖表外無整頁橫捲。
- 所有互動可由鍵盤完成；`:focus-visible` 3px、不可被 sticky chrome 遮住。
- 表單狀態與非同步成功／錯誤用 `aria-live` 或等效語意通知。
- 動效尊重 `prefers-reduced-motion`；只使用 opacity／transform，避免 CLS。
- 斷點驗證至少 390、768、1024、1440；明／暗模式各驗一次。
- Print 顯示完整正文、隱藏操作 chrome，不因 reveal/collapse 丟內容。

## 8. 命理與商業邏輯防火牆

視覺 wave 可改：DOM 順序、容器、排版、色彩、chrome、可及性標記、真實資料的摘要布局、PDF 字級／邊距／表頭與 presentation flags 接線。

視覺 wave 不可改：calculators、`report_result`／`full_charts`／`analyses` 值、prompt、quality gate、生成 workflow、建議推導、方案代碼／價格、adapter 語意 mapping。缺資料就省略呈現，絕不可用 mock／他人資料補空。

## 9. 每次 UI 變更的驗收

```text
□ npx tsc --noEmit --incremental false
□ production build（高風險或 release 前）
□ 1440 / 390 × light / dark 實際截圖
□ scrollWidth === clientWidth（表格等明確例外除外）
□ 一頁一個 H1、heading 不跳級
□ 可見互動目標 ≥24px；主要 mobile controls 目標 44px
□ 鍵盤 focus、錯誤與狀態訊息可感知
□ prefers-reduced-motion 與 print
□ 報告 golden fixture 做數字、日期、四柱、判定 parity diff
□ 不新增虛構指標、見證、熱門或保證聲稱
```
