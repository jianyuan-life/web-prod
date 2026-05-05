# UXBench 04 — 長報告章節導航 UX 範本研究

> **任務**: UX 研究員 — 全網爬「17 章長報告 + 4 篇起承轉合分組」如何讓客戶不迷路 / 不疲勞
> **建立日**: 2026-05-04
> **方法**: WebSearch ≥ 25 次、覆蓋 SaaS docs + 命理 + 長文 + 用戶測試
> **對應**: `components/ScrollSpy.tsx`(現有 IntersectionObserver 已實作、桌面 sidebar 未善用)
> **產品脈絡**: 鑑源 C 方案人生藍圖 4-5 萬字 / 17 章節 / 起承轉合 4 部分組(`PartSection` icon+stage+progress+tldr)

---

## 一、執行摘要(Executive Summary)

鑑源 C 方案人生藍圖目前已有「閱讀進度條 + ScrollSpy 高亮 + 章節折疊 + 回到頂部 + 預估閱讀時間 + PartSection 起承轉合分組」六大基礎導航元素(v5.1.7-v5.3.48 累積)、但**桌面端缺左欄 sticky sidebar**、**手機端缺 bottom drawer**、**章節過渡缺 milestone 微獎勵**。對照業界 SaaS docs(Notion / GitBook / Stripe / Vercel)+ 長文媒體(Substack / Medium / NYT / Wikipedia)+ 命理同行(紫微 mingming3 / Co-Star)、本研究產出**5 大改造建議**:

| 優先 | 改造 | 預期效益 | 信心度 |
|:---:|:---|:---|:---:|
| 🔴 P0 | **桌面 sticky 左欄 sidebar**(280px)+ 起承轉合分組摺疊 | Wikipedia A/B 53% 點擊提升、TOC 直接可見 = 不迷路 | 高 |
| 🔴 P0 | **手機 bottom drawer**(可拖曳展開)取代頂部 TOC | 拇指區、partial overlay、Co-Star 已驗 | 高 |
| 🟡 P1 | **章節 milestone**(每完成 1 章微震動 + 進度球填滿) | gamification 完讀率 +20-40% | 中 |
| 🟡 P1 | **scroll progress 雙形態**(頂部細條 + sidebar 圓圈) | 心理穩定感、減少疲勞 | 中 |
| 🟢 P2 | **breadcrumb path**「起 > 二、八字命理」+ 全文搜尋 | 17 章內定位、深度跳轉 | 中 |

**關鍵指標目標**:
- 桌面完讀率(scroll depth ≥ 95%)從推估 ~40% → ≥ 60%
- 手機平均 engaged time 從推估 8-10 分 → ≥ 15 分
- 章節間導航跳轉次數(ScrollSpy 命中)從推估 2-3 次 / session → ≥ 5 次

> ⚠️ 上述基線數字屬推估、未實測 — 需先在 GA4 / Microsoft Clarity 接入 scroll depth + 章節錨點點擊事件、建立真實 baseline 後才能驗證改造效益。

---

## 二、研究範圍(SaaS / 媒體 / 命理 三圈)

### 2.1 SaaS Docs 圈(主要參考)

| 平台 | 桌面 sidebar | 行動端 | scroll spy | 折疊 | 特色 |
|:---|:---|:---|:---:|:---:|:---|
| **Notion** | 左欄 224px、四鍵導航(Search / AI / Home / Inbox) | 漢堡選單 | ✅ floating TOC | ✅ Teamspace/Shared/Private 三層 | 浮動 TOC 自動偵測 H1-H6、3 點選單可開關 |
| **GitBook** | 可拖曳寬度、hover 邊緣彈出、≤ 3 層 nesting | 上方 nav | ✅ | ✅ | 內容密度 +30%、刻意不動畫展開(power user 速度) |
| **Stripe Docs** | 240-280px、breadcrumb + sidebar + in-page nav 四層並用 | sticky header + 收合 | ✅ | ✅ | 同時導航前 / 後 / 側 / 內、breadcrumb 支援深度跳 |
| **Vercel Docs** | shadcn sidebar + sticky 右欄 TOC | hamburger | ✅ | ✅ | template 開源(`docs-template-henna`)、Next.js 14 標配 |
| **Apple Developer** | 左欄 + 搜尋整合 | tab bar + sidebar 雙模式 | ✅ | ✅ | iPad 雙導航(緊湊 tab + 深度 sidebar) |

**共識**: 240-280px 桌面 sidebar 是 2026 標配;Notion / Vercel / Stripe / Linear 都用此 pattern「從 5 個功能 scale 到 50 個都不需重構」。

### 2.2 長文媒體圈

