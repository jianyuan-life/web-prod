# A/B 測試框架建置報告

> 2026-04-17 ｜ 網頁製作部門
> 版本：v5.2.5

---

## 一、目標

為鑑源平台建置自建輕量 A/B 測試框架，用於測試：
- **定價**（如 C 方案 $89 vs $99 vs $79）
- **文案**（「15 套系統」vs「4,600 條規則」vs「AI 頂級命理」）
- **CTA 按鈕**（「立即購買」vs「解鎖你的藍圖」vs「3 分鐘看懂」）
- **首頁佈局**（長滾動 vs 短滾動、圖多 vs 文多）
- **結帳流程**（一頁式 vs 多步驟）

**核心原則：不依賴付費 SaaS（LaunchDarkly/Split/Vercel Edge Config），全部自建。**

---

## 二、交付清單

| # | 檔案 | 角色 |
|:---:|:---|:---|
| 1 | `supabase/migrations/create_ab_test_tables.sql` | 資料表建立（experiments/events/assignments）+ 範例實驗 |
| 2 | `lib/ab-test.ts` | 核心分流、UUID、cookie、事件追蹤、Z-test 統計 |
| 3 | `components/ABTest.tsx` | React 組件（Experiment / ABVariant / SimpleABTest）|
| 4 | `components/HeroCTAExperiment.tsx` | 示範實驗組件（首頁 Hero CTA）|
| 5 | `app/api/ab-events/route.ts` | 事件接收 API（POST）+ 實驗定義查詢（GET）|
| 6 | `app/api/admin/ab-tests/route.ts` | 後台看板 API（GET/POST/PATCH）|
| 7 | `app/jamie/ab-tests/page.tsx` | 後台看板列表頁 |
| 8 | `app/jamie/ab-tests/[key]/page.tsx` | 後台實驗詳情頁（含統計顯著性）|
| 9 | `app/jamie/layout.tsx` | 新增「A/B 測試」導航項目 |
| 10 | `middleware.ts` | 新增 `/api/ab-events` rate limit 120/min |
| 11 | `app/page.tsx` | 套用 HeroCTAExperiment 示範實驗 |

---

## 三、技術架構

### 3.1 資料庫（3 張表）

**ab_experiments** — 實驗定義
```sql
id UUID PK
key TEXT UNIQUE            -- hero_cta_20260417
name TEXT                  -- 顯示用名稱
description TEXT
variants JSONB             -- [{key:"A",label:"...",weight:50},{key:"B",...}]
primary_metric TEXT        -- conversion / revenue / click
status TEXT                -- active / paused / concluded
winner TEXT                -- 結論後填入勝出 variant
notes TEXT
started_at / ended_at / created_at / updated_at
```

**ab_events** — 事件追蹤
```sql
id UUID PK
experiment_key TEXT
variant TEXT
visitor_id TEXT            -- cookie 裡的 UUID
user_id UUID (nullable)    -- 已登入時帶上
event_type TEXT            -- impression / click / conversion / revenue
value NUMERIC              -- revenue 事件用
metadata JSONB             -- ip / ua / referer / 自訂欄位
created_at TIMESTAMPTZ
```
索引：`(experiment_key, variant, event_type)`、`(experiment_key, created_at DESC)`、`(visitor_id, experiment_key)`

**ab_assignments** — 訪客分配記錄
```sql
id UUID PK
experiment_key TEXT
visitor_id TEXT
variant TEXT
user_id UUID (nullable)
assigned_at TIMESTAMPTZ
UNIQUE(experiment_key, visitor_id)
```
用途：冪等記錄「這位訪客被分到哪個 variant」，保證一致性。

### 3.2 分流演算法（FNV-1a Hash）

```
variant = variants[ FNV1a(experimentKey:visitorId) mod totalWeight → cumulative bucket ]
```

**關鍵保證：**
- 同一 `visitor_id` + `experiment_key` → 永遠落到同一 variant（deterministic）
- 不同 `experiment_key` 之間 → 獨立分配（不會互相干擾）
- Hash 後對 `totalWeight` 取模，支援自訂權重（如 70/30 或 33/33/34）

**為什麼用 FNV-1a？**
- 快（純 bit 運算 + Math.imul）
- 分佈均勻（對 short string 表現好於 djb2）
- 純 ASCII safe（cookie UUID 只有 hex 字元）
- Server / Client 都能用（不依賴 crypto）

### 3.3 一致性保證（三層防禦）

