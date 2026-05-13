# DS3 R2 Material 3 Motion Re-evaluation — v5.10.139

> **基線**:DS3 R1 (v5.10.127) = 68.7 / 100 ❌ FAIL
> **改動**:v5.10.138 motion token 化 + v5.10.139 PartSection id + 章節間距加大
> **預期**:Motion 子分 +8(62 → 70)、整體 +8 達 76、仍 FAIL 95
> **實測**:Playwright headless chromium、C 報告 d143f949 desktop 1440×900、cb=v5_10_139_motion
> **時間**:2026-05-10、deploy 已切 v5.10.139(footer 證實)

---

## ① DS3 R2 motion 重新打分

| 維度 | R1 (v5.10.127) | R2 (v5.10.139) | Δ | 依據 |
|:---|:---:|:---:|:---:|:---|
| **顏色一致性**(token 集中) | 78 | **78** | — | 未動、`#c9a84c` hardcode 仍 42 處 |
| **Tonal 階層**(深色 surface tint) | 48 | **48** | — | 未動、無 elevation 0-5 體系 |
| **Motion 一致性**(easing/duration) | 62 | **74** | **+12** | ✅ 5 token 全套(`--motion-fast 150ms` / `medium 200ms` / `slow 300ms` / 2 easing)、page.tsx 內 `.section-card` / `.toc-link` / `.hover-lift` 全 var()、+a11y `prefers-reduced-motion` rule;但 globals.css 仍有 **7 處** hardcode `0.18s/0.2s/0.3s/0.35s ease`(全域樣式未對齊 page.tsx)、扣 4 分 |
| **State Layer**(hover 統一) | 55 | **55** | — | 未動 |
| **Section transition**(章節展開連貫) | 70 | **74** | **+4** | ✅ PartSection mb-12 sm:mb-16 章節間距加大、視覺呼吸感 +;但 expand 動畫仍 `transition: opacity 0.3s ease`(L207、未升 token + 未 height 動畫)、+4 不到 +6 |
| **Scroll 連貫**(stick header / progress + quick-jump) | 80 | **88** | **+8** | ✅ PartSection id=`part-{key}` 4 個全在 DOM(part-qi/cheng/zhuan/he);✅ 30 秒懶人包 `<a href="#part-qi">` × 4 anchor、click → scroll 0→4088px(target offset 4087.83px、Δ <1px)= **PASS**;v5.10.136 dead anchor bug 真根治 |
| **WCAG 顏色語義** | 88 | **88** | — | 未動 |

**新平均 = (78 + 48 + 74 + 55 + 74 + 88 + 88) / 7 = 503 / 7 = 71.86**

實際 **+3.16 分**(原預期 +8、實測 +3.16)、未達預期。

# **Motion 子分:62 → 74(+12)、PASS 「token 化」目標**
# **整體:68.7 → 71.86(+3.16)、❌ FAIL 95、距 -23.14**

---

## ② Motion token 化驗證(getComputedStyle 證據)

```js
getComputedStyle(:root).getPropertyValue() 實測:
  --motion-fast: "150ms"           ✅
  --motion-medium: "200ms"         ✅
  --motion-slow: "300ms"           ✅
  --easing-standard: "cubic-bezier(0.2, 0, 0, 1)"      ✅ (M3 emphasized 100% 對齊)
  --easing-emphasized: "cubic-bezier(0.05, 0.7, 0.1, 1)"  ✅ (M3 emphasized container)
```

**transition 實測**(getComputedStyle.transition、token resolved):
- `.section-card` × **19** 元素:`transform 0.2s, box-shadow 0.2s, border-color 0.2s` ✅ 全套 200ms
- `.toc-link` × **34** 元素:`0.15s cubic-bezier(0.2, 0, 0, 1)` ✅ 全套 150ms + emphasized
- `.hover-lift` × **2** 元素(breaking-news box L3100 + section-card L3868、初次 viewport 外):page.tsx L1659 已套 var()

**`prefers-reduced-motion` rule**:✅ DOM 找到、`{ --motion-* : 0ms }` a11y 0 ms fallback 生效

**截圖**:`motion_v5_10_139_screenshots/top_1778402844941.png`(top viewport 1440×900、看到 v5.10.139 footer + section-card + toc-link 真實渲染)

**Stale transition 殘餘**(扣 motion 子分 4 分根因):
- `app/globals.css` L159 / L182 / L309 / L469 / L526 / L626 / L693 — 共 **7 處** `0.18-0.35s ease`、未 token 化
- 全域樣式套到 navbar / footer / pricing / checkout 等頁面、報告頁 OK 但全站不一致

---

## ③ 30 秒懶人包 quick-jump 跳轉測試 — **PASS**

| 項目 | 實測值 |
|:---|:---|
| `<a href="#part-*">` anchor 數 | **4** ✅(part-qi / cheng / zhuan / he 全在) |
| 第一個 link click 前 scrollY | 0 |
| click 後 scrollY | 4088 |
| target `#part-qi` offsetTop | 4087.83 |
| scroll Δ vs target offset | **< 1px**(完美對齊) |
| `scrolledToTarget`(< 200px tolerance) | **true** ✅ |
| linkText | "起篇 · 3 章生命藍圖 — 認識本我" |

