# 免費工具權威稽核 — 修復紀錄（v5.2.7）

**修復時間**：2026-04-18
**依據報告**：`FREE_TOOLS_AUTHORITY_CHECK.md`（9 P0 + 4 P1）
**稽核基準**：何宣逸 1990-10-12 戌時男 / 林沅霖 1993-05-20 辰時男

---

## 修復總覽

| # | Bug | 層級 | 檔案 | 狀態 |
|:---:|:---|:---:|:---|:---:|
| 1 | 紫微五行局顯示「局」 | P0 | `api_server/calculators/free_tools_api.py` + `app/api/free-ziwei/route.ts` | ✅ |
| 2 | 紫微 11 宮借對宮星 | P0 | 同 #1（根因是五行局失敗） | ✅ |
| 3 | 紫微閏月（林沅霖命宮） | P0 | `api_server/calculators/free_tools_api.py` | ✅ |
| 4 | 紫微 AI 簡體殘留 | P0 | `app/api/free-ziwei/route.ts`（prompt 加 zh-TW）+ `components/AIAnalysisCard.tsx`（fallback 用 traditional） | ✅ |
| 5 | 奇門年/月/日柱/節氣/旬首「-」 | P0 | `api_server/calculators/qimen_dunjia.py` + `api_server/api_server.py` + `app/api/free-qimen/route.ts` | ✅ |
| 6 | 八字旬空錯位（庚戌→午未） | P0 | `app/tools/bazi/page.tsx`（calcKongwang 重寫） | ✅ |
| 7 | 八字流年偏一年（2026 顯示乙巳） | P0 | `api_server/calculators/bazi.py`（改用 6/1 取年柱） | ✅ |
| 8 | 八字納音簡體（钗钏金等） | P0 | `api_server/calculators/bazi.py`（改用 NAYIN_TABLE 繁體表） | ✅ |
| 9 | 手機版水平溢出 | P0 | 四個 `app/tools/*/page.tsx`（加 overflow-x-hidden + responsive padding） | ✅ |
| 10 | 紫微 AI Markdown `**` 殘留 | P1 | `components/AIAnalysisCard.tsx`（stripMd 擴大 + label 也過濾 + fallback 用 traditional） | ✅ |
| 11 | 姓名學 AI Markdown `**` 殘留 | P1 | 同 #10（已透過共用 AIAnalysisCard）+ `app/api/free-name/route.ts`（prompt 禁 markdown） | ✅ |
| 12 | CSP 缺 googletagmanager.com | P1 | `next.config.ts` connect-src 白名單 | ✅ |
| 13 | 奇門九宮手機版過擠 | P1 | `app/tools/qimen/page.tsx`（min-w 480→320 + min-h 180→150） | ✅ |

---

## 關鍵根因分析

### #1-#2 紫微五行局 + 11 空宮（致命連鎖）
前端 API route（`app/api/free-ziwei/route.ts`）原本呼叫 `/api/calculate` 完整 15 系統排盤，再從 `analyses` 陣列找紫微。但 `ZiweiInterpreter.interpret()` 產出的 `ReportAnalysis.to_dict()` **只有 detail/good_points/tables/scores，沒有 raw_data**。所以：
- `wuxing_ju` 永遠讀不到 → 前端渲染「{空}局」
- `palaces` 結構資料讀不到 → 前端只能從 tables 解析一次，解析失敗就變「借對宮」

**修復**：改呼叫 `/api/free-ziwei` 輕量端點（`ziwei_basic_chart`），它直接回傳 `palaces`（含 main_stars 陣列）+ `wuxing_ju_num` + `year_gan`。

### #3 紫微閏月
`ziwei_basic_chart` 原寫 `lunar_month = abs(lunar.getMonth())`，**把整個閏月都當前月處理**。正確做法（三合派）：前半月（初一~十五）算本月，後半月（十六以後）算下月。

林沅霖 1993-05-20 = 癸酉年閏三月廿九（日>15）→ 應當四月。寅起正月→巳(四月)→辰時從巳逆數4格=**丑宮**（天同+巨門）✓

### #5 奇門年月日柱 / 節氣 / 旬首 全是「-」
`hourly_qimen_chart` 的 return **沒有 year_gz / month_gz / day_gz / jieqi / xun_shou**，而前端 route 嘗試讀 `data.year_gz / data.month_gz / data.xunshou / data.jieqi`，全部讀不到 → UI 顯示「-」。

**修復**：
1. `hourly_qimen_chart` return 補上 year_gz/month_gz/day_gz/day_dz/jieqi/xun_shou
2. `/api/free-qimen` 端點透傳這些新欄位
3. 前端 route 對 `data.xun_shou` 優先，fallback `data.xunshou`

### #6 八字旬空（庚戌應寅卯，顯示午未）
原 code：
```ts
const dayOrder = ((dzIdx - tgIdx) % 12 + 12) % 12  // 錯！
const xunIdx = Math.floor(dayOrder / 2)
```
- 庚戌：tgIdx=6, dzIdx=10, dayOrder=(10-6)%12=4, xunIdx=2 → 甲申旬（空午未）❌
- 正確：庚戌屬 60 甲子第 46 位 → 甲辰旬（idx=4）→ 空寅卯

**根因**：60 甲子配對 `n%10=tgIdx, n%12=dzIdx` 不能由 `dzIdx-tgIdx` 反推旬首。正確做法是枚舉 k=0..5，找 `(tgIdx + 10*k) % 12 === dzIdx`，然後 xunIdx = k。

**驗證**：
- 庚戌 (6,10)：k=4 時 (6+40)%12=10 ✓ → xunIdx=4 → 寅卯 ✓
- 辛丑 (7,1)：k=3 時 (7+30)%12=1 ✓ → xunIdx=3 → 辰巳 ✓

