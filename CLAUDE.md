# 鑑源網頁製作

## 專案簡介
鑑源命理平台（jianyuan.life）前端網頁開發專案。
Next.js 14 App Router + Tailwind CSS + Supabase + Stripe + Vercel 部署。

**網站版本：** v5.3.35（2026-04-19）
**線上網址：** https://jianyuan.life
**Vercel 專案：** fortune-reports（對應 backup901012-stack/qimen-chumenji）

## 溝通語言
- 一律使用**繁體中文**溝通、討論、說明

## 自我糾錯機制（強制性，不可跳過）

### 第一層：改動前 — 影響評估（必做）
每次改程式碼前，必須先回答三個問題：
1. **影響範圍**：這個改動影響哪些頁面/功能？列出所有受影響的檔案
2. **最壞情況**：1000 人同時用會發生什麼？會不會破產？
3. **連動檢查**：有沒有其他地方用到同一段邏輯需要同步改？
   - 改 Prompt → 必須同步改品質閘門 regex + 前端渲染
   - 改前端格式 → 必須同步改 PDF 渲染 + Email 模板
   - 改 API → 必須同步改 fallback 路徑
   - 改方案內容 → 必須同步改定價表 + 結帳頁 + FAQ

### 第二層：改動中 — 即時檢查（必做）
- 每個檔案改完立刻跑 `npm run type-check`，不等全部改完
- 改了 A 就搜尋所有引用 A 的地方，確認不會壞 B

### 第三層：推送前 — QA Agent 強制稽查（不可跳過）
**任何改動，不管大小，推送前必須開 QA Agent 做八大項稽查：**

| # | 稽查項 | 怎麼查 | 不過就不推 |
|:---:|:---|:---|:---:|
| 1 | TypeScript 零錯誤 | `npm run type-check` | ✅ |
| 2 | Build 成功 | `npm run build` | ✅ |
| 3 | 改動不影響其他功能 | 搜尋所有引用同一函式/變數的地方 | ✅ |
| 4 | 前後端一致 | Prompt ↔ 品質閘門 ↔ 前端渲染 ↔ PDF ↔ Email | ✅ |
| 5 | 文案不過度承諾 | 定價表/結帳/FAQ 跟實際報告對齊 | ✅ |
| 6 | 安全性 | API 權限、RLS、input validation | ✅ |
| 7 | 1000 人壓力思考 | 併發/超時/rate limit 有沒有受影響 | ✅ |
| 8 | 回歸測試 | 確認修 A 沒壞 B | ✅ |

**八項全過才能 git push。任何一項失敗就停下來修，修完重新跑 QA。**

## 技術棧

| 層級 | 工具 |
|:---|:---|
| 框架 | Next.js 14 (App Router) |
| 樣式 | Tailwind CSS |
| 資料庫 | Supabase (PostgreSQL) |
| 付款 | Stripe |
| 部署 | Vercel |
| AI 報告 | Claude Opus 4.6（主力）+ DeepSeek（備援） |
| 地理編碼 | Nominatim (OpenStreetMap) |
| 國際化 | opencc-js (繁簡轉換) |

## 目錄結構

```
├── app/
│   ├── page.tsx              # 首頁
│   ├── layout.tsx            # 全站 Layout（Navbar、Footer）
│   ├── globals.css           # 全站樣式
│   ├── pricing/page.tsx      # 定價頁
│   ├── checkout/page.tsx     # 結帳頁（含城市搜尋+座標）
│   ├── dashboard/page.tsx    # 客戶儀表板
│   ├── admin/page.tsx        # 後台管理（ADMIN_KEY保護）
│   ├── report/[token]/       # 報告閱讀頁
│   ├── tools/bazi/           # 免費八字工具
│   ├── auth/                 # 登入/註冊/回調
│   ├── privacy/              # 隱私政策
│   ├── terms/                # 服務條款
│   └── api/
│       ├── checkout/         # Stripe 結帳 Session
│       ├── webhook/stripe/   # Stripe Webhook
│       ├── track/            # 訪客地理追蹤（CF-IPCountry）
│       ├── admin/            # 後台 API
│       ├── free-bazi/        # 免費八字 API
│       ├── generate-report/  # 報告生成 API
│       └── reports/          # 報告查詢 API
├── components/
│   ├── Navbar.tsx            # 導航列
│   ├── Tracker.tsx           # 地理追蹤 pixel
│   ├── PricingCards.tsx      # 定價卡片
│   ├── PriceTag.tsx          # 價格標籤（多幣種）
│   ├── LocaleContent.tsx     # 繁簡切換內容
│   └── LocaleSwitcher.tsx    # 繁簡切換按鈕
└── lib/
    ├── brand.ts              # 品牌常數（網站名/信箱）
    ├── i18n.ts               # 國際化（繁簡體）
    ├── currency.ts           # 幣種換算（USD/HKD/TWD/CNY）
    ├── cities.ts             # 城市搜尋+Nominatim 地理編碼
    ├── supabase.ts           # Supabase 客戶端
    └── api.ts                # 內部 API 工具函式
```

