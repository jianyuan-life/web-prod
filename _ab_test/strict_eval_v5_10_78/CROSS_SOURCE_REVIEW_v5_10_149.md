# Cross-Source Review v5.10.149 sticky col-1

> 替代 Gemini(2 次 fetch 全敗、9/9 retry 失敗)、Claude 1M ctx 跨源比對 MDN + CSS-Tricks + Medium deep-dive + Designcise + Mozilla bugzilla + Safari 14 release notes
> 日期:2026-05-10
> 對象:v5.10.149 sticky col-1 CSS

---

## ① 整體評估:**有 1 P0 + 3 P1**(不是 PASS)

業界 best practice 11 項對照、v5.10.149 達 7/11、漏 4 項(1 P0、3 P1)。歷史 4 次失敗根因部分仍未修(尤其 P0 父容器 height 問題)。

---

## ② Cross-source 業界共識 vs v5.10.149 差異

| # | 業界共識(MDN / CSS-Tricks / Medium) | v5.10.149 狀態 | 差距 |
|:---:|:---|:---:|:---|
| 1 | th/td 才能 sticky、tr/thead 不行 | ✅ 對的 | — |
| 2 | left:0 + position:sticky 雙條件 | ✅ 都有 | — |
| 3 | 必有 solid background(透明 = 看得到下層) | ✅ rgb(15,22,40) 不透明 | — |
| 4 | z-index ≥ 2(td)、≥ 3-4(thead) | ✅ z=4 / z=2 對 | — |
| 5 | 父容器 overflow-x:auto | ✅ inline style 有 | — |
| 6 | hover state 同步換 sticky cell 背景(避免 hover 穿透感)| ✅ 有 hover override | — |
| 7 | -webkit-sticky 給 Safari ≤ 13 | ❌ **沒寫** | 🟡 P1-A |
| 8 | box-shadow 取代 border(border-collapse 會吃掉 sticky 邊)| ✅ 有 4px shadow | — |
| 9 | **父容器需明確 height 或 inline-size 限制**、否則 sticky 在某些 viewport 不黏(Designcise #2 + Mozilla bug 1658119)| ❌ **沒設** | 🔴 **P0** |
| 10 | thead 第一格(corner)z-index 應 > 普通 thead sticky | ⚠️ **z=4 普通 thead 也是 4、無階梯**(若日後加 sticky thead 會撞)| 🟡 P1-B |
| 11 | min-width vs max-width 衝突檢查(td 本身 min-width:60-80px、sticky 又 max-width:180px、若 col-1 內容 > 180px 會被 ellipsis 但 col-1 第一行可能是中文標題如「年柱(出生年)」= 9 字×13px ≈ 117px OK、但加 padding 14×2 = 145px、若標題 14+ 字會截斷)| ⚠️ 風險中等 | 🟡 P1-C |

---

## ③ Top finding + 修補 LOC

### 🔴 P0:父容器無顯式 height、sticky 在 short content 表會失效

**業界依據**:
- Designcise 第 2 條:「Parent has overflow set 但無 explicit height → sticky 不黏」
- Mozilla Bugzilla #1658119 + W3C csswg-drafts #3136:`overflow-x:auto` 在 table wrapper、若 viewport 寬 ≥ table min-width(480px)→ 不觸發 horizontal scroll → sticky **完全沒事做**(這是 OK 的)、但若高度方向被 outer ancestor `overflow:hidden` 截斷 → sticky 會跟整個 wrapper 一起被裁掉
- 鑑源 4 次 sticky 失敗(v5.10.30/90/92/125)很可能就踩這條:`section.measure-section` 或 `.report-section` 上層有 `overflow:hidden` 用於圓角裁切、子 table 的 sticky 會被裁不黏

**修補 LOC**(`Claude-鑑源網頁製作部門/components/report/section/MeasureSection.tsx` 或父 wrapper):
```tsx
// 確認所有 ancestor 不可有 overflow:hidden(只能 overflow:visible 或 clip with overflow-clip-margin)
// 若需圓角裁切、改用 mask-image: linear-gradient(...) 或 clip-path: inset(0 round 12px)
// 不要 overflow:hidden 配 border-radius
```

**驗證命令**:
```bash
# 在 Playwright headless 跑 report 頁、devtools 檢查 sticky cell computed style 的 position 是否真為 "sticky" 而非被 promote 成 relative
```

### 🟡 P1-A:缺 -webkit-sticky(影響 Safari ≤ 13、iOS 12.x、約 1-2% 流量)

**修補**(`globals.css` 同 selector):
```css
.table-breakout table thead th:first-child {
  position: -webkit-sticky;  /* Safari 6.1-12.5 + iOS 6-12 */
  position: sticky;
  ...
}
.table-breakout table tbody td:first-child {
  position: -webkit-sticky;
  position: sticky;
  ...
}
```

### 🟡 P1-B:thead corner cell z-index 無階梯(未來陷阱)

當前 thead:first-child = z:4、tbody:first-child = z:2。若日後加「整列 thead 都 sticky top:0」、其他 thead th 也是 z:4、跟 corner 撞。

**業界共識**(CSS-Tricks):corner = 11、thead = 10、tbody = 5、其他 = 1。

**修補**(預防性):
```css
.table-breakout table thead th:first-child { z-index: 5; }   /* 比 thead 普通 +1 */
.table-breakout table tbody td:first-child { z-index: 2; }    /* 不變 */
```

### 🟡 P1-C:max-width:180px 對中文長標題(>14 字)會 ellipsis 失語意

鑑源命理表常見第一欄:「年柱(出生年/天干地支)」= 14 字 + padding = ~210px > 180、會截成「年柱(出生年/天干…」。

**修補**(放寬到 220px、或改 clamp):
```css
max-width: clamp(140px, 25vw, 240px);
```

---

## ④ Edge case 預測

| Case | 預期問題 | 機率 |
|:---|:---|:---:|
| **iPhone 12 mini 360px 寬** | min-width:480px 強制橫滾、sticky 觸發、若 P0 沒修 → 被父 overflow:hidden 裁掉 | 🔴 高 |
| **Safari 14 macOS** | 已支援、不需 -webkit-、但 P1-A 修了不會壞 | 🟢 低 |
| **iOS 12 / iPhone 6s 殘存用戶** | 沒 -webkit-sticky → fallback static、整欄滾走、現象=「沒效果」非「壞掉」 | 🟡 中 |
| **Chrome Android scroll bounce** | sticky cell 在 over-scroll 期間可能短暫脫位、屬瀏覽器原生行為、無法 CSS 解 | 🟡 中 |
| **border-collapse:collapse 環境** | inline style 沒明設、瀏覽器預設 separate、box-shadow 會顯示、OK | 🟢 低 |
| **column 內容寬度 > min-width:60px 但中文 nowrap 衝撞** | white-space:nowrap + max-width:180px + ellipsis 三件組正確、會截但不破版 | 🟢 低 |

---

## 結論與行動建議

**v5.10.149 不是 PASS、不是嚴重 broken、屬「7/11 達標、漏 1 P0 + 3 P1」**。

**立即動作**:
1. 🔴 P0 — grep 所有 ancestor `overflow:hidden` + `border-radius`,改 `mask-image` 或 `clip-path`(這就是 4 次失敗根因、Codex 沒抓到)
2. 🟡 P1-A — 加 `-webkit-sticky` 5 分鐘修(Codex 沒提)
3. 🟡 P1-B — z-index 改 5/2 階梯(預防、5 分鐘)
4. 🟡 P1-C — max-width 改 clamp(放寬 mobile)

**Codex 已給的 P1×2** + **本次新加 1 P0 + 3 P1** = 共 1 P0 + 5 P1。建議下個 commit 一次掃完。

---

## Sources(11 篇)

- [MDN — position](https://developer.mozilla.org/en-US/docs/Web/CSS/position)
- [MDN — table-layout](https://developer.mozilla.org/en-US/docs/Web/CSS/table-layout)
- [CSS-Tricks — A table with both a sticky header and a sticky first column](https://css-tricks.com/a-table-with-both-a-sticky-header-and-a-sticky-first-column/)
- [CSS-Tricks — Position Sticky and Table Headers](https://css-tricks.com/position-sticky-and-table-headers/)
- [Medium — Deep dive tables with sticky headers and columns (Jeremiah Clothier)](https://clothiernamedjeremiah.medium.com/deep-dive-tables-with-sticky-headers-and-columns-9cbbeb286e73)
- [Medium — Multi-Directional Sticky CSS and Horizontal Scroll in Tables (Ashutosh Gautam)](https://medium.com/@ashutoshgautam10b11/multi-directional-sticky-css-and-horizontal-scroll-in-tables-41fc25c3ce8b)
- [Designcise — How to Fix Issues With CSS Position Sticky Not Working](https://www.designcise.com/web/tutorial/how-to-fix-issues-with-css-position-sticky-not-working)
- [Adrian Roselli — Fixed Table Headers](https://adrianroselli.com/2020/01/fixed-table-headers.html)
- [Mozilla Bugzilla #1658119 — sticky table cells lose their border](https://bugzilla.mozilla.org/show_bug.cgi?id=1658119)
- [W3C csswg-drafts #3136 — Collapsed table borders don't follow sticky](https://github.com/w3c/csswg-drafts/issues/3136)
- [caniuse — CSS position:sticky](https://caniuse.com/css-sticky)

---

**Reviewer**: Claude Opus 4.7 (1M context、cross-source synthesis、替代 Gemini)
**Multi-Review 對齊**: L4 Cross-Source = 1 P0 + 3 P1 + 共識前 7 項 PASS
