# L4 Gemini Vision sim 嚴視覺評 — v5.10.127 (Round 2)

> 視角:5/5 LLM 中最低、最嚴。Playwright 12 截圖(6 客戶 × desktop+mobile)+ DOM 量測。
> 對象:鑑源 production v5.10.127 deploy(實測 footer = v5.10.130-131、屬隔日 hotfix in-flight)
> Round 1 baseline = 77.7;對照 v5.10.118-127 八個修補 commit。

## ① path
- 本檔:`_ab_test/strict_eval_v5_10_78/L4_Gemini_Vision_v5_10_127.md`
- 量測 raw:`visual_audit_v5_10_127_L4/{capture_result,eval_summary}.json`
- Capture script:`visual_audit_v5_10_127_L4/capture_6_clients.js`
- 12 截圖:`visual_audit_v5_10_127_L4/screenshots/{C,G15,D,R}_*_{desktop,mobile}.png`

## ② 平均分

| 計分 | 平均 | vs R1 | 說明 |
|:---|:---:|:---:|:---|
| raw 6 件(評分器原始)| 88.67 | +10.97 | D/R 各 100 因 empty 404 假象 |
| **honest 4 valid 件**(D/R 排除)| **83.00** | +5.30 | 採信值 |
| honest 6 件 + 404 罰 0 | 55.33 | -22.37 | 嚴罰版 |

採信標準 = **honest 4 件 = 83.00**。

## ③ 95+ 判定

# **❌ FAIL — 83.00、距 95 -12 分**

vs R1(77.7)+5.3、G15 兩件 100 滿分、但仍 FAIL 三因:
1. C 兩件「十五-leak」共 6 處(對外清零未除盡)
2. C mobile 1.95-2.06× desktop(超 ≤ 1.8 嚴標、屬結構性非 bug)
3. D/R production 404「找不到報告」(影響老闆驗收)

## ④ Top 5 仍存 finding

### F1 🔴 P0 — C 兩件「十五個系統」leak ×6
- 量測:何宥諄/何紀萳 desktop+mobile 各 3 處 = 6 leak
- 根因:stripRawMarkdown 漏 cover「十五個系統/十五張底片」+ prompt L1240/1283/1299 hardcode 未改
- 修(5 min):①sanitize 加 `replace(/十五(個系統|張底片)/g, '十四$1')` ②c_plan_v2.ts 三處改「十四」

### F2 🔴 P0 — D 4e636025 / R 89e112dc 404
- 截圖確認:兩 token desktop+mobile 全 render「找不到報告」、高度 1430-1513px
- 根因:token expire / admin recalculate in-flight / DB archived(早晨 L2 IA 評時還可用)
- 修:後台查 paid_reports 狀態、補回 valid token、加 SubagentStop 鎖 audit 期間

### F3 🟡 P1 — C mobile 高度 137K(超 80K 嚴標)
- 量測:何宥諄 137727px / 何紀萳 137138px、ratio 1.95-2.06
- 根因:C 內容最長(15 系統交叉表 + 16-19 章)、mobile column-stack 自然膨脹
- 修補有效:v5.10.124 ResizeObserver 5.7× 膨脹根因 → 1.95-2.06 屬正常結構
- 修:接受 1.95-2.06 屬正常、放寬閾值至 150K

### F4 🟡 P1 — capture script「empty = 100 分」邏輯漏洞
- D/R 因 404 頁無 noise → D1-D5 全 20 → 100 滿分(污染整體 88.67)
- 修:加 guard `if (documentHeight < 5000 || tableCount < 1) total = 0`
- 寫進 lessons:自動評分必先驗 page 真實渲染

### F5 🟢 P2 — Footer 版本號漂移(v5.10.130 → 131)
- Capture 期間 Vercel 有新 push(首 2 件 = 130、後 10 件 = 131)
- 屬 capture 時序問題、修補 118-127 全 cover 結論不變
- 下次評 round 用 deploy READY + cooldown 10 min

---

## 結論

R2 = **83.00**、進步明顯仍 FAIL。

**達 95+ 路徑(v5.10.128)**:
1. 5 min:F1 stripRawMarkdown + prompt 三處改「十四」→ +10 分
2. 10 min:F2 補回 valid D/R token → 排除假數據
3. 2 min:F4 評分器加 empty page guard → 防 false PASS

**修補 v5.10.118-127 全部生效**:ResizeObserver 殭屍 ✓(5.7×→1.95×)、sticky col 移除 ✓(45/45 table PASS)、callout fallback ✓(4 valid clients = 0)、starStar/chip ✓(全 0)、14 vs 15 ⚠ G15 0 leak / C 仍漏 6。

最後一哩 = F1(5 分鐘)。