## 環境變數（Vercel 上設定）

| 變數名 | 說明 | 狀態 |
|:---|:---|:---:|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案 URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名金鑰（前端用）| ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 服務角色金鑰（伺服器端）| ✅ |
| `STRIPE_SECRET_KEY` | Stripe 密鑰（目前測試模式）| ✅ |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe 公開金鑰 | ✅ |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook 簽名密鑰 | ✅ |
| `DEEPSEEK_API_KEY` | DeepSeek AI API 金鑰（備援）| ✅ |
| `CLAUDE_API_KEY` | Claude Opus 4.6 API 金鑰（主力）| ✅ |
| `NEXT_PUBLIC_API_URL` | Python 排盤 API（Fly.io）| ✅ |
| `NEXT_PUBLIC_SITE_URL` | 網站 URL | ✅ |
| `RESEND_API_KEY` | Resend 郵件 API 金鑰 | ✅ |
| `ADMIN_KEY` | 後台管理密碼 | ✅ |

**重要：所有 env var 必須用 `printf` 設定，不能用 echo（會加換行符）**

## 部署指令

```bash
# 本地開發
cd Claude-鑑源網頁製作
npm install
npm run dev    # http://localhost:3000

# 推送到 GitHub（自動觸發 Vercel 部署）
git add -A
git commit -m "說明"
git push origin main
```

**GitHub Repo：** `jianyuan-life/web`

## 自動化閉環流水線

```
Stripe 付款
  ↓
Webhook → paid_reports 建立記錄（status: pending）
  ↓
觸發 /api/generate-report
  ↓
Python API（Fly.io）排盤 → 15套命理系統
  ↓
Claude Opus 4.6 深度分析 → 生成報告內容
  ↓
Post-generation QA 自動比對排盤數據（防幻覺/截斷）
  ↓
回寫 Supabase（status: completed + report_result）
  ↓
Resend 寄 Email（含報告連結）
  ↓
客戶訪問 /report/[access_token] 查看報告
```

## 重要設計決策

### 地理追蹤
- 使用 `CF-IPCountry` header（Cloudflare 代理後的真實國家）
- 不用 `x-forwarded-for`（會誤標 Cloudflare IP 為美國）

### 後台管理密碼
- Vercel 環境變數 `ADMIN_KEY` 必須用 `printf` 設定，**不能用 echo**（echo 會加換行符導致驗證失敗）

### 報告查詢安全
- 使用 Stripe session_id 驗證報告所有權（v4.5.12+）
- 防止透過猜測 access_token 存取他人報告

---

## 更新紀錄

### v5.3.31（2026-04-19 C prompt 復刻認可版 + 砍 5 LLM QA）

**方向**：老闆發現過去 3 週迭代反而把 C prompt 改壞了（5 LLM QA + 起承轉合 10 章結構 = 砍掉認可版 DNA）。以「客戶認可版本範例」資料夾內的何紀萳 md/何宥諄 md/何宣逸 pdf 為標準復刻。