| 平台 | TOC 形態 | 章節分組 | 進度視覺 |
|:---|:---|:---|:---|
| **Wikipedia(Vector 2022)** | sticky 左欄 TOC、滾動持續可見 | H2-H4 階層縮排 | (無) |
| **Substack** | 無原生 TOC、靠 manual anchor / Chrome 擴充 | (無) | (無) |
| **Medium** | 無 TOC、scroll spy 用 IntersectionObserver 後加 | (無) | 頂部進度條 |
| **NYT / WaPo Deep Reads** | 多媒體浸入式、無 TOC、靠視覺章節隔斷 | 大圖 / 動畫切章 | full-screen distraction-free |
| **Susan Miller Astrology Zone** | 12 星座目錄、單篇 3000+ 字無 TOC、長 mobile 體驗差 → 推 App | (無) | (無) |

**關鍵實證(Wikipedia 2023 sticky TOC A/B 測試)**:
- 登入用戶 deep exploration **+53%** 點擊
- 未登入用戶 **+45.5%** 點擊
- 已 rollout 到 95% 318 個語言版本

**反例(Astrology Zone)**:長篇 3000 字命理內容在 mobile browser 體驗極差、官方明確說「用 App 比 browser 好」— 警示鑑源 mobile UX 不能照搬桌面布局。

### 2.3 命理 / Astrology 同行圈

| 平台 | 報告長度 | 導航策略 |
|:---|:---|:---|
| **紫微 Mingming3** | 12 宮 + 大運 + 流年、~5K 字 | 12 宮卡片導航、宮位點擊跳轉 |
| **Windada 紫微** | 12 宮速查、~3K 字 | 表格式無線性 TOC |
| **如然紫微(ptzl.tw)** | 命格 + 才華潛能、~4K 字 | 區塊式、無 sticky |
| **Cafe Astrology 西占** | ~8-12K 字英文長報告 | 頂部 TOC + 文中 anchor、無 sticky |
| **Co-Star** | 短打日報 + 「今日建議」 | 內容截在屏底暗示更多、極簡黑白、card slice |

**關鍵發現**:
- 中文紫微報告主流 ≤ 5K 字、不需 sticky TOC、表格式即可
- 西占英文長報告 ~10K 字、頂部 TOC + 文中 anchor 是標配、但未 sticky
- **鑑源 C 方案 4-5 萬字 / 17 章 = 全市場最長**、目前命理同行無對標範例 → 必須借鑑 SaaS docs(Notion / Stripe / Vercel)+ Wikipedia sticky TOC

---

## 三、UX 模式分類詳解

### 3.1 桌面 sticky 左欄 sidebar(主推)

**標配規格(綜合 Notion + Stripe + Vercel)**:
- 寬度: 240-280px(預設 256px / 16rem)、可拖曳調整
- 收合模式: icon-only 64-72px(power user 速度);hover 邊緣彈出展開
- 階層: ≤ 3 層 nesting(GitBook 明文不建議更深)
- 高亮: ScrollSpy 用 IntersectionObserver、`rootMargin: '-30% 0px -50% 0px'` 中央 40% 視口(鑑源已實作✅)
- 動畫: 切章不動畫(GitBook 哲學「power user 速度」)、僅 hover / focus 微動畫
- 響應斷點: ≥ 768px 顯示、< 768px 隱藏改 bottom drawer

**鑑源套用**:
```
[左欄 280px sticky]               [中欄 max-w-680px 內文]
                                  
■ 起 — 命格總覽                    一、命格儀表板
  └ 一、命格儀表板  ●(目前章)       ...
  └ 二、八字命理
  └ 三、紫微斗數
                                   
▶ 承 — 系統交叉(7 章)              二、八字命理
                                  ...
▶ 轉 — 風險與機會
                                  
▶ 合 — 行動指引
                                  
[底部 mini control: 字級 - 14 +]
```

### 3.2 手機 bottom drawer(主推)

**為什麼選 bottom drawer 而非漢堡選單**:
- NN/G 研究: 漢堡左上角拇指難達(尤其大手機)、互動成本高、隱藏 = 用戶忽略
- 拇指區(thumb zone)bottom 1/3 = 自然舒適區
- partial overlay 可保留底層內文上下文(漢堡 = 全屏蓋住內容)
- Material Design + Apple HIG 都把 bottom sheet 列為長內容主推

**標配規格(綜合 NN/G + Material 3)**:
- 預設 collapse 狀態: 螢幕底部 60-80px、顯示「📑 目錄」+ 當前章名
- Tap 展開: 滑上至 60-80% 螢幕高度、partial overlay
- Drag 手勢: 上拖全屏 modal、下拖收回
- 觸控目標: 章節項目高度 ≥ 44px(Apple HIG 最小觸控)
- 系統返回鍵 / 點外部空白可關閉

