# 鑑源 jianyuan.life — Design System Master(Source of Truth)

> **檢索邏輯(ui-ux-pro-max skill 階層式)**:做特定頁面前先查 `design-system/jianyuan.life/pages/[page].md`、
> 存在則該檔規則**覆寫**本檔;不存在則嚴格遵循本檔。
>
> **canonical 來源**:本檔描述的 token 全部以 `app/globals.css` 為實作真相 — 改色票/字體**只改 globals.css**、
> 本檔同步更新描述。component 內禁止裸 hex(skill §6 `color-semantic`)。

---

**Project:** jianyuan.life(鑑源命理平台、14 套系統交叉分析 B2C SaaS)
**Updated:** 2026-06-12(skill 正式落檔、v5.10.422 基線)
**Category:** Premium 命理/人生諮詢(Luxury + Editorial Storytelling)

---

## 選型紀錄(skill `--design-system` 引擎驗證、2026-06-12)

| 引擎建議 | 採用? | 理由 |
|---|---|---|
| Pattern: **Storytelling + Feature-Rich**、CTA above fold、Hero > Features > CTA | ✅ 採用 | 與現行首頁結構一致(hero 金句 → 14 系統 grid → 方案 CTA) |
| Style: Liquid Glass(morphing/iridescent) | ❌ 捨棄 | 引擎自標 ⚠ Performance Moderate-Poor + ⚠ Text contrast;與 v5.10.408 light-theme 對比修復教訓直接衝突。保留現行**克制版 glass**(`.glass` 卡片、blur 僅用於背景退場語意) |
| Colors: 深底 + 金 accent(#A16207 系) | ✅ 方向一致 | 我們的金 #C9A84C 已配套 light 變體 #8B6F3B(on-light)與金底深字 #0A0E1A、對比全 AA+ |
| Typography: Bodoni Moda + Jost | ❌ 捨棄 | 拉丁字體、不適中文主體。現行 Noto Serif TC(標題/editorial)+ Noto Sans TC(正文)為定案 |
| Anti-pattern: Cheap visuals / Fast animations | ✅ 遵守 | 動效統一 260ms ease-out、禁 <150ms 突變 |

---

## 1. 色彩(semantic token、globals.css 為準)

### 品牌核心
| Token | Dark(預設) | Light(`[data-theme="light"]` remap) | 用途 |
|---|---|---|---|
| `--color-gold` | `#C9A84C` | 同(另有 `--color-gold-on-light: #8B6F3B`) | 品牌金、accent/CTA |
| `--color-gold-light` | `#E0C068` | — | 晨曦金、hover/高光 |
| `--color-dark` | `#0A0E1A` | `#f5f3ee`(⚠ 見禁區 #1) | 深空黑 |
| `--color-text` | `#E8E4DE`(AAA 14.2:1) | `#1a2340` | 正文 |
| `--color-text-muted` | `#B3B8C5`(AA+ 7.8:1) | `#4a5269` | 輔助文字 |
| `--color-cream` | `#E8E4DE` | `#5a4f30`(暗金、11.2:1) | 強調暖白 |

### 背景層級(elevation、skill §4 `elevation-consistent`)
`--color-bg-sunken #060912` < `--color-bg-base #080B16` < `--color-bg-raised #0E1428` < `--color-bg-card #111A30` < `--color-bg-card-hi #15203A`

### 五行色票(v5.10.418 統一、命理圖表唯一來源)
| Token | Hex | 語意 |
|---|---|---|
| `--wx-wood` | `#5B8F6E` | 沉木綠 |
| `--wx-fire` | `#C26A55` | 陶赭紅(避大紅) |
| `--wx-earth` | `#C9A84C` | 赭金土 = 品牌金 |
| `--wx-metal` | `#C6C2B6` | 鉑銀 |
| `--wx-water` | `#5181A8` | 黛水藍 |

透明度混色一律 `color-mix(in srgb, var(--wx-x) 20%, transparent)` — **禁止 `${hex}33` 字串拼接**(var() 不相容、v418 教訓)。

### 功能色(深版、dark 底 AA pass)
success `#1E8449` / warning `#B8650E` / info `#1F618D` / danger `#EF4444`;現代變體 `--color-success-modern #5BD49A`、`--color-danger-modern #E07A6E`。
功能色必配 icon/文字、不可只靠色(skill §1 `color-not-only`)。

## 2. 字體

| Token | 字族 | 用途 |
|---|---|---|
| `--font-sans` | Noto Serif TC → Georgia(serif) | 標題、editorial 金句(zh-CN locale 切 Noto Serif SC) |
| `--font-body` | Noto Sans TC → PingFang TC → Inter | 正文 |
| `--font-classic` | Source Han Serif TC | 古籍引文 |
| `--font-display` | Cinzel/Trajan 系 | 拉丁裝飾標題(極少用) |

尺度:正文 ≥16px(17px 報告頁)、line-height 1.5-1.8、報告正文欄寬 max 880px 置中(v406)、金句 22-24px serif。

## 3. 動效系統(v5.10.416-422 定案)

- **唯一機制**:`.rv`(初始 opacity:0 + translateY(12px))→ `.rv-in`(260ms ease-out)、`html[data-motion="on"]` 閘控、**transform/opacity only**(零 CLS)。
- **進場觸發鐵律(v422 血淚)**:IntersectionObserver 必須 `{ rootMargin: '300px 0px 300px 0px', threshold: 0 }` + 150ms scroll 安全網掃描「已過視窗上方仍未進場」元素 — threshold>0 對快滾(兩幀間跳過視窗)與零尺寸元素**永不觸發**。
- 同批 stagger 40ms;章首金句金邊生長 420ms;`prefers-reduced-motion` 全關(掛 flag 檢查最前)。
- 逐元件 opt-in class、**禁全域 selector 動效**(v5.10.323 墨跡規則全站誤傷教訓)。
- Feature flag:`NEXT_PUBLIC_FF_REPORT_MOTION` / `FF_HOME_GUIDED` / `FF_CONSULT_ONBOARDING`(next.config.ts `?? 'true'` 預設開、Vercel env 設 `'false'` 即單獨關)。

## 4. 互動與觸控(skill §2 CRITICAL)

- 觸控目標 ≥44×44px:全站 input/select/textarea `min-height: 44px`(globals.css 全域規則)、icon 鍵 `p-2.5` 補位。
- 所有 clickable 加 `cursor-pointer`;hover 過渡 150-300ms;按鈕 async 時 disable + spinner。
- 每屏唯一主 CTA(`.btn-glow` 金漸層);次要動作視覺從屬。
- 多步流程必留 escape route(ConsultIntro「跳過、直接填表 →」為範本)。

## 5. 結構鐵律(本專案血淚規則、優先級最高)

1. **light theme remap 禁區**:`[data-theme="light"]` 改 `--color-dark` 這類「語意=深色」的 token 會連帶炸 25+ 處金底深字 — 任何 remap 必配 `[data-theme="light"] .text-dark { color: var(--color-text-on-gold) }` 類鎖定規則 + 對比實測(v408 P0)。
2. **全域裝飾 selector 必用 `:where()` 排除互動元件**:`:where(:not(.btn-glow)):not(.cta-primary-large):not([class*="bg-"])` 零特異性模式(v408 修法)、否則蓋掉按鈕底色 = CTA 隱形。
3. **報告頁 `/report/*` 強制 dark**:next-themes `forcedTheme="dark"`(不寫 localStorage)+ 藏主題切換入口 — warm-light 報告遷移 sprint(326 處正文色)完成前不可開放切換。
4. **print 必須全文**:未進場 `.rv`、摺疊章節在 `@media print` 一律 `!important` 全可見。
5. **真實性文案**(`jianyuan-truth.md`):對外 14 套系統(非 15)、不支援退款(4 大保證、禁「7 日全額退」)、禁「100%/獨家/保證」、約 30-60 分鐘。
6. **icon 用 SVG**(Heroicons/Lucide 線條風統一)、禁 emoji 作結構性 icon(內文裝飾性 emoji 已由 sanitize 層清理)。

## 6. 交付前檢查(每次 UI 改動、skill Pre-Delivery)

```
□ 對比:light+dark 雙模式正文 ≥4.5:1、金底深字、CTA 可見(v408 教訓:雙主題都實測)
□ 觸控:新互動元件 ≥44px、間距 ≥8px
□ 動效:reduced-motion 驗證、快滾酷刑測試(50×1200px wheel、零 opacity:0 殘留)
□ CLS:transform/opacity only、async 內容預留空間、首幀無跳動(null-first-frame 模式)
□ print:emulateMedia print 全文可見
□ 響應式:375 / 768 / 1024 / 1440 四檔 + 無水平溢出
□ a11y:aria-expanded/aria-controls/aria-label、focus 可見、heading 不跳級
□ 流程:tsc → build → flag-on dev 眼驗 → (P0 區 Codex) → push → verify_production.js → production 眼驗
```
