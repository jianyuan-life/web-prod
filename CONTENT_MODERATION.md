# Content Moderation（AI 報告內容守護）

> 最後更新：2026-04-17
> 作者：鑑源 AI 內容安全工程
> 狀態：已實作完成，等待 Jamie 手動執行 SQL migration 後啟用

## 為什麼要做

AI 生成的命理報告可能產出：

- 敏感政治議題（政府、爭議人物、主權）
- 歧視/仇恨言論（性別/種族/地域/宗教/性傾向）
- 醫療過度承諾（「保證治癒」「能治癌」「不用看醫生」）
- 投資誘導（「穩賺不賠」「保證獲利」「必漲」）
- 極端命理（「你會死於」「注定離婚」「必得絕症」）
- 不當性內容
- 暴力/犯罪教唆
- 隱私洩漏（不小心提到其他客戶名字）

一旦流到客戶手上，輕則客訴退款，重則法律訴訟 + 品牌崩盤。

## 技術架構

### 雙層過濾

```
AI 生成報告
    ↓
Layer 1：關鍵詞黑名單掃描（lib/content-moderation/blacklist.ts）
    ↓
Layer 2：AI Moderation API（lib/content-moderation/ai-moderator.ts）
    ├─ Provider A：OpenAI omni-moderation-latest（優先）
    └─ Provider B：Claude Haiku（fallback）
    ↓
判定 action：pass / warn / retry_with_guard / hard_block
    ↓
寫入 moderation_log（Supabase）
    ↓
若 blocked → 顯示在 /jamie/content-review，admin 可：
    ├─ 強制放行（force_pass）
    ├─ 重新生成（regenerate）
    └─ 忽略（dismiss）
```

### 黑名單分類

| 類別 | 範例 | block 數 | warn 數 |
|:---|:---|:---:|:---:|
| politics（政治） | 政治人物姓名、主權議題、政黨 | 20+ | 10+ |
| medical（醫療） | 保證治癒/勸阻就醫/能治癌 | 15+ | 3 |
| investment（投資） | 穩賺不賠/必漲/All-in/借錢炒股 | 15+ | 3 |
| extreme_fortune（極端命理） | 死亡時間/注定離婚/必得絕症 | 20+ | 5 |
| discrimination（歧視） | 性別/地域/種族/宗教/性傾向 | 25+ | 5 |
| sexual（性） | 露骨性描寫/性交易/未成年 | 8+ | 2 |
| violence（暴力） | 殺害/教唆犯罪/爆裂物 | 6+ | 1 |
| privacy（隱私） | 其他客戶姓名出現 | runtime 檢查 | — |

### 判定門檻

- **AI 任一類別 score ≥ 0.8** → `blocked`（退回 retry_with_guard）
- **AI 任一類別 score ≥ 0.6 < 0.8** → `warning`（只記錄）
- **黑名單命中 severity=block** → `blocked`
- **黑名單命中 severity=warn** → `warning`

## 檔案清單

### 核心模組（lib/content-moderation/）

| 檔案 | 行數 | 用途 |
|:---|:---:|:---|
| `blacklist.ts` | 400+ | 黑名單定義 + scanBlacklist() + 白名單誤殺防呆 |
| `ai-moderator.ts` | 180 | 呼叫 OpenAI Moderation / Claude Haiku |
| `index.ts` | 240 | 主入口 moderateContent() + logModerationEvent() |

### 整合點

| 檔案 | 改動 |
|:---|:---|
| `workflows/generate-report/steps.ts` | 新增 `contentModerationStep()` Step function |
| `workflows/generate-report/index.ts` | C/D/E1/E2 主流程 + G15 分支 + R 分支皆接入審查 |

### 後台頁面

| 路徑 | 用途 |
|:---|:---|
| `app/api/admin/content-review/route.ts` | GET 列 flagged / POST 處置 |
| `app/jamie/content-review/page.tsx` | Admin 審查 UI |
| `app/jamie/layout.tsx` | 已加入左側導航「內容安全審查」 |

### Migration（需手動執行）

```sql
-- 檔案：supabase/migrations/create_moderation_log.sql
-- 執行方式：在 Supabase SQL Editor 貼上並 Run
```

表 `moderation_log` 包含：
- report_id / plan_code / action / blocked / reason
- hits（jsonb，黑名單命中陣列）
- ai_scores（jsonb，各類別分數）
- content_preview（前 500 字）
- retry_attempt / status / admin_note / reviewed_by / reviewed_at

### 測試檔

- `__tests__/08-content-moderation.test.mjs`
  - 12 組測試（超過要求的 10 組）
  - 3 組誤殺防呆（命理報告正常用語不會誤判）
  - 9 組違規命中（政治/醫療/投資/極端命理/歧視/暴力/多重）
  - **結果：12 passed / 0 failed**

## 使用方式

### 在 workflow 裡呼叫（已整合）

```typescript
// workflows/generate-report/index.ts
import { contentModerationStep } from './steps'

const modResult = await contentModerationStep(reportId, reportContent, planCode, {
  customerName: birthData.name,
})
if (modResult.blocked) {
  // 已自動寫入 moderation_log，admin 會在後台看到
}
```

### 直接呼叫 moderateContent()