**認可版真正 DNA（客戶喜歡的格式）**：
1. 命格總覽儀表板（10 系統速覽表 + 5 面向評級 + 🟢🔴🟡 交叉共識）
2. 15 系統逐一分章（Tier 1: 八字25%/紫微20%/奇門15% + Tier 2: 風水8%/姓名5%/西洋5%/吠陀5%/易經4%/人類圖3% + Tier 3: 數字2%/九星2%/塔羅2%/生肖2%/節律1%/南洋1%）
3. 每系統章收四件套（✅好的地方 / ⚠️不好的地方 / 📌需要注意的 / 🔧改善方案）
4. 最終總結集大成（十五系統交叉驗證矩陣 / 天命密碼 / TOP 5 優勢 / TOP 5 風險 / 三階段行動計畫 / 年度運勢曲線 / 本月行動 TOP 3 / 幸運參數速查表 / 給 XX 的一封信）

**三大 DNA（刻進 Prompt）**：
- 客觀事實 — 三系統以上同指才寫成結論，每段引用排盤數據
- 感同身受 — 「你是不是常常...」具體生活情境對號入座
- 一針見血 — 先結論後佐證，壞消息直說但必附出路

**諮詢記錄**：DeepSeek R1 + DeepSeek V3 諮詢結果存 `llm_discussion.log`。共識：
- 四層封裝結構（角色總綱 + 格式聖經 + 風格規則 + 數據變量）
- Call 切分：Call 1 = 總覽 + Tier 1 / Call 2 = Tier 2 / Call 3 = Tier 3 + 最終總結
- 砍 5 LLM QA（降低成本 + 釋放 Claude 創作空間），只保留 qualityGate 硬結構檢查

**已完成**：
- ✅ 重寫 `prompts/c_plan_v2.ts`（10 區塊聖經骨架 + 三大 DNA + 4 層封裝）
- ✅ `workflows/generate-report/index.ts` 砍掉 aiReviewReport 5 LLM QA 調用
- ✅ qualityGate 仍保留（結構、字數、系統數、性別硬檢查）
- ✅ revert 過 v5.3.29（我擅自重寫的起承轉合 10 章結構，老闆說「把三週努力毀了」，已 git checkout 回 v5.3.11）

**已知 bug（v5.3.31 首次測試何宣逸 5528eadc 46K 字發現）**：

| # | Bug | 根因 | 修法 |
|:---:|:---|:---|:---|
| 1 | 最終 content 沒有 `##` 主章節 | Claude 沒遵守 prompt 聖經（只寫 `###` 子節 + 內容）；另 cleanAIResponse line 206 regex `/^.*(?:建議改名).*$(\n(?!#).*$)*/gm` 可能誤吃段落到下個 `#` 前 | 強化 prompt + 修 line 206 只吃到空行 |
| 2 | Call 2 內容大量消失（風水 1 次、姓名 3 次） | 同上 regex 吃段落 | 同上 |
| 3 | 刻意練習 0 次（整章消失） | index.ts line 424 完整性檢查要「刻意練習」字眼；新 prompt 把刻意練習章節砍了改放在「改善行動計畫」裡 | 改檢查邏輯或恢復刻意練習章節 |
| 4 | 寫給 0 次 | index.ts 要「寫給」字眼；新 prompt 寫「給 XX 的一封信」無「寫給」二字 | 改檢查 regex 支援「給」變體 |
| 5 | 性別錯亂（何宣逸男被寫成「何小姐」「女命」「女人」9+ 次） | Claude 看到認可版範本（何紀萳女命）慣性套用；prompt 性別鐵律不夠前置 | Call 2/3 system prompt 最開頭加「【本次報告客戶性別：男/女】」置頂強制 |
| 6 | 5528eadc pdf_url 已補（✅）46,890 字（✅ 跟認可版 46K 同量級） | — | — |

**待辦（下次動手前對齊老闆）**：
- Bug 2：修 cleanAIResponse line 206 改為 `^.*建議改名.*$(\n.*)*?\n\n` 只吃到雙換行為止
- Bug 3：恢復「## 刻意練習」章節到 Call 3 prompt（認可版有這章）
- Bug 4：改 index.ts 完整性檢查 regex 支援「給 XX 的一封信」+「寫給你的話」兩種
- Bug 5：每個 Call system prompt 最開頭加「【客戶性別：X】」template 取代 user prompt 的 ⚠️ 標記
- Bug 1：加強 prompt 「你必須寫 `##` 一、八字命理」的硬強制；或用 post-process 補 heading