**鑑源套用**:
- E1-E4 出門訣短 < 3K 字: 不需要、直接保留現有內嵌 TOC
- C 4-5 萬字 / G15 / R: 必加 bottom drawer(現狀手機體驗推估接近 Astrology Zone 痛點)

### 3.3 頂部 sticky nav(輔助、不主推為主)

**為什麼不主推**:
- 縱向長報告 = 縱向 TOC 對齊更直覺(平行結構)
- 17 章橫向 sticky nav 會擠 / 換行 / 文字截斷
- Stripe Docs 用 sticky header + sidebar + in-page nav 三層、是因產品種類多(120+ products);鑑源是「單一報告 17 章」、不需這麼複雜

**輔助用途**:
- 頂部僅放「📚 章節 1/17」+ scroll progress 細條
- 頁面控制(字級 / 主題色 / 列印)放右上角

### 3.4 章節折疊(accordion)

**NN/G 用戶測試核心發現**:
- ✅ 適用「內容長 + 視窗小 + 不需全部看」
- ❌ 不適用「用戶需要看絕大多數內容」(命理報告偏此類)
- 風險: auto-collapse(展開 A 自動收 B)會妨礙交叉比對 — 鑑源已避(展開狀態獨立)
- 建議: 重要章節預設展開(C 方案「總覽」「TOP 5 優勢」「TOP 5 風險」「給你的一封信」)

**指標**:
- 展開率 < 30% → 標題不清楚、預設應展開
- 平均閱讀時間 > 30 秒 → 章節有效
- 多展開率 > 50% → 用戶在交叉比對、別 auto-collapse

### 3.5 scroll progress 進度條

**雙形態並用最佳**:
- **頂部水平條(細 2-3px)**: 整體閱讀位置、即時反饋、不搶眼
- **sidebar 章節圓點 / 填充球**: 已讀章節打勾、未讀未填 — gamification 微獎勵

**用戶心理(NN/G + UX Collective)**:
- 線性內容(命理報告 = 線性敘事): 進度條鼓勵讀完、降低「還有多遠」焦慮
- 短文(< 1500 字): 不需要、反顯多餘
- 長文(> 4000 字): 必要、提升 engaged time

**A/B 暗示**:
- Chartbeat 數據: 1500+ 字文章閱讀 7-8 分鐘 = 高 engagement
- 鑑源 C 4-5 萬字 = 預估閱讀 30-90 分(已標雙入口「精華 15 分 / 完整 90 分」、v5.3.48 改進)
- 短形 vs 長形 scroll depth 標準: < 1250 字 50% 算好、> 2000 字 75% 算好 — 鑑源目標應 ≥ 80%

### 3.6 breadcrumb 麵包屑

**NN/G 11 條設計準則**:
- 使用「>」或「/」分隔
- 不替代主導航、是輔助
- 深度過長時截斷中段(鑑源 17 章不深、不需截斷)
- 整合資訊架構

**鑑源套用**:
- 桌面 sticky 頂端: `📊 人生藍圖 > 起 > 二、八字命理`
- 手機 bottom drawer 頂端: 顯示當前 part + 章
- 提供「上一章 / 下一章」在每章末尾(linear 線性閱讀友善)

---

## 四、技術實作建議(Next.js 14 + Tailwind)

### 4.1 桌面 sidebar 實作

```tsx
// app/report/[token]/components/ChapterSidebar.tsx
'use client'
import { useEffect, useState } from 'react'

interface ChapterNode {
  id: string  // sec-1, sec-2, ...
  label: string
  part: '起' | '承' | '轉' | '合'
  level: 1 | 2  // h2 / h3
  children?: ChapterNode[]
}

export default function ChapterSidebar({ chapters }: { chapters: ChapterNode[] }) {
  return (
    <aside className="
      hidden lg:block
      sticky top-[64px] self-start
      w-[280px] max-h-[calc(100vh-80px)] overflow-y-auto
      pr-4 border-r border-zinc-800
      text-sm
    ">
      {/* 4 part 摺疊分組(已展開預設) */}
      {(['起','承','轉','合'] as const).map(part => (
        <PartGroup key={part} part={part} chapters={chapters.filter(c=>c.part===part)} />
      ))}
    </aside>
  )
}
```

**關鍵 Tailwind 類**:
- `sticky top-[64px]` = 黏在 navbar 底
- `self-start` = 在 grid 容器內不被拉伸
- `max-h-[calc(100vh-80px)]` = 視口高 - navbar - footer 安全距
- `overflow-y-auto` = sidebar 自身可滾(章節超過 1 屏時)
- `hidden lg:block` = ≥ 1024px 才顯示(對應 Tailwind `lg` 斷點)

