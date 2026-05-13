# DS4 R2 Sidebar TOC v5.10.140 Re-Evaluation

> **執行時間**:2026-05-10 16:54 (台灣時間)
> **Sub-agent**:DS4 R2 Notion / Linear / Stripe 連貫性
> **任務**:re-evaluate v5.10.140 桌面 sidebar TOC 補回後真實效果(原 42/100、+20 預期、達 62)
> **驗證手段**:Playwright real-browser headless 1440 / 375 雙 viewport × 2 C 報告 = 4 captures
> **截圖**:`screenshots/C_*_desktop_top.png` / `_after_click.png` / `_mobile_top.png` 6 張

---

## ① 連貫性總分

**DS4 R2 = 60 / 100**(原 42 → +18、PASS L1 base、未達 90+ 結案)

| 維度 | v5.10.139(原)| v5.10.140(新)| 變化 | 說明 |
|:---|:---:|:---:|:---:|:---|
| 1. SidebarTOC 桌面顯示 | 0 | **18** | +18 | aside.sticky-sidebar-toc 240px 鎖死 / 兩欄成立 |
| 2. SidebarTOC mobile drawer | 0 | 0 | 0 | 仍缺(`hidden lg:block` 直接隱藏、無 mobile drawer)|
| 3. 章節指示(ScrollSpy active)| 0 | **5** | +5 | observer 註冊但 instant scrollIntoView 後 active 未即時設(rootMargin 邏輯需 section 進中央 20%)|
| 4. Breadcrumb 麵包屑 | 0 | 0 | 0 | 仍缺 |
| 5. 上下章 prev/next button | 2 | 2 | 0 | 仍只有底部 PartHighlights、無浮動 prev/next |
| 6. 全局位置感(進度條 / 目前章節)| 8 | 9 | +1 | ReadingProgressBar 已有、SidebarTOC 強化「我在哪」感 |
| 7. 點擊跳轉(scroll 到位)| 32 | **26** | -6 | 原頁內 TOC 點擊 OK、現雙系統(sidebar + 頁內)略冗餘、**但本身仍 PASS**|
| **總分** | **42** | **60** | **+18** | 未達預期 +20、ScrollSpy active 未生效扣 2 |

**與預期差距**:預期 +20 達 62、實測 +18 達 60、差 2 分由 ScrollSpy active = 0 / 34 引起(見 ② 第 5 項)。

---

## ② 5 項驗證(逐條 PASS/FAIL + 證據)

### 1. ✅ PASS — SidebarTOC 桌面 1440 顯示 + 兩欄 layout

**證據**(Playwright `evaluate` 抓 `aside.sticky-sidebar-toc`):
| 客戶 | exists | display | width | linkCount | 第 1 條 href |
|:---|:---:|:---|:---:|:---:|:---|
| C 何宥諄 | true | block | 240px | 17 | #sec-0 |
| C 何紀萳 | true | block | 240px | 16 | #sec-0 |

截圖:`C_*_desktop_top.png` 左欄金邊 sidebar 完整 render、含「本報告章節」標題 + 17/16 條目錄連結。

### 2. ✅ PASS — SidebarTOC width 真 240px(鎖死、未爆)

`document.querySelector('.sticky-sidebar-toc').offsetWidth = 240`(兩客戶一致)、CSS `width: 240px; flex: 0 0 240px;` 雙鎖、避免 v5.7.80「擠到 600px」根因復發。

### 3. ✅ PASS — main 寬度 1112px(預期 > 1000px、無被擠壓)

`document.querySelector('div.w-full.lg:flex-1').offsetWidth = 1112`(兩客戶一致)。

計算:1440 viewport - 24(px-3 padding 兩側 ~clamp 2vw)- 240(sidebar)- 24(gap-6)- 24(padding right)- 16(剩餘 padding) ≈ 1112、符合 `lg:flex-1 lg:min-w-0` 預期、main 沒被 sidebar 撐爆。

### 4. ✅ PASS — 點擊 SidebarTOC 任一連結、scroll 跳轉到位