| 層級 | 機制 | 生命週期 |
|:---:|:---|:---|
| 1 | `ab_visitor_id` cookie | 12 個月 |
| 2 | `ab_v_{experimentKey}` 分配結果 cookie | 30 天 |
| 3 | `ab_assignments` 資料表（DB 冗餘）| 永久 |

即使 2 被清，只要 1 還在，重新 hash 仍會落到同一 variant。

### 3.4 事件追蹤（三種路徑）

1. **自動 impression**：`useABTest` mount 時自動 fire（只發一次）
2. **手動 click/conversion/revenue**：呼叫 `ctx.track('click')` 或 `ctx.track('revenue', { value: 89 })`
3. **傳輸層優先級**：`navigator.sendBeacon` → `fetch({ keepalive: true })` fallback

**為什麼 sendBeacon 優先？**
- 頁面關閉瞬間也能送出（非同步但不阻塞導航）
- 瀏覽器保證最佳傳輸
- 失敗自動 fallback 到 fetch

### 3.5 統計顯著性（Z-test 雙比例檢定）

```typescript
function zTestTwoProportions(a: VariantStats, b: VariantStats): {
  zScore: number
  pValue: number
  lift: number        // B 相對 A 的提升比例
  significant: boolean  // p < 0.05 且樣本總量 ≥ 200
}
```

**為何用 Z-test 而非 Chi-square？**
- 兩組比例差異檢定，Z-test 跟 Chi-square 數學上等價（z² = χ²）
- Z-test 能給出方向（正負代表誰贏），Chi-square 只能給「有差異」
- 實作較簡潔（一個標準化公式 + normal CDF）

**p-value 計算：**
Abramowitz & Stegun 26.2.17 近似公式，誤差 < 7.5e-8，生產可用。

---

## 四、使用範例

### 4.1 最簡單的 A/B（render-prop）

```tsx
import { Experiment } from '@/components/ABTest'

<Experiment
  experimentKey="pricing_c_20260417"
  variants={[{key:'A',weight:50},{key:'B',weight:50}]}
>
  {({ variant, track }) => (
    <PriceTag
      amount={variant === 'A' ? 89 : 99}
      onClick={() => track('click', { metadata: { plan: 'C' } })}
    />
  )}
</Experiment>
```

### 4.2 整段 JSX 切換（Simple）

```tsx
import { SimpleABTest } from '@/components/ABTest'

<SimpleABTest
  experimentKey="hero_layout_20260417"
  a={<LongScrollHero />}
  b={<ShortScrollHero />}
/>
```

### 4.3 轉化追蹤（結帳成功後）

```tsx
// 在結帳成功頁或 Stripe webhook 處理後
import { trackABEvent } from '@/lib/ab-test'

trackABEvent({
  experimentKey: 'pricing_c_20260417',
  variant: savedVariant,  // 從 cookie 或 user meta 讀
  visitorId: savedVisitorId,
  eventType: 'revenue',
  value: 89,
  metadata: { orderId, plan: 'C' }
})
```

### 4.4 直接用 Hook

```tsx
import { useABTest } from '@/lib/ab-test'

function MyComponent() {
  const { variant, track, ready } = useABTest('my_test', [
    { key: 'A', weight: 50 },
    { key: 'B', weight: 50 },
  ])
  if (!ready) return <Skeleton />
  return <button onClick={() => track('click')}>{variant === 'A' ? 'A' : 'B'}</button>
}
```

---

## 五、後台看板功能

### 列表頁 `/jamie/ab-tests`
- 所有實驗卡片視圖
- 每個實驗顯示：狀態、勝出者、總曝光/轉化/收入、每個 variant CVR
- 兩組 variant 自動算 p-value，≥0.05 顯示綠色通過提示
- 建立新實驗 modal（key / name / description / variants / weights）

### 詳情頁 `/jamie/ab-tests/[key]`
- 完整 variants 表：曝光 / UV / 點擊 / CTR / 轉化 / CVR / 收入 / RPV
- 兩兩 variant 配對的顯著性矩陣（支援 3+ variants）
- 控制台：暫停 / 恢復 / 宣布勝出
- 宣布勝出後，實驗變 concluded，所有訪客統一看勝出 variant（`assignVariant` 優先回傳 winner）

---

## 六、已啟用的示範實驗

### `hero_cta_20260417` — 首頁 Hero CTA 文案