**認可版樣本檔案**：
- `D:\Users\Desktop\Claude專案\Claude-鑑源\客戶認可版本範例\`
- 包含：何紀萳 1495 行 md / 何宥諄 1668 行 md / 何宣逸 pdf 927KB / 佘奕曦 pdf / 佘琪琪 pdf / 林倩如 pdf / 傅楚轩 pdf 等

---

### v5.3.13（2026-04-18 六 LLM 各司其職 QA 架構）

**核心改動：從「5 LLM 重複打分」改為「6 LLM 各司其職」**
- Claude Opus 4.7 = 生成者（長文創作+自我驗證冠軍）
- Qwen Max = 🔮 命理術語審查官（中文訓練最深）
- Gemini 2.5 Pro = 📊 排盤資料驗證官（1M context + cross-reference 王）
- GPT-4o = 🧱 結構審查官（邏輯一致性強）
- Kimi v1-32k = 📖 讀者體驗官（中文長文閱讀頂尖）
- DeepSeek V3 = 🚫 禁區守門員（最便宜做最機械的規則掃描）

**判決邏輯：**
- 舊：avg≥88 且 min≥80（平均分天花板問題→無限 retry 燒錢）
- 新：任一家 criticalErrors.length>0 或 severity=red → fail（二元判決）

**修復：**
- ✅ Gemini 2.5 Pro MAX_TOKENS 截斷（加 thinkingBudget=1024 + maxOutputTokens 倍增）
- ✅ Gemini 2.5 Flash 思考關閉（thinkingBudget=0）
- ✅ 每家輸入按需分派（不需排盤的 reviewer 不塞 JSON，省 30-40% token）
- ✅ 每家專屬 system prompt，只看自己強項的面向

**影響檔案：**
- `lib/ai/team/five-llm-qa.ts`（重寫為六 LLM 分工架構）
- `lib/ai/providers/gemini.ts`（thinkingBudget 修復）
- `workflows/generate-report/index.ts`（判決改為六項全過）

---

### v5.2.7（2026-04-18 免費工具權威稽核修復：9 P0 + 4 P1）

**P0 前端/資料綁定修復：**
- ✅ 紫微「五行局顯示「局」」+「11 宮借對宮星」：改用 `/api/free-ziwei` 端點取代 `/api/calculate`（後者經 interpreter 後沒 raw_data）
- ✅ 紫微 AI 解讀要求台灣繁體 + 禁止 Markdown（prompt 強化 + AIAnalysisCard fallback 用 traditional）
- ✅ 八字旬空公式錯位：`calcKongwang` 改用枚舉 k 找 60 甲子位置（庚戌→寅卯 ✓、辛丑→辰巳 ✓）
- ✅ 手機版水平溢出：四個 tools 頁面加 `overflow-x-hidden max-w-full` + 響應式 padding/字體

**P0 後端（Fly.io 待部署）：**
- ✅ 紫微閏月處理：`ziwei_basic_chart` 加入「前半月算本月 / 後半月算下月」邏輯
- ✅ 紫微 hour_idx 修正：`(hour+1)//2` 取代 `hour//2`（加 23/0 時子時處理）
- ✅ 紫微新增欄位：`wuxing_ju_num` / `year_gan` / `year_zhi` / `year_ganzhi`
- ✅ 奇門年/月/日柱 + 節氣 + 旬首補齊：`hourly_qimen_chart` return 補 `year_gz / month_gz / day_gz / day_dz / jieqi / xun_shou`
- ✅ 八字流年偏移一年：改用 6/1 取年柱（避開立春前），`LNSolar(yr, 6, 1, 12, 0, 0)`
- ✅ 八字納音簡體殘留：改用繁體 `NAYIN_TABLE` 取代 `ba.getYearNaYin()`（四柱 + 命宮 + 身宮 + 胎元）

**P1：**
- ✅ AI Markdown `**` 殘留：`stripMd` 擴大清理 + bullets label 也過濾 + fallback 用 traditional（紫微/姓名/八字通用）
- ✅ CSP 白名單加入 `https://www.googletagmanager.com`（修復 GA4 td API 被擋）
- ✅ 奇門九宮手機版過擠：`min-w-[480px]` → `min-w-[320px] sm:min-w-[480px]`，`min-h-[180px]` → responsive