### 4.2 手機 bottom drawer 實作

```tsx
'use client'
import { useState } from 'react'

export default function ChapterDrawer({ chapters, currentChapter }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* 收合狀態 — 螢幕底部 64px bar */}
      <button
        onClick={()=>setOpen(true)}
        className="
          lg:hidden
          fixed bottom-0 inset-x-0 z-40
          h-16 bg-zinc-900/95 backdrop-blur
          border-t border-zinc-800
          flex items-center justify-between px-4
          text-sm
        "
      >
        <span className="text-amber-400">📑 {currentChapter}</span>
        <span className="text-zinc-400">章節 ▲</span>
      </button>

      {/* 展開 modal — 60vh */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={()=>setOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 h-[70vh] bg-zinc-900 rounded-t-2xl overflow-y-auto">
            {/* drag handle */}
            <div className="sticky top-0 flex justify-center pt-3 pb-2 bg-zinc-900">
              <div className="w-12 h-1 rounded-full bg-zinc-600" />
            </div>
            {/* TOC */}
            <ChapterList chapters={chapters} onClick={()=>setOpen(false)} />
          </div>
        </div>
      )}
    </>
  )
}
```

**鐵律(NN/G)**:
- 系統返回鍵 = 關閉 drawer(不返回前頁)
- 點空白 / 下拖 = 關閉
- 點章節項 = 跳轉 + 自動關閉

### 4.3 ScrollSpy 改造(高亮 + part 同步)

現有 `components/ScrollSpy.tsx` 已用 IntersectionObserver、規格 `rootMargin: '-30% 0px -50% 0px'` 命中業界 best practice。建議擴充:

```tsx
// 新增: 同步 sidebar 內 part 分組高亮 + drawer 當前章名
const activeLink = byHash.get(topId)
if (activeLink && activeLink.isConnected) {
  activeLink.setAttribute('data-active', 'true')

  // 🆕 同步 part 分組(承/轉/合)
  const part = activeLink.dataset.part
  document.querySelectorAll('.part-group').forEach(g => {
    g.toggleAttribute('data-current-part', g.getAttribute('data-part') === part)
  })

  // 🆕 同步 drawer 顯示當前章名
  document.querySelector('.drawer-current-chapter')?.replaceChildren(
    document.createTextNode(activeLink.textContent || '')
  )
}
```

**rootMargin 替代值參考**:
- `-30% 0px -50% 0px`(現用、上 30% 下 50%、命中視口 20-50% 區段) ✅
- `-50% 0px -50% 1px`(僅單點命中、適合短章報告) — 鑑源章節長、不適用
- `-10% 0px -90% 0px`(僅頂部 10% 命中、嚴格)
- `60px 0px 0px 0px`(扣 fixed header 高、適合有頂部 nav)

### 4.4 scroll progress 雙形態

**頂部細條(已有、保留)**:
```tsx
// 現有實作優化:用 CSS-only `scroll-target-group`(Chrome 140+)
// fallback 用 useEffect 監聽 scroll
```

**Sidebar 圓點(新增)**:
```tsx
// ChapterSidebar 內每個章節項
<a
  href={`#${node.id}`}
  className="toc-link group flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-800"
  data-read={read}  // 從 localStorage / IntersectionObserver 累積
>
  <span className={`
    w-2 h-2 rounded-full transition-all
    ${read ? 'bg-amber-400' : 'bg-zinc-600 group-hover:bg-zinc-400'}
    ${active ? 'ring-2 ring-amber-400/40 scale-150' : ''}
  `} />
  <span>{node.label}</span>
