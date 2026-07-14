# 正式私人報告 `/report/[token]` — 呈現覆寫

> 本頁規則覆寫 `../MASTER.md`；只限制 presentation，不修改任何命理資料、推導或生成內容。

**更新：** 2026-07-13
**正式 renderer：** legacy `/report/[token]`
**不可替代來源：** `/r/*` 與 `lib/pdf/*` 目前仍屬 beta／POC

## Chrome

- 隱藏公開 Navbar、Footer 與全站 Back to top；只保留報告閱讀所需工具。
- 閱讀進度條與 toolbar 從 viewport `top: 0` 開始，不堆疊多層 fixed chrome。
- 工具列最多：目錄、閱讀模式／字級、下載／列印、回報錯誤。
- 本頁暫時由 ThemeProvider 強制 dark；完成全部 legacy 內容 token 化與對比 QA 後才解除。

## 排版

- `.report-reading-column` 最大 48rem；純正文 `.report-p` 以 18px／1.8／約 36em 為目標。
- H1/H2 用 serif；H3 與正文用 sans。H3 在 mobile 不得小於正文。
- 資料表、命盤、時間線可 breakout，但正文寬度不可隨之擴張。
- `.section-card` 與 `.glass` 在報告 scope 內不得 hover lift 或 backdrop blur。
- 靜態段落不可同時由外內兩層 `.report-p` 疊加 margin。

## 閱讀架構

- 正式起點只能有一個：封面／身份 → Executive Brief → 限制 → TOC → 正文。
- 不得用「速覽、5 件套、3 層洞察、5 大洞察、命格名片」反覆包裝同一批結論。
- 核心章節依「起／承／轉／合」展開；術語、算法與 14 系統矩陣移至證據／附錄。
- TOC 只能列實際存在的 id；desktop、mobile 與正文使用同一份 immutable normalized list。
- 核心內容預設展開。摺疊只用於補充證據，且 print 必須全文。

## 真實性

- 禁止 UI 自行生成分數、百分位、「同型客戶比例」或未由引擎提供的交叉驗證數。
- 明確標示「計算事實／詮釋／建議」；資料缺口以「資料完整／部分受限／需核對」呈現，不用假精確 confidence score。
- 缺欄位就不 render；不得 fallback 到 mock。

## PDF

- 正式 PDF 是 Python ReportLab pipeline，不是 React PDF POC。
- presentation flags（header/footer、TOC、cover style、locale）必須從 request 接到 renderer。
- A4 建議 18–20mm margin、正文 10.5–11pt、serif 章題、sans 正文、heading keep-with-next。
- 表格重複表頭；寬表重排而非縮成不可讀小字；不得產生無內容內頁。
- PDF 修改後以 C／D／R／G15 golden fixture 驗證所有數字、日期、四柱與判定完全一致。

## 發布檢查

```text
□ 1440 / 1280 / 768 / 390 無 body overflow
□ 全部 TOC anchor 存在且不被 sticky toolbar 遮住
□ 正文 measure、heading hierarchy、keyboard focus
□ print 全文、操作 chrome 隱藏
□ C / D / R / G15 data parity 100%
□ PDF 無空白內頁、無 orphan heading、跨頁表格有表頭
```