**Type-check：** 零錯誤  **修復紀錄：** `FREE_TOOLS_FIX_LOG_0417.md`

### v5.2.2（2026-04-17 L5 推薦積分致命 bug 修復）

**P0：推薦獎勵從未發放過（L5 Audit Bug #2）**
- ✅ 新增 migration `supabase/migrations/add_referred_email.sql`（待 Jamie 手動執行）
  - 補 `referrals.referred_email` 欄位 + index + 從 auth.users 回填歷史
  - 補 `referrals.referred_ip / referrer_last_ip / suspicious_flag` 反作弊欄位
  - 補 `point_transactions(reference_id, type)` 冪等 index
  - 補 `auth_users_view`（若不存在）
- ✅ `app/api/referral/register/route.ts` insert 時寫入 `referred_email` + `referred_ip`，並加入 fallback（欄位未建時退回舊格式）
- ✅ 撰寫 `check_referral_rewards.py` 歷史補償掃描腳本（`--apply` 實際補發、`--json` 輸出）

**P1：反作弊**
- ✅ 新增 `lib/disposable-email-domains.ts`（~120 個拋棄式信箱域名黑名單）
- ✅ 註冊時拒絕 disposable email 獲得推薦獎勵
- ✅ 新增 `lib/bruteforce-tracker.ts`：連續 5 次推薦碼驗證失敗封鎖 1 小時
- ✅ `middleware.ts` 加強：`/api/referral/validate` 和 `/api/referral/register` 降為 10/min、`/api/points/transfer` 降為 5/min

### v4.8.0（2026-04-12 通宵衝刺版）

**嚴重 Bug 修復（15 項）：**
- ✅ R方案無法付款（確認彈窗缺失→直接提交）
- ✅ 所有方案 customer_note 沒傳到 AI（欄位名 analysis_topic/customer_note vs topic/question 不匹配）
- ✅ R方案缺 timezone_offset/calendar_type/lunar_leap（FamilyMember type 補齊）
- ✅ R方案出生地區無地理編碼（純文字→接入 searchLocations）
- ✅ R方案表單缺曆法選擇（加入國曆/農曆+閏月 UI）
- ✅ FamilyMemberPicker→R方案丟失 calendarType/lunarLeap/cityTz
- ✅ generate-report API 無認證（加入 x-internal-secret 檢查）
- ✅ 4個 caller 呼叫 generate-report 沒帶認證 header
- ✅ 所有方案地理座標從未傳入 Python 排盤 API（latitude/cityLat 欄位名不匹配）
- ✅ R方案成員座標 snake_case vs camelCase 不匹配
- ✅ 排盤 API 未傳 calendar_type/lunar_leap/time_unknown/time_mode
- ✅ R方案品質閘門檢查分數但 Prompt 禁止分數→改檢查合/不合結論
- ✅ cleanFinalReport \Z 非法 JS regex→改為 $
- ✅ G15品質閘門 regex 跟 Prompt 章節不匹配
- ✅ R方案報告頁相容度提取改為文字結論（不再用分數）

**網站真實性修正（10 項）：**
- ✅ LiveCounter 虛假基數 1012→0（只顯示真實數據）
- ✅ 「真實用戶回饋」→「使用情境」+示範標註
- ✅ 「15套系統同時分析」→「最多15套系統交叉分析」
- ✅ 「每條皆有典籍出處」→「規則源自數十部經典古籍」
- ✅ 「100%隱私加密」→「隱私保護」+「資料加密傳輸與儲存」
- ✅ 「最快30分鐘」→「約30-60分鐘」
- ✅ 「鑒源獨家」→「鑒源特色」
- ✅ FAQ 明確區分排盤（確定性）和解讀（AI引擎）
- ✅ SEO meta/i18n/brand.ts/定價頁 FAQ 同步修正
- ✅ Stripe webhook secret 空字串防護

**新功能：**
- ✅ 報告查看追蹤（瀏覽次數+PDF下載次數+去重）
- ✅ R方案 Prompt 加入客戶問題核心規則
- ✅ CI 環境變數修復（build 不再失敗）