```typescript
import { moderateContent } from '@/lib/content-moderation'

const report = await moderateContent(aiContent, {
  skipAi: false,           // 要不要呼叫 OpenAI/Claude
  customerName: '張三',
  otherClientNames: ['李四', '王五'],  // 若出現這些名字就算洩漏
})

console.log(report.action)      // pass / warn / retry_with_guard
console.log(report.warnings)
console.log(report.guardInstruction)  // 若 blocked，附到下次 prompt 最後
```

### Admin 處置

`/jamie/content-review` 頁面：

| 按鈕 | 效果 |
|:---|:---|
| **強制放行** | moderation_log.status=force_passed，報告照常交付 |
| **重新生成** | paid_reports.status=pending，觸發 workflow 重跑 |
| **忽略** | 標記 dismissed，不影響交付 |

所有處置都會寫入 `admin_audit_log`，IP/User-Agent 留痕。

## 環境變數

目前預設關閉 AI Moderation（避免未設 key 時報錯）。要啟用，在 Vercel 加：

| 變數名 | 說明 | 優先順序 |
|:---|:---|:---:|
| `OPENAI_API_KEY` | OpenAI Moderation API | 1（優先） |
| `CLAUDE_API_KEY` | Claude Haiku fallback | 2 |
| `ANTHROPIC_API_KEY` | 同上別名 | 2 |

**若兩者都未設**：Layer 2 會 skip，只跑 Layer 1（黑名單），不阻塞業務。

## 部署檢核表

- [ ] Jamie 在 Supabase SQL Editor 執行 `create_moderation_log.sql`
- [ ] 確認 Vercel 已設定 `OPENAI_API_KEY`（或 `CLAUDE_API_KEY`）
- [ ] 到 `/jamie/content-review` 確認頁面正常載入
- [ ] 產一份測試報告，觀察 `/jamie/content-review` 是否有紀錄
- [ ] 觀察一週再決定是否把 workflow 裡的「TODO（未來若要強擋）」放開

## 目前策略：soft-block（不阻塞交付，只記錄）

目前設計是 **發現違規時不直接擋報告**，而是寫入 `moderation_log`+`flagged` 狀態，讓 admin 在 `/jamie/content-review` 審查。

原因：
1. 避免誤殺率未知時就硬擋，造成客戶付費後收不到報告
2. 先累積 1-2 週真實數據，看 false positive 率
3. 若 FP 率 < 5%，再把下方 `markReportFailed` 放開改為硬擋

硬擋開關位置：
```typescript
// workflows/generate-report/index.ts 約 line 470
if (modResult.blocked) {
  console.warn(`⚠️ 內容審查發現 ${modResult.blacklistCount} 項違規...`)
  // TODO（未來若要強擋）:
  //   await markReportFailed(reportId, `內容安全審查失敗: ${modResult.reason}`)
  //   return { success: false, error: '內容審查阻擋' }
}
```

## 誤殺白名單（FALSE_POSITIVE_WHITELIST）

以下命理合法用語會在掃描前被抹除，避免誤殺：

```typescript
/離婚.{0,5}(機率|風險|傾向|議題|課題)/g
/(健康|身心).{0,5}(注意|風險|議題|課題)/g
/(投資|理財).{0,5}(建議.{0,5}保守|謹慎評估|風險管理)/g
/癌症.{0,5}(家族史|體質|防範)/g
/業力.{0,5}(課題|功課|成長)/g
```

若實務上發現新的誤殺情境，直接在 `lib/content-moderation/blacklist.ts` 的 `FALSE_POSITIVE_WHITELIST` 補入。

## 後續擴充建議

| 優先級 | 項目 |
|:---:|:---|
| 高 | 累積 2 週真實數據後，把 soft-block 改為 hard-block（對嚴重違規） |
| 高 | `retry_with_guard` 實際接入：把 `guardInstruction` 塞到 AI prompt 最後重跑一次 |
| 中 | 客戶看之前的「第三道渲染層檢查」（極少觸發） |
| 中 | 新增中文簡體詞庫（支那、426 等地域仇恨語） |
| 中 | Slack / Email 自動通知：只要有新的 flagged 就推播 |
| 低 | 把黑名單條目搬到 Supabase table，admin 可 UI 直接增刪 |
| 低 | 接入台灣金管會廣告規範 / 百度敏感詞庫全量 |

## 驗收摘要

| 項目 | 結果 |
|:---|:---|
| `lib/content-moderation/blacklist.ts` | 450 行，8 類分類，500+ patterns |
| `lib/content-moderation/ai-moderator.ts` | 180 行，OpenAI 主 + Claude Haiku fallback |
| `lib/content-moderation/index.ts` | 240 行，moderateContent() 主入口 + log |
| `supabase/migrations/create_moderation_log.sql` | 含 RLS、索引、CHECK 約束、updated_at trigger |
| `app/api/admin/content-review/route.ts` | GET/POST + auth + audit log |
| `app/jamie/content-review/page.tsx` | 完整 UI + 狀態篩選 + 處置按鈕 |
| `workflows/generate-report/steps.ts` | 新增 `contentModerationStep()` Step function |
| `workflows/generate-report/index.ts` | C/D/E1/E2、G15、R 三個分支都接入 |
| `app/jamie/layout.tsx` | 左側導航新增「內容安全審查」 |
| `__tests__/08-content-moderation.test.mjs` | **12 passed / 0 failed** |
| TypeScript 檢查 | ✅ 本次新增檔案零錯誤（唯一錯誤是 dashboard 預先存在問題） |

## Commit 規則

依需求：**只 commit 到 local，不 push**。