**v5.10.136 dead anchor 真根治確認**:
- v5.10.135 之前:`<a href="#part-qi">` click → 404 anchor、scroll 不動(因 PartSection 缺 id)
- v5.10.139 後:`<section id="part-qi">` 4 個全 render、smooth scroll 1500ms 內完美命中

**PartSection DOM 證據**(`section[id^="part-"]`):
```
part-qi    @ 4088px  - 生命藍圖 — 認識本我
part-cheng @ 12157px - 人生軌跡 — 發展與現況
part-zhuan @ 29520px - 時運流轉 — 未來展望
part-he    @ 29737px - 行動指引 — 總結與實踐
```

> 注:zhuan + he 預設折疊(zhuan offsetTop 29520 vs he 29737、僅差 217px = 折疊頭高)、PartSection useEffect L41-65 hashchange 監聽自動展開、scroll 後再 scrollIntoView。

---

## ④ Top 3 剩餘 P0/P1 + 達 95+ 路徑

### 🔴 P0 #1 — globals.css 7 處 stale transition 全域 token 化(LOC 7、+4 motion 分)
**現**:globals.css L159/L182/L309/L469/L526/L626/L693 仍 `transition: all 0.3s ease` 散寫
**修**:
```css
/* globals.css 加 :root */
:root {
  --motion-fast: 150ms; --motion-medium: 200ms; --motion-slow: 300ms;
  --easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --easing-emphasized: cubic-bezier(0.05, 0.7, 0.1, 1);
}
@media (prefers-reduced-motion: reduce) {
  :root { --motion-fast: 0ms; --motion-medium: 0ms; --motion-slow: 0ms; }
}
```
然後 7 處全替 `var(--motion-*) var(--easing-standard)`;預期 motion 子分 74 → 78、整體 +0.6 分

### 🔴 P0 #2 — 章節 expand container transform M3 emphasized(LOC 30、+5 section transition 分)
**現**:PartSection L200-209 折疊 `transition: opacity 0.3s ease`、`height: 0/auto` 突跳(無 height 動畫、user 看到內容瞬間消失)
**修**:套 M3 container transform 模式
```jsx
style={{
  display: 'grid',
  gridTemplateRows: expanded ? '1fr' : '0fr',
  transition: 'grid-template-rows var(--motion-medium) var(--easing-emphasized), opacity var(--motion-fast) var(--easing-standard)',
  opacity: expanded ? 1 : 0,
  overflow: 'hidden',
}}
```
M3 標準 emphasized 300ms;預期 section transition 74 → 80、整體 +0.85 分

### 🟡 P1 #3 — Tonal surface elevation 體系(LOC 40、+12 Tonal 階層分、達整體 95+ 主路徑)
**現**:全 `box-shadow` 抬升、無 surface tint(M3 spec 深色模式必 tint primary 5-14%)、Tonal 維度卡 48 分
**修**:globals.css 加 5 級 utility:
```css
.elevation-1 { background: color-mix(in srgb, var(--color-gold) 5%, var(--color-dark)); box-shadow: 0 1px 2px rgba(0,0,0,0.3); }
.elevation-2 { background: color-mix(in srgb, var(--color-gold) 8%, var(--color-dark)); box-shadow: 0 3px 6px rgba(0,0,0,0.35); }
/* ... elevation-3/4/5 */
```
卡片 className `section-card` → `section-card elevation-2`;預期 Tonal 48 → 60、整體 +1.71 分

---

## 達 95+ 路徑(誠實估算)

| 階段 | 動作 | 預期分 | 累計 |
|:---|:---|:---:|:---:|
| R2 現狀 | v5.10.139 | — | **71.86** |
| +P0 #1 | globals.css 7 處 token 化 | +0.6 | 72.46 |
| +P0 #2 | PartSection expand container transform | +0.85 | 73.31 |
| +P1 #3 | Surface elevation 5 級體系 | +1.71 | 75.02 |
| +後續 | State Layer 統一 + 顏色 token 強制(`#c9a84c` × 42 全替) + 章節 stagger fade-in | +5~8 | 80-83 |
| +深度 | M3 全套 30 token 對齊(Tonal Palette 6×13)+ Shared Axis 切換 | +10~12 | **90-95** |

**結論**:**單做 motion + scroll = 71-72**(本次 R2 達標)、**達 95+ 需 5+ 個階段全做**(含 Tonal Palette / State Layer / Color Token 全替、3-5 個 sprint)、不是單版本可達。本版 motion 子目標 **+12 分超預期 +8、PASS**。

---

## 證據檔

- `_ab_test/strict_eval_v5_10_78/eval_motion_v5_10_139.js` — Playwright 腳本
- `_ab_test/strict_eval_v5_10_78/motion_v5_10_139_result.json` — 完整 JSON
- `_ab_test/strict_eval_v5_10_78/motion_v5_10_139_screenshots/top_*.png` — top viewport 截圖
- 對照基線:`_ab_test/strict_eval_v5_10_78/DS3_Material3_motion.md`(R1 = 68.7)
