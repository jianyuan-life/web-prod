# L2 Claude IA SSOT 嚴評 v5.10.127(R2)

> 對象:production v5.10.127(dpl_3ZdHAJ4S1veYNdX3ziCp7sDWvCqq、首頁「十四大」)
> 6 件 historical:d143f949 / 64b15504 / 271dcda0 / 9b6edb0a / 4e636025 / 89e112dc
> Round 1:84.83 → 對照 v5.10.117 跨系統 cascade + v5.10.121 frontend sanitize + v5.10.122 prompt 14 + v5.10.127 callout

## 一、7 規則打分

| # | 規則 | R1 | R2 | Δ |
|:---:|:---|:---:|:---:|:---:|
| 1 | 跨系統禁區(lesson #056) | 45 | **78** | +33 |
| 2 | 14 vs 15 對外清零 | 30 | **75** | +45 |
| 3 | 派別 lock(E1/E2 分離) | 88 | **90** | +2 |
| 4 | SSOT(plan-names / pkg / Offer) | 85 | 85 | 0 |
| 5 | R-1~R-25(R+6 R3 應並列) | 92 | **94** | +2 |
| 6 | callout fallback(7 hint) | 70 | **88** | +18 |
| 7 | 內外不一致(prompt 內仍 15) | 40 | **65** | +25 |

**平均 = 82.14 / 100**

## 二、95+ 判定

# ❌ FAIL — 82.14、距 95 -12.86

源頭已封(跨系統 cascade / 14 vs 15 雙修 / 7 hint 補)、但 historical leak + 漏 cover 子串 + heuristic 架構仍 P0 缺口。

## 三、Top 3 P0

### P0-1 frontend sanitize 漏「十五個系統 / 十五張底片」
- **檔**:`page.tsx:768-779` stripRawMarkdown
- **grep production**:`十五個系統 / 十五張` = **0 cover**
- **L2 真命中**:c_plan_v2.ts L1240/1283/1299「十五個系統都有自己的角度」「十五個系統交叉驗證的硬實力」「十五個系統都在警告的」
- **影響**:6 件 historical 經 stripRawMarkdown 仍 leak「十五個系統」3 處 / 報告
- **修**:加 `.replace(/十五個系統/g,'十四個系統').replace(/十五張/g,'十四張')` + c_plan_v2 三處改「十四」(5 分鐘 root+frontend 雙修)

### P0-2 跨系統幻想 historical 殘留
- **檔**:6 件 production ai_content
- **現況**:9 處違反(C-何宥諄 6 + C-何紀萳 3「八字用神金 → 兌七 121」)、v5.10.117 已封 prompt source 但 historical 未 recalculate
- **frontend 兜底失效**:屬論述邏輯非單字串、無 strip
- **影響**:跨系統禁區 = 鑑源最深紅線(lesson #056 + 老闆 2 拍板)、源頭封但歷史 9 處仍 production 露出
- **修**:① 跑 `admin_recalculate_historical_v5_10_117.sh`(動 ~$2.50)② 或 frontend hard filter「八字.{0,10}用神.{0,5}金.{0,10}西|兌七 121」→「(請參閱八字章節)」

### P0-3 callout fallback 仍 heuristic
- **檔**:`page.tsx:4361` hint regex
- **現況**:v5.10.127 加 7 條 hint 涵蓋 D 8/R 6/C 7、但仍 regex match
- **架構問題**:寫「化學反應」中、寫「化學變化」miss → default;hint 散在 page.tsx 無 unit test、無命中率追蹤;已 patch 4-5 次累積 anti-pattern(lesson #069)
- **修**:hint 移 `lib/section-hints.ts` + SCHEMA-driven(prompt 加 frontmatter `kind`)+ unit test;2h 投資、長期省 patch 工

## 四、結論

R2 = 82.14、進步明顯但仍 FAIL。**達 95+ 最快路徑**(v5.10.128):
1. **5 分鐘**:stripRawMarkdown 補「十五個系統」replace + c_plan_v2 三處改 14(P0-1)
2. **30 分鐘**:跑 admin recalculate 2 件 C(P0-2、動 ~$2.50)
3. **2 小時**:hint SCHEMA-driven(P0-3、長期)

三項完 → R3 預估 92-95 PASS。
