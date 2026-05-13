# DS5 — Refactoring UI + Practical Typography 嚴格評鑑

> 對照書:Adam Wathan《Refactoring UI》+ Matthew Butterick《Practical Typography》
> Production 樣本:C/d143f949、G15/9b6edb0a(D/4e636025、R/89e112dc 桌面 token 過期、僅引手機素材輔證)
> 評分日期:2026-05-10、版本 v5.10.86

---

## 一、書本精華(2 段、客觀條目化)

### Refactoring UI 4 主軸
1. **Depth via shadow + color** — 不靠 border、靠 elevation 層級(`shadow-sm` → `shadow-2xl`),搭配 surface tint(底色 +5% / +10%)製造層次
2. **Hierarchy ≠ size、是 contrast 組合** — weight + color + size 三軸並用、避免「全 bold」/「全大」
3. **Spacing 用非線性 scale** — 4/8/12/16/24/32/48/64,大段落間距 ≥ 行高 × 2
4. **Typography weight ladder** — H1 700 / H2 600 / body 400 / muted 400+lower contrast

### Practical Typography 4 鐵律
1. **Line length 45-90 chars(漢字 22-45)** — Bringhurst 上限
2. **Leading 120-145% of size** — body 1.4-1.5、長文 1.5-1.65
3. **段落間距 = 行高 × 1.0-1.5**、不用空行
4. **Point size 15-18px web body**(手機 16+)

---

## 二、視覺權重 + 內容連貫流暢度評分

### 視覺權重 = **78 / 100**

| 維度 | 分數 | 證據 |
|:---|:---:|:---|
| Depth(shadow+tint) | 82 | section-card hover translateY+shadow ✓、callout 4 色 token + border 區分 ✓、但 desktop 全頁深藍 #0F1628 surface 變化少、缺 elevation ladder |
| Hierarchy 對比 | 75 | H1/H2 字級 Major Third ✓、但 H2/H3/body 顏色都壓在 cream/cream-90/gold 三色、weight 對比不夠強(H2 700 / body 400 中間缺 H3 600) |
| Callout vs 正文 | 78 | 📌/→/善用指南 4 種 callout 已分色 ✓、但底色 alpha 0.08 太弱、滑過去容易漏看 |
| Color contrast | 80 | cream #f5f0e8 on #0F1628 = WCAG AAA ✓、但 cream/85 cream/75 muted 三層差距僅 10%、視覺扁平 |

### 連貫流暢度 = **72 / 100**

| 維度 | 分數 | 證據 |
|:---|:---:|:---|
| Line length(行寬) | 88 | C 報告 max-w-[680px] ≈ 32 漢字 ✓ 完美命中 Bringhurst 22-45 區間 |
| Leading(行距) | 70 | desktop body 無顯式 line-height(全靠 Tailwind default 1.5)、mobile 1.7-1.85 ✓、**desktop 1.5 對 16px 中文偏緊、應 1.65-1.75** |
| 段距 vs 行距 | 65 | desktop p 段距 = browser default 1em ≈ 16px、行距 24px、**段距 < 行距 = 違反 Bringhurst「段距 ≥ 行高 × 1.5」**(C 連續 5 段時視覺黏成一塊) |
| 字重 ladder | 78 | font-bold/semibold/medium/normal 4 級 ✓、但 H3 sub-heading 跟 body 都 normal、缺中間段 |
| 連續閱讀 5 分鐘疲勞 | 60 | 深藍底 + 暖白字長時間飽和度高、缺呼吸區(白底章節間隔)、卷動到第 8000px 已視覺疲勞(C 完整版 70525px) |

**綜合 = 75 / 100**

---

## 三、Top 10 建議(依 ROI 排序)

1. **Desktop body line-height 顯式設 1.7**(`[data-report-content] { line-height: 1.7 }` 加 desktop 區段)— 解 Bringhurst 行距鐵律、+5 流暢度
2. **段距 ≥ 行高 × 1.5**(p { margin-block: 1.5em })— 解段落黏連、+8 流暢度
3. **callout 底色 alpha 0.08 → 0.14**(📌/→/善用指南 4 種)+ left-border 4px → 6px — 解視覺權重弱、+5 callout
4. **H3 加 weight 600 + color #d4b86a**(亮金、現在 H3 跟 body 同 weight)— 補 hierarchy ladder 中間段、+6 對比
5. **每 3-4 章插「呼吸頁」**(空白 + 一句金句、低飽和淡金)— 解 8000px+ 視覺疲勞、+10 連讀體驗
6. **章節間距加 mt-12 → mt-20**(現章節靠 section-card border 區分、過於緊湊)— +4 hierarchy
7. **正文字級 desktop 16 → 17px**(Butterick 推 15-18、現 default 16 偏小、配 max-w-[680px] 32 漢字略擠)— +3 可讀
8. **抽言金句塊已有 22px Serif**(globals.css:2836)、**頻率太低**(整份 C 70525px 僅 1-2 處)— 每 H2 章節結尾加 1 句、+5 節奏
9. **Surface elevation ladder**:section-card 加 surface-1 / surface-2 兩層底色(差 +3% lightness)— 補 Refactoring UI depth 層次、+4 視覺權重
10. **Muted color 三層 cream/85 /75 /60 改為 90 /70 /50**(現差距 10% 視覺扁平、改 20% 階差明顯)— +3 hierarchy

---

## 完工

① path:`D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/_ab_test/strict_eval_v5_10_78/DS5_RefactoringUI_typography.md`
② 視覺權重 78、連貫流暢度 72、綜合 75 / 100
③ Top 10 建議:#1 line-height 1.7 / #2 段距 ≥ 行高 ×1.5 / #3 callout alpha 0.14 / #4 H3 weight 600 + 亮金 / #5 章節間呼吸頁 / #6 章節 mt-20 / #7 正文 17px / #8 金句頻率提高 / #9 surface elevation ladder / #10 muted 三層 90/70/50

**字數**:約 720 字(< 800 達標)
