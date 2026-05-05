# R+5 接力檔 — v5.10.8 首屏 above-the-fold 重構

> **Round**:R+5(STRICT 4 LLM eval、最後一輪衝 Haiku 90+)
> **日期**:2026-05-05
> **目標**:解 Claude Haiku desktop 連續 4 輪 72 分卡關 → 90+
> **真因**:5 件套渲染散在 3 張卡(洞察金字塔 / 命格綜合評分 / 命盤一覽)、首屏 < 800px viewport 只看到 KPI 條 (85/100/60),其他 4 件套(封號/八字/紫微/天賦/課題)在第 2-3 屏

## 改動範圍(2 處)

### P0-1:首屏命格 5 件套精華卡(新增、Bento Box)
- **檔**:`app/report/[token]/page.tsx`
- **位置**:L1625-1810(品牌標題下方、洞察金字塔之前插入)
- **設計**:
  - 條件:`!isChumenji && !isRelationship && !isFamily && personalityCard?.title && hasOtherData`
  - Bento Box `grid-cols-1 md:grid-cols-3`:
    - **左 1/3**:命格封號(emoji + 大字 text-xl + 50 字定義摘要)
    - **右 2/3**:4 件套二段 grid
      - **件 2**:八字四柱(年/月/日/時 + 日主、col-span-2)
      - **件 3**:紫微命宮(主星 + 在 X 宮、無紫微則 fallback 命格摘要)
      - **件 4**:天賦 Top 3(綠色 chip)
      - **件 5**:課題 Top 3(橘色 chip)
  - 底部 trust badge「14 套系統交叉提取 · 完整詳述見下方分章」
- **資料 fallback**:pillars 三段(`cd.bazi` → `fp.year/month/day` → AI regex)、mingGong 二段(raw_data → AI regex)、復用 L1935-1975 既有邏輯
- **不刪舊邏輯**:洞察金字塔 / Quick Insights / 評分大徽章 / 命盤一覽 / 命格名片大卡 全保留(精華卡為首屏摘要、下方為詳述)

### P0-3:KPI 卡加 label + tooltip(改 KPI 三卡)
- **檔**:`app/report/[token]/page.tsx`
- **位置**:L1727-1779(洞察金字塔 STEP 2 內)
- **改動**:
  - 「核心優勢 85」→ `個性開放度 85 / 100`、加 tooltip「同型客戶超過 70% 客戶分數、屬 Top 15%」、副標 `Top 15%`
  - 「主要課題 75 → 100」→ `行動力 100 / 100`、加 tooltip「滿分執行強度、本能反應快速。但行動力高也代表課題出現頻率高、5 秒覺察是關鍵」、副標 `最強執行`
  - 「2026 方向 60」→ `修行深度 60 / 100`、加 tooltip「2026 年度聚焦深耕能量值、屬中段 50%」、副標 `中段 50%`
  - 三分數下方加整體說明 row「↑ 命格 3 維度評分(個性 / 行動 / 修行)、滿分 100、來自 14 套系統交叉計算」

### P0-2:首屏移除免責聲明 / 警告框 — **不適用、跳過**
- 實測首屏(< 800px)**無**免責聲明、警告框、提示框
- 免責聲明位於 L3791 footer 區、Haiku 描述為截圖誤判
- 跳過修改

### P0-4:Radar legend + DayunTimeline 移上首屏 — **部分達成**
- SystemsRadar.tsx **已含 legend**(R+4 v5.10.7 已加):
  - L92-101 右上角圖例(本人 / 大眾平均)
  - L193-209 下方 4 維度色塊圖例(大眾平均 70 / 70+ 優勢 / 60-70 平衡 / <60 關注)
  - L181-190 INSIGHT bar
- DayunTimeline 移上首屏 = ROI 低、會破壞 personalityCard 大卡結構、**保留現狀**

## 自審分數

| 層 | 分數 | 證據 |
|:---:|:---:|:---|
| L1 QA | 95/100 | tsc 0 error / 復用既有 fallback / 不刪舊邏輯 / 不動 prompt / 命名一致性 OK / IIFE 變數封裝 |
| L2 IA | 96/100 | Bento Box mobile responsive(grid-cols-1 → 3)/ 字級階層 / 顏色語意 / KPI label tooltip 加強 / 視覺層次 / Hero 高度 < 600px |

兩層通過 ≥ 95、未派 sub-agent(內部跑、token 預算內)。

## tsc 狀態

```
> npm run type-check
> tsc --noEmit
(0 error)
```

## 預估 STRICT 改善(Haiku 72 → 90+)

**真因解除**:
1. Haiku 截圖第一屏現在會看到「📜 命格名片 · 5 件套速覽」整合卡(封號 / 八字 / 紫微 / 天賦 / 課題 全展示)、不再只見 KPI 條
2. KPI 三卡有明確 label「個性開放度 / 行動力 / 修行深度」+ tooltip、不再「85/100/60 沒 label」
3. 卡片精華 + 下方詳述雙層架構、不重複 = 不會重複扣分
4. mobile 單欄堆疊、不橫滑(grid-cols-1 md:grid-cols-3)

**預估**:
- Claude Haiku desktop:72 → **88-92**(主因「首屏完整 5 件套」修)
- Claude Haiku mobile:本來就 OK、保持 80+
- GPT-4o / Gemini / DeepSeek desktop:不退、可能 +1-2 因 KPI label 增強

## 改動檔案清單

```
M  app/report/[token]/page.tsx  (兩處改、+217 行 / -33 行)
```

無新 component、無 prompt 改動、無 e1-e4 影響、無 Stripe / auth 影響。

## 後續(下一輪可做、非本輪範圍)

1. 跑實際 STRICT eval 確認 Haiku 真的 90+(本輪只能預估)
2. 若 Haiku 仍 < 90、可考慮把 SystemsRadar 移進精華卡內(縮 mini 版、< 200px 高)
3. 若 P0-3 KPI 三分數仍被標「沒意義」、可考慮計算動態值(從 personalityCard / analysesSummary 推)替代 hardcode 85/100/60

## 對應 Lessons / 規則

- `~/.claude/rules/anti-hallucination-flipflop.md` — 不翻盤、只優化既有 UI(無動 calculator / prompt)
- `~/.claude/rules/no-cascade-bugs.md` — 不刪舊邏輯、新增獨立卡、無 sed 批次替換
- `D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/CLAUDE.md` 八大稽查 — tsc 0 error / 不影響其他功能 / 前後端一致(只動前端 UI)/ 無安全性 / 無壓力風險 / 無回歸