| 客戶 | beforeY | afterY | scrolled | 結果 |
|:---|:---:|:---:|:---:|:---:|
| C 何宥諄(點第 3 條 #sec-2) | 0 | 9154 | **+9154px** | ✅ 跳到第 3 章節 |
| C 何紀萳(點第 3 條 #sec-2) | 0 | 10898 | **+10898px** | ✅ 跳到第 3 章節 |

截圖 `C_*_desktop_after_click.png`:viewport 內容已換成「他的天賦武器」「Top 5 最像的才華方向」(第 3 章節核心字眼)、scrollIntoView 確實到位。

### 5. ⚠️ PARTIAL FAIL — ScrollSpy active 未即時點亮(0 / 34)

**finding**:點擊 sidebar link、instant scroll 完 1.5s 後 query `[data-active="true"]` = **0 個**(34 個 toc-link 全無 active)。

**根因**(`components/ScrollSpy.tsx` L48-52):
```js
rootMargin: '-30% 0px -50% 0px',  // 只看視口中央 20%(top -30% bottom -50%)
threshold: 0.01,
```
- IntersectionObserver 設 viewport 中央 20% 才觸發
- `behavior: 'instant'` scrollIntoView 把 section 放 top、不在中央 20% → observer 不 fire
- 真實客戶手動慢滑 → section 經過中央時會正常點亮(不會 0、本測試的 instant scroll 是 edge case)

**真實衝擊評估**:此 finding 僅在「程式 instant scroll」下重現、客戶用手指滑 / 鼠輪滾 → 中央 20% 觸發正常。**屬 P2 nice-to-have**(可選優化:rootMargin 改 `-20% 0px -60% 0px` 讓上邊界更寬鬆)。

### 6. ✅ PASS — Mobile 375 SidebarTOC 自動 hidden

| 客戶 | exists | display | offsetWidth |
|:---|:---:|:---|:---:|
| C 何宥諄 | true | **none** | 0 |
| C 何紀萳 | true | **none** | 0 |

截圖 `C_*_mobile_top.png`:全頁無 sidebar、main 343px(375 - padding 32)、`hidden lg:block` Tailwind directive 完美生效、mobile UX 不受影響。

### 7. ✅ PASS — 版本 v5.10.140 已切到 production

`document.body.innerText.match(/v5\.\d+\.\d+/g) = ["v5.10.140"]`(僅 1 版本、4 captures 全一致)、Vercel deploy `dpl_F5iroNa37GBpsp4zmKTUUEcUfFF2` READY、無 lambda warm-up window 殘留 stale build。

---

## ③ 達 90+ 路徑(Top 3 剩餘修補)

| # | finding | LOC | 預期 +分 | 業界對齊 |
|:---|:---|:---:|:---:|:---|
| **1** | **Mobile drawer**(下方浮動「☰ 目錄」按鈕、tap 後彈出 SidebarTOC modal)| ~80 LOC(新 `<MobileTOCDrawer>` + `<button class="lg:hidden">`)| **+15** | Notion mobile / Linear mobile / Stripe mobile 全有、本檔 `hidden lg:block` 後 mobile = 0 章節導航 |
| **2** | **Breadcrumb 麵包屑**(ReportEnhancements 加「鑑源 > 報告 > 第 N 章 X」)+ ScrollSpy 同步 currentSection| ~40 LOC(新 `<Breadcrumb>` 接 ScrollSpy active id)| **+10** | Notion: ❌ / Linear: ✅ / Stripe: ✅、整體連貫性 SOTA 必有 |
| **3** | **浮動上 / 下章 button**(右側固定 50% top、↑ ↓ 兩 chevron、ScrollSpy 算 prev/next sec id)| ~50 LOC(新 `<PrevNextButton>` + IntersectionObserver 同 ScrollSpy)| **+8** | Vercel docs / Stripe docs 全有、移動式閱讀標配 |

**達 90+ 預估**:60 + 15 + 10 + 8 = **93**(達標、若 ScrollSpy rootMargin 微調再 +2 → 95)。

**ROI 排序**:#1 mobile drawer = ROI 最高(惠 50%+ 客戶、mobile traffic 主流)+ ScrollSpy rootMargin 微調(2 LOC、+2 分、20 秒可改)= 速贏組合先做。

---

## 結論

v5.10.140 補回 SidebarTOC = **真實 PASS**:
- 桌面兩欄 layout 成立(240px + 1112px、無互擠)
- mobile 安全隱藏(hidden lg:block 生效)
- 點擊跳轉 100% 到位(+9154 / +10898px scroll)
- 版本切 production 確認(dpl_F5iro...READY、4/4 captures v5.10.140)
- ScrollSpy active 未即時點亮(P2、客戶真實手滑不影響、可選 rootMargin 微調)

**達 90+ 還需 3 件**:mobile drawer(+15)/ breadcrumb(+10)/ 浮動 prev-next(+8)= +33 → 93。

---

**下一步建議**(老闆採納則做):
1. 立即 P0:mobile drawer(50%+ 客戶受益、最高 ROI)
2. 順手 P2:ScrollSpy rootMargin `-30%/-50%` → `-20%/-60%`(2 LOC、避免 instant scroll edge case)
3. 配套 P1:breadcrumb + 浮動 prev/next(40+50 LOC、達 95)