**審計結果：**
- 34,458條規則驗證為真實（實際約38,600條）
- 排盤引擎準確度 96%+，已用業界最佳庫
- 全6方案結帳流程端對端驗證通過
- 報告頁6方案渲染驗證通過
- QA 7項全部通過

### v5.2.0（2026-04-12）

**推薦積分系統（完整閉環）：**
- ✅ 推薦積分系統完整閉環（註冊送3+5積分/首購獎勵10積分/回購獎勵5積分/100%折抵/積分贈與）
- ✅ 後台客戶忠誠度系統（/jamie/loyalty）
- ✅ 後台手動發放積分 + 用戶搜尋自動完成

**報告品質與閱讀體驗：**
- ✅ 報告品質修復（Markdown 表格殘留/分數殘留清理）
- ✅ 章節折疊/展開功能
- ✅ 閱讀進度條 + 回到頂部按鈕 + 預估閱讀時間
- ✅ E2 月度出門訣每週改版（每週 1 盤共 4 盤）

**用戶體驗與品牌：**
- ✅ Logo v11
- ✅ 註冊頁專業化改版
- ✅ Email 退訂機制

**後台與安全：**
- ✅ 後台路徑統一遷移至 /jamie
- ✅ 原始碼保護

### v4.8.6（2026-04-12）
- ✅ 推薦碼 API 認證修復：my-code/balance API 從純 cookie 改為 Authorization header 優先 + cookie fallback
- ✅ ReferralCard 前端 fetch 帶 Bearer token，修復「複製連結」沒帶推薦網址的問題
- ✅ 推薦分享文案修正：5 個按鈕（複製/LINE/WhatsApp/Facebook/Instagram）統一改為朋友口吻，移除「十五套」「免費體驗30秒」等不實宣傳語

### v4.5.24（2026-04-11）
- ✅ 移除所有評分系統（命不該有分數）：報告頁/Dashboard/OG圖/Prompt/PDF 全面清除
- ✅ 報告生成架構重構：Promise.all→順序執行、超時600s、移除截斷hack、max_tokens調降
- ✅ 人格名稱統一：新建 lib/profiles.ts 共用模組，付費版強制用計算器封號
- ✅ Dashboard 付款修復：session_id 獨立查詢，不依賴 auth cookie
- ✅ Email 亮點模板：6套方案專屬亮點取代前300字原始預覽
- ✅ 免費工具優化：Navbar FREE徽章、首頁引導區塊、動畫12→4步
- ✅ 出門訣信心指數去掉百分比數字
- ✅ Claude API 529/402 錯誤處理補全
- ✅ R方案相容度改四級文字描述
- ✅ PDF白底封面+移除評分圖表+emoji清理統一+正文色#333333

### v4.5.11-v4.5.18（2026-04-09）

**安全與品質審計：**
- ✅ Stripe 付款後儀表板「還沒有報告」嚴重 bug 修復（session_id 查詢邏輯重寫）
- ✅ 報告查詢改用 Stripe session_id 安全驗證，防止個資外洩
- ✅ 後端 21 支 API 全面安全/品質審計（27 項問題修復）
- ✅ 前端 7 項修復：密碼最低 8 碼、錯誤訊息中文化、報告 404 頁面、進度條防護、比較表手機適配、dashboard redirect、session_id 改 UUID
- ✅ 後台數據全面修正：用戶分類邏輯、營收計算、bot 過濾

**AI 報告品質：**
- ✅ AI 報告截斷修復（max_tokens +77%，8192→20000+）
- ✅ 修復六大幻覺問題：截斷/流年幻覺/星座幻覺/概念混淆/靈數錯誤/DeepSeek tokens
- ✅ Post-generation QA 機制：自動比對排盤數據，防止 AI 編造

**其他：**
- ✅ Footer 版本號同步機制

### v4.5.0-v4.5.10（2026-04-09）

**家族藍圖 G15 改版：**
- ✅ 結帳頁：email 驗證模式 → 導入已完成人生藍圖報告模式
- ✅ 新建 API：/api/checkout/search-reports
- ✅ 自動載入當前用戶報告 + 姓名搜尋其他家人 + 選取 2-8 人
- ✅ G15 prompt 精簡：extractKeyDataForFamily() + 禁止重複個人分析
- ✅ G15 四大核心章節品質閘門