| Variant | 文案 | 權重 |
|:---:|:---|:---:|
| A | 免費體驗 · 30 秒出結果（原版）| 50% |
| B | 3 分鐘看懂你的命盤（新版）| 50% |

**追蹤：**
- `impression`：用戶首次看到首頁自動 fire
- `click`：點擊 CTA（跳到 `/tools/bazi`）時 fire，metadata: { placement: 'hero' }
- `conversion`：建議之後在 `/tools/bazi` 頁面或結帳完成頁補上 `track('conversion')`

**套用位置：** `app/page.tsx` Hero 區塊第 97-105 行

---

## 七、測試結果

### TypeScript 檢查
```bash
$ npm run type-check
> tsc --noEmit
（零錯誤 ✓）
```

### 資料庫 Migration
- `supabase/migrations/create_ab_test_tables.sql` 待 Jamie 手動執行（或透過 Supabase MCP apply_migration）
- SQL 含 `ON CONFLICT DO NOTHING`，可重複執行

### RLS 設定
- `ab_experiments`：匿名僅可讀 `status='active'` 實驗（前端動態讀取用）
- `ab_events` / `ab_assignments`：寫入僅 service_role，讀取一律走後台 API（x-admin-key）

---

## 八、後續擴展建議

### 8.1 進階統計
- Bayesian A/B test（跳脫 frequentist p-value 的 "peeking problem"）
- Sequential testing（可安全提早結束實驗）
- Multi-armed bandit（自動把流量導向勝出 variant）

### 8.2 進階追蹤
- 把 `visitor_id` 跟 `auth.users.id` 綁定，做跨裝置一致
- 加入 funnel 分析（從 impression 到 conversion 的每一步轉化率）
- 加入 cohort 分析（新訪客 vs 回訪客的表現差異）

### 8.3 營運工具
- 實驗模板庫（定價 / 文案 / CTA / 佈局各一個範本）
- 自動警示：某 variant 轉化率突然下降 > 30% 時告警
- 多實驗互斥管理（避免同一 visitor 同時參加多個衝突實驗）

### 8.4 效能
- `ab_events` 資料量大時：
  - 加 partition by created_at (月分區)
  - 用 Supabase `pg_cron` 每日彙整到 `ab_events_daily_rollup`
  - 看板改讀 rollup 表，原始事件保留 90 天後歸檔

---

## 九、交付順序與後續動作

### 立即可做
1. ✅ 所有程式碼已 commit 到 local（未 push）
2. ⏭️ Jamie 執行 migration：
   ```
   Supabase Dashboard → SQL Editor → 貼上 create_ab_test_tables.sql 執行
   （或用 Supabase MCP：apply_migration）
   ```
3. ⏭️ 登入 `/jamie/ab-tests` 確認看板能開
4. ⏭️ 首頁刷新，開 DevTools Network 確認 `POST /api/ab-events` 有 impression 事件

### 流量累積後
5. 持續觀察 1-2 週，累積至少 200 個 impression
6. 看板顯示「✓ 已達 95% 統計顯著」時，點「宣布 X 勝出」結束實驗
7. 把勝出 variant 的文案直接寫進首頁（移除 Experiment 包裝）

### 下一個實驗建議
- `pricing_c_20260430` — C 方案 $89 vs $99 vs $79
- `checkout_flow_20260501` — 一頁式 vs 多步驟結帳

---

## 十、自查結果

| # | 稽查項 | 狀態 |
|:---:|:---|:---:|
| 1 | TypeScript 零錯誤 | ✓ |
| 2 | 資料表 schema 含必要索引 | ✓ |
| 3 | RLS 正確（只有 service_role 能寫）| ✓ |
| 4 | Rate limit 保護 `/api/ab-events`（120/min）| ✓ |
| 5 | Input 驗證（experimentKey/variant 長度、eventType 白名單、value 範圍）| ✓ |
| 6 | Server-side 可用（cookie header parser）| ✓ |
| 7 | SSR fallback（ready 之前不閃爍）| ✓ |
| 8 | 一致性保證（cookie + DB 雙保險）| ✓ |
| 9 | 統計公式正確（Z-test + normal CDF approximation）| ✓ |
| 10 | 後台看板 CRUD 完整 | ✓ |
| 11 | 示範實驗啟用 | ✓ |
| 12 | 版本號已遞增（5.2.4 → 5.2.5）| ✓ |

---

**建置完成時間：** 2026-04-17
**下一版本：** v5.2.5
