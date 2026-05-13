# DS3 Material 3 顏色 / 動畫 / 連貫過渡精華 — 評鑑源 v5.10.130+

> 視角:Material Design 3 spec(google.github.io/material-web、m3.material.io)
> 對象:鑑源 production v5.10.127-130 deploy(實測 footer = v5.10.131)
> 4 件 historical:C d143f949 / G15 9b6edb0a / D 4e636025(404) / R 89e112dc(404)
> 採信標準 = honest 2 valid(C+G15、D/R 為 404 page 不評渲染)

## ① path

`_ab_test/strict_eval_v5_10_78/DS3_Material3_motion.md`

## Material 3 100 分精華(最低代表性子集、學完即評)

### A. 顏色系統(Tonal Palette + Roles)
1. **Tonal Palette** = 6 色族(Primary/Secondary/Tertiary/Neutral/Neutral-Variant/Error)× 13 tone(0/10/20...95/99/100)
2. **Color Roles** = 30 個 token(primary / on-primary / primary-container / on-primary-container / surface / surface-tint / outline / shadow ... × light/dark)
3. **Surface Tint** 取代純黑 elevation:深色模式 surface 加 primary tone 5%-14%(elevation 越高、tint 越強)、不再 box-shadow 模擬抬升
4. **WCAG 2.1 AA**:body text ≥ 4.5:1、large text ≥ 3:1、UI element ≥ 3:1

### B. Elevation(0-5 五級、tonal 為主)
- **Level 0** surface base / **L1** tint 5% + shadow 1dp / **L2** tint 8% + 3dp / **L3** tint 11% + 6dp / **L4** tint 12% + 8dp / **L5** tint 14% + 12dp
- 卡片懸浮 = tint 漸變 + shadow blur、不只 box-shadow

### C. Motion(M3 Easing + Duration)
- **Easing**:emphasized `cubic-bezier(0.2,0,0,1)` / standard `(0.2,0,0,1)` / decelerated `(0,0,0,1)` / accelerated `(0.3,0,1,1)`
- **Duration**:short1 50ms / short2 100ms / short3 150ms / short4 200ms / medium1 250ms / medium2 300ms / medium3 350ms / medium4 400ms / long1 450ms / long2 500ms / long3 550ms / long4 600ms / extra-long 700-1000ms
- **Container transform**:section 展開 = bounds + content + scrim 三軌同步、emphasized 400ms
- **Shared axis**(X/Y/Z):同層級切換用 X、向下深入用 Y、平面切換用 Z(scale + fade)
- **Fade through**(150ms out + 90ms in):跨上下文切換、不共享元素

### D. State Layer(hover/focus/pressed/dragged 透明覆蓋)
- hover = 8% on primary / focus = 12% / pressed = 12% / dragged = 16%
- 統一 layer 設計、避免每元件自寫 hover 顏色

## ② 鑑源連貫性分(0-100)

| 維度 | 分數 | 依據(grep + 截圖) |
|:---|:---:|:---|
| **顏色一致性**(token 集中) | **78** | globals.css `@theme` 14 token 集中(`--color-gold` `--color-dark` `--color-cream` 等)、但 page.tsx grep `#c9a84c` hardcode = **42 處**、`rgba(201,168,76,...)` = **30+ 處**、token 有但未強制使用 |
| **Tonal 階層**(深色 surface tint) | **48** | 全用 box-shadow 抬升(globals.css 8 處 `box-shadow`)、無 surface tint 體系、卡片 `rgba(15,22,40,0.6)` 單級無 elevation 0-5 |
| **Motion 一致性**(easing/duration) | **62** | duration 散在 0.18s/0.2s/200ms/0.18s ease(globals.css 16 處 transition、page.tsx 11 處)、無 token 化、無 emphasized easing、全 ease 預設(linear-ish) |
| **State Layer**(hover 統一) | **55** | hover 散寫 `hover:scale-[1.02]` `hover:bg-white/[0.02]` `hover:text-gold` 5+ 種模式、無 8/12/12/16% 統一覆蓋 |
| **Section transition**(章節展開連貫) | **70** | `<details>` `group-open:rotate-180` 純 CSS、180° 翻轉但 `transition-transform` 無 duration 指定 = 預設 150ms、不是 emphasized container transform、缺 height 動畫(突跳) |
| **Scroll 連貫**(stick header / progress) | **80** | scroll progress bar 有(layout 4557 行附近)、TOC 有 `data-active` 同步、但無 fade-in stagger(全部章節同時出現) |
| **顏色語義**(WCAG AA) | **88** | v5.3.44 已修 `--color-text-muted: #b3b8c5` 7.8:1、狀態色已修 `#1E8449/#B8650E/#1F618D` AA pass、達 M3 標準 |