**出門訣 E1/E2 改版：**
- ✅ available_time_slots 注入 AI prompt
- ✅ 報告頁專屬三色卡片版面
- ✅ Top5 JSON 解析修復 + E1/E2 Prompt 精簡
- ✅ E2 月度出門訣 prompt 全面修正（聚焦出門訣）

**R 方案合否？重建：**
- ✅ 雙人結帳表單 + 出生城市欄位

**其他：**
- ✅ OG 分享圖：report/[token] 動態生成（深藍+金色品牌風格）
- ✅ 歷史人物一鍵導入功能
- ✅ Google Analytics 4 整合
- ✅ Claude Opus 4.6 報告生成
- ✅ 儀表板完成動畫（綠色脈動）+ 自動刷新
- ✅ PDF 橫線清理 + 粗體渲染修復
- ✅ Vercel 自動部署恢復
- ✅ BUG 修復（總監審核 16 個 BUG 全修）

### v1.4-v1.6（2026-04-04）

- ✅ 方案精簡 11→6 個 + 全站方案名稱更新
- ✅ PDF 報告系統（ReportLab 白底品牌 PDF）
- ✅ 出門訣吉時（E1 Top3 / E2 每週 1 盤共 4 盤）+ Google Calendar 一鍵新增
- ✅ 進度條四階段指示器
- ✅ 心理陪伴語言框架 v2.0
- ✅ 報告頁 UX 升級（目錄/錨點/分享/列印）
- ✅ Admin 後台修復 + 優惠碼 CRUD

### v1.2-v1.3（2026-04-03）

- ✅ 自動化閉環完成（付款→排盤→AI→Email）
- ✅ 出生城市欄位 + Nominatim geocoding
- ✅ 後台國家中文化 + 地理追蹤修正
- ✅ SEO meta tags

---

## 待辦事項

### 🔴 上線前必做（不做不能收費）
| # | 任務 | 依賴 | 工作量 |
|:---:|:---|:---|:---:|
| 1 | **E1 結帳表單補事件描述+事件類型選擇** | 無 | 小 |
| 2 | **E1 完整端對端測試** | #1 完成後 | 中 |
| 3 | **各方案端對端品質驗證（G15/R）** | R prompt 先完成 | 大 |
| 4 | **R 方案雙人合盤 AI 報告開發** | 命理研究 prompt | 大 |
| 5 | **Stripe 切換 Live 模式** | #1~#4 全過 | 小 |
| 6 | **Resend 域名驗證確認** | 無 | 小 |

### 🟡 應做（影響品質和體驗）
| # | 任務 | 依賴 | 工作量 |
|:---:|:---|:---|:---:|
| 7 | **報告頁代碼外洩持續監控** | 無 | 小 |
| 8 | **免費排盤工具三頁面前端優化** | 無 | 中 |
| 9 | **推薦積分系統端對端測試** | 無 | 中 |
| 10 | **免費工具轉化率排查** | 數據觀察 | 中 |
| 11 | **報告截斷實際驗證** | 無 | 小 |
| 12 | **報告生成失敗自動發致歉信** | 無 | 小 |
| 13 | **console.log 40+ 處清理** | 無 | 中 |

### 🟢 未來優化
| # | 任務 | 工作量 |
|:---:|:---|:---:|
| 14 | PDF 白底重設計 | 大 |
| 15 | PDF 附件加入 Email | 中 |
| 16 | 退款按鈕（Stripe Refund API）| 小 |
| 17 | types.ts 死代碼清理 | 小 |
| 18 | 推薦排行榜 + 積分商城 | 中 |
| 19 | 積分到期機制 | 小 |

### ✅ 已完成（v5.2.1）
- ✅ 報告生成架構重構（v4.5.24）
- ✅ 報告品質修復（Markdown表格/分數殘留/emoji清理）
- ✅ Email 退訂 + 章節折疊 + 閱讀進度條
- ✅ 後台路徑遷移 /jamie
- ✅ 推薦積分系統完整閉環
- ✅ 免費排盤三頁面（八字/紫微/奇門）+ 三個 API
- ✅ 出門訣 E1/E2 改版完成（品質閘門+詞彙清洗）
- ✅ E2 端對端測試通過

