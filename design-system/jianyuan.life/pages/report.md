# Report Page(`/report/[token]`)Overrides

> **PROJECT:** jianyuan.life
> **Updated:** 2026-06-12(v5.10.422 基線)
> ⚠️ 本檔規則**覆寫** `../MASTER.md`;未列項目一律照 Master。

---

## 主題(最重要的覆寫)

- **強制 dark**:next-themes `forcedTheme="dark"`(ThemeProvider 依 pathname `/report/` 判斷、**不寫 localStorage**、不污染其他頁偏好)。
- layout inline script 首繪即 dark(零閃白);navbar/footer/toolbar/banner 共 4 個主題切換入口在本頁隱藏(footer 語言切換保留)。
- **解禁條件**:warm-light 報告遷移 sprint 完成(殼 token 化 + 326 處正文色遷移、R8Enhancements 內有還原點註解)後才可恢復切換。

## 排版

- 正文 wrapper **max 880px 置中**(非 Master 1200px;v406 解「字擠左、右大留白」)、17px Noto Sans TC、行高 1.8。
- 左側浮動目錄 **≥1400px 才顯示**;1280 檔用流內 mobile-toc(浮層遮正文教訓)。
- 章首金句:22px Noto Serif TC + 金色左條;`blockquote` 金邊生長動效 420ms。

## 閱讀模式(v408 P1 + v407)

- **預設精簡版**(首屏 ~18 螢幕、-62%):SectionExpander 內文截 300px + 「展開本章全文」鍵 + 「內容未刪減」microcopy。
- 短章 scrollHeight ≤340px 免摺疊(防空殼展開鍵);`useState<boolean|null>(null)` null 首幀防 CLS(Gemini P0 教訓)。
- 已存偏好(localStorage view-mode)雙向尊重;print 一律全文 `!important`。

## 動效(ReportMotion、flag `NEXT_PUBLIC_FF_REPORT_MOTION`)

- 觀察對象:`main .section-card, main .glass[id^="sec-"]` 過濾 `height>40` — **禁裸 `[id^="sec-"]`**(會抓到 39 個零尺寸 dead-anchor sentinel span、IO 永不觸發 = 章節永久隱形、v417 P0)。
- IO 參數與 scroll 安全網照 Master §3(threshold 0 + 300px band + 150ms sweep)。

## 內容清洗(渲染層防線)

- 入口級 `sanitizeAiContentLeaks()`:sectioning 前一刀切(截斷 timing JSON / SELF-CHECK / raw_data 計算式 / 15→14)、所有下游渲染路徑免疫。
- E 系徽章:`isChumenji` → 「奇門遁甲擇日驗證」(純奇門報告禁掛「14 套系統交叉驗證」)。
- 行事曆標題格式 `天心+天禽+休門(東90°)` 為老闆 v5.3.75 拍板、**禁止「人話化」改動**。

## 方案差異

- E1/E2/E3/E4(出門訣):無 PDF 鍵、無 Email、吉時卡片 + 行事曆按鈕為主交付;E3 卡按 `timing.week` 排序 + 週標頭分組。
- C/D/G15/R:PDF 保留;30 秒懶人包錨點 plan-aware(D 用前 4 章真 `#sec-N`)。