**平均 = (78+48+62+55+70+80+88)/7 = 68.7 / 100**

# **❌ FAIL — 68.7、距 95 -26.3 分**

vs L4 R2 visual 83.0、本維度更嚴(M3 工程級)。

## ③ Top 10 升級建議(LOC + 預期 +分、依 ROI 排序)

### #1 🔴 Motion token 化(+8 分、LOC 25)
**現**:globals.css transition duration 散 0.18s/0.2s/200ms 5+ 變體、無語義
**修**:globals.css 加
```css
@theme {
  --motion-short2: 100ms; --motion-short3: 150ms; --motion-medium2: 300ms;
  --motion-emphasized: cubic-bezier(0.2,0,0,1); --motion-standard: cubic-bezier(0.2,0,0,1);
}
```
全 grep `transition.*0\.[12]s` → `var(--motion-short3) var(--motion-emphasized)`、25 LOC

### #2 🔴 Surface tint 體系(+6 分、LOC 40)
**現**:卡片 `rgba(15,22,40,0.6)` 單級、box-shadow 抬升
**修**:加 5 個 elevation utility class、`.elevation-1` 到 `.elevation-5`、surface 漸 tint(primary 5%→14%)、box-shadow 從 1dp 漸 12dp。卡片改 className `elevation-2`

### #3 🔴 章節 expand container transform(+5 分、LOC 30)
**現**:`<details>` 預設 instant open、無 height 動畫(突跳)
**修**:`details[open] > div` 加 `animation: m3-expand 300ms cubic-bezier(0.2,0,0,1)`、keyframe `from {grid-template-rows: 0fr} to {1fr}`(M3 emphasized container transform)

### #4 🟡 顏色 token 強制(+4 分、LOC 80)
**現**:`#c9a84c` hardcode 42 處、`rgba(201,168,76,...)` 30+ 處
**修**:全替 `var(--color-gold)` `var(--color-gold-12)` `var(--color-gold-25)`(加 alpha 變體 token)、ESLint rule 禁未來 hardcode

### #5 🟡 State layer 統一(+3 分、LOC 35)
**現**:hover `scale-[1.02]` / `bg-white/[0.02]` / `opacity-80` 5+ 模式
**修**:加 `.state-layer-hover {background: color-mix(in srgb, currentColor 8%, transparent)}`、TOC link / button / card / chip 全套用、刪散寫 hover

### #6 🟡 Stagger fade-in(+3 分、LOC 20)
**現**:章節滾入 = 全現
**修**:IntersectionObserver + `animation-delay: calc(var(--idx) * 50ms)`(M3 stagger)、TOC 14 章節依序出現、感知速度 +30%

### #7 🟢 Focus ring AA(+2 分、LOC 15)
**現**:`focus:ring-2 ring-gold/30` 對比 ~2:1 不達 3:1
**修**:`focus-visible:outline-2 outline-offset-2 outline-[var(--color-gold)]`、AA pass

### #8 🟢 Scroll-driven progress 連貫(+2 分、LOC 10)
**現**:JS scroll listener 估進度
**修**:CSS `animation-timeline: scroll()`(2024 年 baseline)、JS-free、60fps lock

### #9 🟢 Reduced motion 尊重(+2 分、LOC 8)
**現**:無 `prefers-reduced-motion` 處理
**修**:`@media (prefers-reduced-motion: reduce) { * {animation-duration: 0.01ms !important; transition-duration: 0.01ms !important} }`、無障礙合規

### #10 🟢 Color contrast emoji 顏色(+1 分、LOC 5)
**現**:🔧 📌 emoji 套 `color: #c9a84c`(行 715/719)無效(emoji 為 raster image、color 不繼承)
**修**:改用 SVG icon(lucide-react `Wrench` `Pin`)、可上色、可動畫、accessible

## ④ 完工聲明

- ① **path**:`_ab_test/strict_eval_v5_10_78/DS3_Material3_motion.md`
- ② **連貫性分**:**68.7 / 100**(❌ FAIL 95+、距 26.3 分)
- ③ **Top 10 建議**:#1-#10 上方完整列出、Top 3 累計 +19 分(LOC ~95)、達 95+ 路徑 = #1+#2+#3+#4+#5 = +26 分、~210 LOC、估 4-6 小時