---

## 產品方案總覽

| 代碼 | 名稱 | 定價 | 狀態 |
|:---:|:---|:---:|:---:|
| C | 人生藍圖 | $89 | ✅ 已上線 |
| D | 心之所惑 | $39 | ✅ 已上線 |
| G15 | 家族藍圖 | $59 | 🟡 待驗證 |
| R | 合否？ | $59 | 🔴 AI 報告待開發 |
| E1 | 事件出門訣 | $89 | 🟡 E1 表單需補事件描述 |
| E2 | 月度出門訣 | $99 | ✅ 端對端測試通過 |

---

## 分支策略（百年基業標準）

| 分支 | 用途 | 部署目標 |
|:---|:---|:---|
| `main` | Production，只接受從 staging merge | jianyuan.life（正式環境）|
| `staging` | 測試環境，所有改動先推這裡 | Vercel Preview URL（自動生成）|

### 開發流程
```
寫程式碼 → npm run type-check → 修復錯誤 → npm run pre-deploy
→ git push origin staging → Vercel Preview URL 測試
→ 確認沒問題 → merge 到 main → Production 部署
```

### 規則（不可違反）
1. **禁止直接 push 到 main** — 所有改動必須先經過 staging 測試
2. **staging → main 的合併方式**：在 staging 測試通過後，切回 main 執行 `git merge staging`
3. **CI 會跑在 staging 和 main 兩個分支** — push staging 時 GitHub Actions 自動跑 type-check + test + build
4. **Vercel Preview URL** — 每次 push staging 分支，Vercel 自動生成一個 preview URL，用此 URL 做端對端測試
5. **hotfix 例外** — 生產緊急修復可直接 push main，但修完後必須同步回 staging（`git checkout staging && git merge main`）

### 合併指令
```bash
# staging 測試通過後，合併到 production
git checkout main
git merge staging
git push origin main

# hotfix 後同步回 staging
git checkout staging
git merge main
git push origin staging
```

---

## 部署守則（TypeScript Build 守門機制）

### 部署前必須執行
```bash
npm run pre-deploy
```
此指令會依序執行：
1. `npm run type-check` — TypeScript 型別檢查（`tsc --noEmit`）
2. `npm run build` — Next.js 完整建置

**兩步都通過才能推送到 GitHub。**

### 常見 TS 錯誤修復方式
| 錯誤碼 | 說明 | 修復方式 |
|:---|:---|:---|
| TS2345 | 型別不匹配 | 檢查函式參數型別 |
| TS2322 | 賦值型別錯誤 | 檢查變數宣告的型別 |
| TS7006 | 隱式 any | 為參數加上明確型別 |
| TS2304 | 找不到名稱 | 檢查 import 是否遺漏 |
| TS18046 | 可能為 undefined | 加上 null check |

## 注意事項
- 修改後自動 commit + push GitHub（Vercel 會自動部署）
- .env.local 含真實金鑰，不推到 GitHub（已加入 .gitignore）
- 所有金額顯示需支援多幣種（USD/HKD/TWD/CNY）

---

## 可用工具（2026-04-07）

| 工具 | 用途 | 使用場景 |
|:---|:---|:---|
| **Vercel CLI** | 部署鑑源網站、查看日誌、管理環境變數 | `vercel deploy`、`vercel env pull` |
| **VS Code** | 編輯 Next.js/React 程式碼 | 日常開發 |
| **Postman** | 測試 API（報告生成、Stripe webhook） | API 除錯 |
| **ngrok** | 本機暴露公網，測試 Stripe webhook 回調 | webhook 測試 |
| **DBeaver** | 連接 Supabase 資料庫，查看訂單與報告狀態 | 資料庫管理 |
| **Docker** | 本機模擬 Fly.io 環境測試 Python API | 環境一致性 |
| **GitHub CLI** | 終端機管理 PR/Issue | `gh pr create` |
| **Figma** | 查看設計稿，設計轉程式碼 | UI 實作 |