### #7 八字流年偏移一年
原 code：
```python
ln_solar = LNSolar(yr, 1, 1, 0, 0, 0)  # 1月1日
ln_gz = ln_lunar.getEightChar().getYear()
```
**2026/1/1 還在立春前（立春 2/4）** → 八字慣例認為此時年柱還是 2025 乙巳。所以 UI「2026年」顯示「乙巳」（實際是 2025 的年柱）。

**修復**：改用 `LNSolar(yr, 6, 1, 12, 0, 0)`（6 月絕對在立春後、夏至前，是該年年柱的穩定區間）。

### #8 納音簡體
lunar-python 套件的 `ba.getYearNaYin()` / `ba.getDayNaYin()` / `ba.getTaiYuanNaYin()` 回傳**簡體**（「钗钏金」「剑锋金」「长流水」「大驿土」）。系統內有現成的 `NAYIN_TABLE`（繁體 60 甲子對照表）但沒用上。

**修復**：改用 `NAYIN_TABLE.get(pillar, fallback_to_lunar_python)`。套用在四柱 + 命宮 + 身宮 + 胎元。

### #10 AIAnalysisCard 問題
- `stripMd` 只清 `**`、`__`、`#`，但 ``` ` ``` 和 `***` 沒清
- `block.bullets.map` 渲染 `b.label` 未經 stripMd，所以如果 AI 輸出 `- **愛好廣泛**：xxx`，label 會是 `**愛好廣泛**`（parseToBlocks 的 regex `[^*\n：:]+` 留下 ** 在外圍但其實 regex 排除 `*`，所以 label 應該沒 ** 但保險起見仍過濾）
- 無 bullets 的 block fallback 用 `text`（未轉繁體），應該用 `fallbackText`（已轉繁體+已 stripMd）

---

## Type-check 結果

```
> fortune-reports@5.2.6 type-check
> tsc --noEmit
（無錯誤）
```

---

## 新版 Q&A 對照（預期值）

### 八字 — 何宣逸 1990-10-12 戌時男

| 項目 | 原顯示 | 修復後預期 | 依據 |
|:---|:---|:---|:---|
| 年柱 | 庚午 | 庚午 | ✓ 未動 |
| 月柱 | 丙戌 | 丙戌 | ✓ 未動 |
| 日柱 | 庚戌 | 庚戌 | ✓ 未動 |
| 時柱 | 丙戌 | 丙戌 | ✓ 未動 |
| **空亡** | **午、未** ❌ | **寅、卯** ✓ | 庚戌屬甲辰旬 |
| **流年 2026** | **乙巳** ❌ | **丙午** ✓ | 2026 年柱 |
| **流年 2027** | **丙午** ❌ | **丁未** ✓ | 2027 年柱 |
| **流年 2028** | **丁未** ❌ | **戊申** ✓ | 2028 年柱 |
| **日柱納音** | **钗钏金** ❌ | **釵釧金** ✓ | NAYIN_TABLE |
| **年柱納音** | 路旁土 | 路旁土 | ✓ NAYIN_TABLE |
| **月柱納音** | 屋上土 | 屋上土 | ✓ NAYIN_TABLE |
| **時柱納音** | 屋上土 | 屋上土 | ✓ NAYIN_TABLE |
| **胎元納音** | **大驿土** ❌ | **大驛土** ✓ | 戊申→大驛土 |

### 紫微 — 何宣逸

| 項目 | 原顯示 | 修復後預期 |
|:---|:---|:---|
| 命宮主星 | 天府 | 天府（未變） |
| **五行局** | **局** ❌ | **火六局 / 土五局等**（視命宮納音） |
| **12 宮主星** | 11 宮「借對宮星」 ❌ | 正確分佈 14 主星 |
| AI 解讀 | 簡體（稳重/财富/难以） | 繁體（穩重/財富/難以） |
| AI Markdown | `**個性開朗**:` | 個性開朗· |

### 紫微 — 林沅霖 1993-05-20 辰時男

| 項目 | 原顯示 | 修復後預期 |
|:---|:---|:---|
| **命宮** | **子宮 貪狼**（忌） ❌ | **丑宮 天同+巨門** ✓ |

### 奇門 — 當前時刻

| 項目 | 原顯示 | 修復後預期 |
|:---|:---|:---|
| **年柱** | **-** ❌ | **丙午**（2026） ✓ |
| **月柱** | **-** ❌ | **壬辰**（清明/穀雨） ✓ |
| **日柱** | **壬** ❌ | **壬X**（完整干支） ✓ |
| **節氣** | **-** ❌ | **清明/穀雨** ✓ |
| **旬首** | **-** ❌ | **甲X**（時柱所屬旬） ✓ |

---

## 需要後端部署才生效

- `api_server/calculators/free_tools_api.py`（#1-#3）
- `api_server/calculators/qimen_dunjia.py`（#5）
- `api_server/calculators/bazi.py`（#7-#8）
- `api_server/api_server.py`（#5）

本機 commit 完成，等待 Fly.io 部署（老闆執行）。

## 前端可立即部署

- `app/api/free-ziwei/route.ts`（#1-#4）
- `app/api/free-qimen/route.ts`（#5）
- `app/api/free-name/route.ts`（#11）
- `app/api/free-bazi/route.ts`（AI prompt）
- `app/tools/bazi/page.tsx`（#6 + #9）
- `app/tools/ziwei/page.tsx`（#9）
- `app/tools/qimen/page.tsx`（#9 + #13）
- `app/tools/name/page.tsx`（#9）
- `components/AIAnalysisCard.tsx`（#4 + #10）
- `next.config.ts`（#12）