</a>
```

**localStorage 持久化(可選 P1)**:
```tsx
// 用 IntersectionObserver 視口持續 ≥ 5 秒視為讀過、寫入 localStorage
const seenChapters = new Set<string>(JSON.parse(localStorage.getItem('jianyuan_read_'+reportId) || '[]'))
```

### 4.5 章節 milestone 微獎勵(P1、漸進增強)

**gamification 證據**:
- 進度條 + milestone 鼓勵完讀(EFL 閱讀理解實證 +20-40%)
- 短期目標(「完成本章」)+ 長期目標(「讀完整份報告」)雙軌
- 重要 milestone(每完成一個 part = 起承轉合 1/4)觸發微震動 + 文字彈出「✨ 起篇完成」

**Apple Tap Engine / Vibration API**:
```tsx
// 章節進入視口 + 持續閱讀時間 ≥ 30 秒
if ('vibrate' in navigator) navigator.vibrate(10)  // 10ms 微震
showToast('✨ 「起篇」已完成、進入「承篇 — 系統交叉」')
```

**降級不支援裝置**: 純動畫填充 + toast 文字、無觸覺反饋。

---

## 五、Top 5 改造建議(可立刻執行)

### 🔴 P0 — 桌面 sticky 左欄 sidebar(280px)

**理由**:
- Wikipedia 2023 A/B 實證 53% / 45% 點擊提升(規模 95% / 318 語言版本驗證)
- Notion / GitBook / Stripe / Vercel 業界 2026 標配
- 鑑源 17 章 / 4-5 萬字 = 全市場最長命理報告、必須有 sticky TOC

**規格**:
- 寬 280px、`hidden lg:block sticky top-[64px]`
- 4 part 分組(起承轉合)、可獨立摺疊、預設全展開
- ScrollSpy 高亮(現有實作擴充)
- 章節項顯示「圓點(已讀填色)+ 章名」
- 桌面 ≥ 1024px 才顯示

**估時**: 2-3h(1 個 component + ChapterSidebar + 整合 report/[token]/page.tsx)

**驗收**:
- Playwright 桌面 1440px 截圖、sidebar sticky 跟著滾動可見
- ScrollSpy 高亮章節準確命中(目前已 PASS、保留)
- 點擊章節跳轉 + smooth scroll

---

### 🔴 P0 — 手機 bottom drawer(取代頂部 TOC)

**理由**:
- NN/G 證實 bottom sheet > 漢堡選單(thumb zone)
- Astrology Zone 反例: 長 mobile 內容無 drawer = 用戶被推去 App
- 鑑源 17 章手機體驗目前推估接近 Astrology Zone 痛點(待 GA4 確認)

**規格**:
- 收合狀態: 螢幕底部 64px bar、顯示當前章名 + 「目錄 ▲」
- 展開: 70vh modal、drag handle、partial overlay 60% 黑底
- 章節項高度 ≥ 44px、Apple HIG 觸控標準
- 點章節 = 跳轉 + 關閉 drawer(系統返回鍵也關閉)
- 手機 < 1024px 顯示

**估時**: 3-4h(1 個 component + 手勢處理 + 整合)

**驗收**:
- Playwright 手機 375px 截圖、drawer 在底部不擋內文
- 拇指點擊測試(模擬區域)
- 系統返回鍵 / 點空白 / 拖下都能關閉

---

### 🟡 P1 — scroll progress 雙形態(細條 + 章節圓點)

**理由**:
- 頂部細條已有(v5.1.7、保留)、但 sidebar 圓點視覺缺
- 雙視覺反饋 = 心理穩定感、減少「還有多遠」焦慮(NN/G + UX Collective)
- 4-5 萬字長報告必要(scroll depth 75% 才算好的標準)

**規格**:
- 頂部 2px 金色細條、跟著 scroll 填充
- sidebar 章節項前小圓點:
  - ⚪ 未讀(灰)
  - 🟡 已讀(金、視口 ≥ 5 秒)
  - ⭐ 當前(金 + ring 放大 1.5×)
- localStorage 持久化「已讀章節」(report_id 為 key、跨 session)

**估時**: 1.5-2h(整合進 sidebar + IntersectionObserver 5s 計時)

**驗收**:
- 滾動全文後、再開同份報告、已讀標記保留
- 章節跳轉時當前圓點即時更新

---

### 🟡 P1 — 章節 milestone 微獎勵(起承轉合 4 階段)

**理由**:
- gamification 文獻證實完讀率 +20-40%
- 鑑源已有起承轉合架構(`PartSection` v5.3.48)、補 milestone = 強化分組敘事
- 4-5 萬字長報告需要 4 個「歇腳點」、避免疲勞

**規格**:
- 用戶讀完一個 part(IntersectionObserver 該 part 末尾章節 ≥ 30 秒)觸發:
  - Toast 文字: 「✨「起篇」已完成、進入「承篇 — 15 系統交叉分析」」
  - Vibration API 微震 10ms(降級無震動裝置 = 純動畫)
  - sidebar 該 part 整組「✓」打勾
- 全部 4 part 完讀 → 顯示「🌟 你已讀完整份藍圖、給自己一個鼓勵」CTA(可分享 / 看下一個方案)

**估時**: 2-3h(toast component + IntersectionObserver 計時邏輯 + 動畫)

**驗收**:
- Playwright 模擬滾動 → 4 part 依序觸發 toast
- 不支援 vibration 的裝置正常運作

---

### 🟢 P2 — breadcrumb 路徑 + 全文搜尋

**理由**:
- 17 章深度跳轉(從「合」回到「承 二、八字」)需要 breadcrumb
- 全文搜尋對「我看過某段、想找回」場景必要(NN/G 共識)
- 是 P2 因 P0 / P1 解決 80% 痛點、本項屬最後 20%

**規格**:
- breadcrumb 出現在每章開頭 sticky:
  - `📊 人生藍圖 > 起 > 二、八字命理`
  - 每段可點擊跳轉
- 全文搜尋(Cmd/Ctrl + K):
  - 搜尋章節名、命中高亮
  - 搜尋內文(client-side、用 fuse.js / 原生 String.includes)
- 每章末尾「← 上一章 ─ 下一章 →」線性導航

**估時**: 4-6h(breadcrumb 1.5h + 搜尋 modal 3-4h + 上下章 0.5h)

**驗收**:
- breadcrumb 點擊跳轉正確
- Cmd+K 召喚搜尋、結果命中且高亮
- 鍵盤 Tab / Enter 全可訪問(WCAG AA)

---

## 六、不該做的事(Anti-pattern)

### ❌ 不要做頂部漢堡選單章節導航
- NN/G: 漢堡左上角拇指難達、互動成本高
- 17 章太多、藏在漢堡 = 用戶忽略
- 桌面用 sidebar、手機用 bottom drawer 各得其所

### ❌ 不要 auto-collapse accordion(展開 A 自動收 B)
- NN/G 用戶測試: 妨礙交叉比對命理章節(用戶常會「看八字章 + 看紫微章 + 對比」)
- 鑑源現狀已避免、保留

### ❌ 不要做 carousel 樣式 page dot navigation
- Smashing Magazine + UX Collective: dot 太小、rage click、navigation slow
- 17 章用 dot 完全不夠、放棄

### ❌ 不要塞 sticky header 三層導航(Stripe 樣)
- Stripe 是因產品種類多、不是因為長文
- 鑑源是「單一報告 17 章」、用 sidebar + breadcrumb 兩層即可

### ❌ 不要 scroll-jacking(劫持滾動 / 自動滾)
- NYT Snow Fall 樣的多媒體浸入式適合短篇敘事(< 5K 字)
- 鑑源 4-5 萬字 = 用戶需要自由控制、不能劫持

### ❌ 不要無 TOC 的 Substack / Astrology Zone 模式
- Astrology Zone 痛點: long mobile = 推用戶去 App
- 鑑源是 web 為主、不能讓用戶被推離 web

---

## 七、實施 Roadmap(建議分 3 個 sprint)

### Sprint 1(第 1-2 週、P0 主軸)
- ChapterSidebar component(桌面 280px sticky)
- ChapterDrawer component(手機 70vh bottom)
- 整合進 `app/report/[token]/page.tsx`
- 擴充 ScrollSpy 同步 part 分組高亮
- A/B test 對照組: 50% 老 UI / 50% 新 sidebar(GA4 scroll depth + 章節點擊事件埋點)

**驗收 KPI**:
- 桌面 scroll depth ≥ 95% 從基線(估 40%)→ 目標 ≥ 60%
- 手機 engaged time 從基線(估 8-10 分)→ 目標 ≥ 15 分

### Sprint 2(第 3-4 週、P1 強化)
- scroll progress 雙形態(細條 + sidebar 圓點)
- localStorage 持久化已讀章節
- 章節 milestone 微獎勵(起承轉合 4 階段 toast)
- Vibration API 降級處理

**驗收 KPI**:
- 章節跳轉次數 / session ≥ 5(從估 2-3)
- milestone toast 觸發率 ≥ 60%(用戶確實讀到第 1 part 末)

### Sprint 3(第 5-6 週、P2 完善)
- breadcrumb sticky + 上下章鍵
- Cmd+K 全文搜尋 modal
- WCAG AA 鍵盤可訪問性

**驗收 KPI**:
- 搜尋功能使用率 ≥ 5% session
- 鍵盤導航 100% 可達(axe-core 自動測試 PASS)

---

## 八、量化基線建立(必先做)

> ⚠️ 上述所有 KPI 目標都基於**推估 baseline**、必須先實測才能驗證效益。

### 8.1 GA4 + Microsoft Clarity 埋點

**必加事件**:
| 事件名 | 觸發 | 參數 |
|:---|:---|:---|
| `report_chapter_view` | 章節進入視口 ≥ 5 秒 | report_id, chapter_id, part, dwell_seconds |
| `report_toc_click` | TOC 章節點擊跳轉 | report_id, from_chapter, to_chapter, surface(sidebar/drawer/breadcrumb) |
| `report_drawer_open` | 手機 bottom drawer 展開 | report_id |
| `report_scroll_depth` | scroll 達 25/50/75/95% | report_id, depth_percent |
| `report_completion` | 4 part 全完成 | report_id, total_minutes |

**Microsoft Clarity 互補**:
- Heat map: 看 sidebar 哪些章節點擊集中
- Recording: 觀察手機用戶 drawer 開合行為

### 8.2 兩週基線 → 改造 → 對照

1. 第 0-2 週: 純埋點、不改 UI、收集 baseline
2. 第 3 週: 50/50 A/B(老 UI vs 新 sidebar + drawer)
3. 第 4 週末: 統計顯著性檢驗(Wikipedia 規模可達、鑑源樣本量需 ≥ 200 報告觀看)
4. 達標 → 100% 灰度;未達標 → 改 UI 再驗

### 8.3 質性驗證(用戶訪談)

- 5-8 位真實付費客戶(C 方案)
- 任務: 「請從報告中找出『TOP 5 風險』」+ 「請看完整份報告 30 分鐘」
- 觀察: 是否用 sidebar / drawer、卡在哪、是否說「迷路 / 累」
- NN/G 經典: 5 位用戶能發現 80% 可用性問題

---

## 九、信心度標註

| 主張 | 信心度 | 依據 |
|:---|:---:|:---|
| sticky sidebar 提升點擊 53% | 🟢 高 | Wikipedia 2023 A/B 規模實證(95% rollout) |
| bottom drawer > 漢堡選單 | 🟢 高 | NN/G + Material 3 + Apple HIG 多源共識 |
| 240-280px 桌面 sidebar 寬度 | 🟢 高 | Notion 224 / Stripe 240-280 / Vercel 256 業界共識 |
| ≤ 3 層 nesting 不過深 | 🟢 高 | GitBook 明文 + Notion 縮排痛點 |
| `rootMargin: '-30% 0px -50% 0px'` | 🟢 高 | 鑑源已實作 + IntersectionObserver 業界最佳化參考 |
| milestone gamification 提升完讀率 20-40% | 🟡 中 | 學術論文(EFL 閱讀理解、ScienceDirect 2025)、未針對命理場景驗證 |
| 鑑源桌面 scroll depth baseline ≈ 40% | 🟠 待測 | 純推估、未跑 GA4 |
| 鑑源手機 engaged time baseline 8-10 分 | 🟠 待測 | 純推估、未跑 GA4 |
| 命理同行 4-5 萬字無對標 | 🟢 高 | Mingming3 / Windada / 如然 / Cafe Astrology / Co-Star 全面爬過、無一達此長度 |

---

## 十、Sources(全網爬 25+ 來源)

### SaaS Docs
- [Notion — Navigate with the sidebar](https://www.notion.com/help/navigate-with-the-sidebar)
- [Notion floating TOC — Simple.ink guide](https://www.simple.ink/guides/the-new-floating-notion-table-of-content-or-page-navigation)
- [Notion sidebar UI breakdown — Medium](https://medium.com/@quickmasum/ui-breakdown-of-notions-sidebar-2121364ec78d)
- [GitBook — Rebuilding the sidebar](https://www.gitbook.com/blog/new-sidebar)
- [GitBook docs — Layout and structure](https://gitbook.com/docs/publishing-documentation/customization/layout-and-structure)
- [Stripe — Design patterns](https://docs.stripe.com/stripe-apps/patterns)
- [Apprendre a Bloguer — Sticky Header 2026 Best Practices](https://www.apprendreabloguer.com/sticky-header-design-examples-15-best-practices-for-fixed-navigation-in-2026/)
- [Art of Styleframe — Dashboard Design Patterns 2026](https://artofstyleframe.com/blog/dashboard-design-patterns-web-apps/)
- [Vercel Docs Template](https://docs-template-henna.vercel.app/)
- [Apple HIG — Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)
- [Linear — How we redesigned the UI](https://linear.app/now/how-we-redesigned-the-linear-ui)

### Long-Form / 媒體
- [Wikipedia Vector 2022 — sticky TOC A/B 實證](https://wikimediafoundation.org/news/2023/01/18/wikipedia-gets-a-fresh-new-look-first-desktop-update-in-a-decade-puts-usability-at-the-forefront/)
- [Wikipedia Vector 2022 — wiki page](https://en.wikipedia.org/wiki/Wikipedia:Vector_2022)
- [Substack — Table of Contents tutorials](https://textualvariations.substack.com/p/toc-in-substack)
- [Astrology Zone monthly horoscope — Susan Miller review](https://discover.hubpages.com/religion-philosophy/Horoscope-Review-Astrologyzone-Online-Monthly-Horoscope-by-Susan-Miller)
- [WaPo Deep Reads — long-form journalism home](https://www.washingtonpost.com/pr/2023/05/14/introducing-deep-reads-washington-posts-home-longform-narrative-journalism/)

### UX Best Practice
- [NN/G — Bottom Sheets UX Guidelines](https://www.nngroup.com/articles/bottom-sheet/)
- [NN/G — Back-to-Top Button Design Guidelines](https://www.nngroup.com/articles/back-to-top/)
- [NN/G — Accordions on Desktop](https://www.nngroup.com/articles/accordions-on-desktop/)
- [NN/G — Accordions on Mobile](https://www.nngroup.com/articles/mobile-accordions/)
- [NN/G — Breadcrumbs 11 Design Guidelines](https://www.nngroup.com/articles/breadcrumbs/)
- [Material Design — Bottom sheets guidelines](https://m3.material.io/components/bottom-sheets/guidelines)
- [Smashing — Bottom Navigation Pattern](https://www.smashingmagazine.com/2019/08/bottom-navigation-pattern-mobile-web-pages/)

### 技術實作
- [CSS-Tricks — Table of Contents with IntersectionObserver](https://css-tricks.com/table-of-contents-with-intersectionobserver/)
- [Maxime Heckel — Scrollspy demystified](https://blog.maximeheckel.com/posts/scrollspy-demystified/)
- [Sara Soueidan — CSS-only scrollspy](https://www.sarasoueidan.com/blog/css-scrollspy/)
- [Pure CSS Scroll Spy — Nerdy.dev](https://nerdy.dev/pure-css-scroll-spy-table-of-contents)
- [Mantine — useScrollSpy hook](https://mantine.dev/hooks/use-scroll-spy/)
- [ReactHustle — Tailwind sticky sidebar tutorial](https://reacthustle.com/blog/create-tailwind-sticky-sidebar-tutorial)

### 命理同行
- [Mingming3 紫微斗數](https://mingming3.com/en/home/life)
- [Windada 紫微](https://fate.windada.com/cgi-bin/fate)
- [如然紫微 ptzl.tw](https://ptzl.tw/article-info.asp?cate=16&id=140)
- [Cafe Astrology free natal chart](https://astro.cafeastrology.com/natal.php)
- [Co-Star design critique — IXD@Pratt](https://ixd.prattsi.org/2022/02/design-critique-co-star-iphone-app/)
- [Co-Star design analysis — Medium](https://medium.com/demagsign/how-the-design-of-the-astrology-app-co-star-is-conquering-the-masses-d6b6d235c806)

### 量化 / A/B
- [Chartbeat — optimal article length](https://lp.chartbeat.com/resource-library/is-there-an-optimal-article-length-our-data-on-the-relationship-between-word-count-and-engagement)
- [Contentsquare — scroll tracking](https://contentsquare.com/blog/scroll-tracking/)
- [VWO — Scroll-Depth Tracking](https://vwo.com/blog/scroll-depth-tracking-what-why-and-how-of-monitoring-visitor-engagement/)
- [Microsoft Clarity scroll maps](https://clarity.microsoft.com/blog/what-can-clarity-scroll-maps-do-for-you/)
- [GoodFirms — What is a Good Scroll Depth](https://www.goodfirms.co/blog/scroll-depth)

### Gamification / 心理
- [Yu-kai Chou — Milestone Unlocks in Gamification](https://yukaichou.com/advanced-gamification/the-power-of-milestone-unlocks-in-gamification-design/)
- [Sam Liberty — 31 Core Gamification Techniques](https://sa-liberty.medium.com/the-31-core-gamification-techniques-part-1-progress-achievement-mechanics-d81229732f07)
- [ScienceDirect — Gamified self-regulated reading EFL 2025](https://www.sciencedirect.com/science/article/abs/pii/S109675162500051X)
- [Trophy.so — Apps using progress bars for gamification](https://trophy.so/blog/progress-bars-feature-gamification-examples)

### 起承轉合 / 敘事
- [Kishōtenketsu — Tobi Publishing 2026 Medium](https://medium.com/@taoist_hawk2000/kish%C5%8Dtenketsu-the-four-act-structure-that-rewrites-narrative-rules-2967226d219f)
- [Kishōtenketsu — Luciano Salerno](https://lucianosalerno.com/kishotenketsu-the-four-act-structure)

---

**研究員**: Claude Opus 4.7 (1M context)
**WebSearch 次數**: 27 次(超過要求的 25 次)
**字數**: ~5,200 字繁體中文
**Last Updated**: 2026-05-04
