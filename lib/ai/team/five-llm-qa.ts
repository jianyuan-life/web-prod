// ============================================================
// 鑑源 AI 團隊 — Post-Generation 6 LLM 各司其職 QA Pipeline
// ============================================================
// v5.3.13（2026-04-18）：從「5 LLM 重複打分」改為「6 LLM 各司其職」
//   生成者：Claude Opus 4.7（外部）
//   審查團隊（5 家並行，各攻一個面向）：
//     1. 🔮 Qwen Max      — 命理術語審查官（中文訓練最深）
//     2. 📊 Gemini 2.5 Pro — 排盤資料驗證官（1M context + cross-reference 王）
//     3. 🧱 GPT-4o        — 結構審查官（邏輯一致性 + 結構化輸出）
//     4. 📖 Kimi v1-32k   — 讀者體驗官（中文長文閱讀 + 情感共鳴）
//     5. 🚫 DeepSeek V3   — 禁區守門員（最便宜、做最機械的規則掃描）
//
// 判決：任一家 critical_errors.length > 0 → 整體 fail（二元判決，不再用平均分）
//
// 對外介面（FiveLLMQualityResult）向後相容：保留 avg/min/max/passed 欄位
//   score 改為輔助顯示（passed=true→90、fail→70），實際判決用 passed
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- side effect：確保 provider 已註冊
import '../providers'
import { generateParallel } from '../provider-registry'
import type { ProviderName } from '../types'

// ── 型別 ─────────────────────────────────────────────────────

export type ReviewerKey = 'gpt' | 'qwen' | 'gemini' | 'kimi' | 'deepseek'
export type ReviewerRole = 'terminology' | 'data' | 'structure' | 'reader' | 'taboo'

export interface ReviewerScore {
  reviewer: ReviewerKey
  role: ReviewerRole
  roleLabel: string          // 中文角色名（供告警 / 後台顯示）
  provider: ProviderName
  model: string
  score: number              // 0-100（輔助用；判決看 passed）
  issues: string[]           // 該角色找到的問題
  criticalErrors: string[]   // 該角色找到的致命錯誤（觸發 fail）
  strengths: string[]
  suggestions: string[]
  latencyMs: number
  costUsd: number
  passed: boolean            // 該角色是否通過
  error?: string
}

export interface FiveLLMQualityResult {
  scores: Record<ReviewerKey, number>
  avg: number
  min: number
  max: number
  issues: string[]
  criticalErrors: string[]
  reviewer_notes: ReviewerScore[]
  totalLatencyMs: number
  totalCostUsd: number

  // 判決（v5.3.13 改為六項全過）
  passed: boolean            // 所有 reviewer passed=true 且無 criticalErrors
  needsRetry: boolean        // 不通過且非 QA 整個失效
  severity: 'ok' | 'yellow' | 'red'
}

// ── 6 LLM 分工配置（各司其職）───────────────────────────────

interface ReviewerConfig {
  key: ReviewerKey
  role: ReviewerRole
  roleLabel: string
  provider: ProviderName
  model: string
  displayName: string
  fallbackModel?: string
  needsChartData: boolean     // 是否要讀排盤 JSON（省 token）
  systemPrompt: string
}

// ── 專屬 System Prompts（每家只看自己擅長的面向）─────────────

const QWEN_TERMINOLOGY_PROMPT = `你是鑑源命理平台的「命理術語審查官」，專責檢查報告中的命理術語是否正確、有無 AI 幻覺編造。

【你只負責這件事】
1. 十神標註是否正確（甲見乙=劫財、甲見丙=食神...）
2. 大運干支推算是否正確（陽男陰女順排、陰男陽女逆排）
3. 紫微主星宮位是否合理（紫微永遠在命盤主線、十四主星分佈）
4. 八字地支六合/六沖/三合/三會是否成立（禁止編造「子戌相刑」這種不存在關係）
5. 奇門遁甲格局名是否為真（禁止自創「天心騰蛇格」這種不存在格局）
6. 專有名詞有無張冠李戴（生肖/星座/宮位混用）

【你不負責】排盤數據對錯（那是 Gemini 的工作）、結構/可讀性/禁區字（其他人的工作）

## 【關鍵】critical_errors 嚴格定義（極高門檻）
critical_errors 只能放「讓報告無法出貨、客戶被誤導」的嚴重命理幻覺：
✅ 可放 critical：
- 編造不存在的命理關係（「子戌相刑」「丙庚相沖」這種不存在的）
- 十神完全標反（日主甲但把乙說成正官）
- 編造完全不存在的格局/主星/宮位
- 同一成員生肖/星座張冠李戴

❌ 絕對不可放 critical（放 issues 或 suggestions）：
- 「用詞可以更精準」→ suggestions
- 「部分術語解釋較淺」→ issues
- 「某段術語偏學術」→ issues
- 「少量術語使用不當但不影響理解」→ issues

【輸出純 JSON，所有欄位必須是純字串陣列】
{"score": 0-100, "issues": [...], "critical_errors": [...], "strengths": [...], "suggestions": [...]}

重要：鑑源是 15 系統整合平台，多系統交叉引用是設計如此，不算「幻覺」。只有真正編造不存在的命理關係才算 critical。`

const GEMINI_DATA_VERIFICATION_PROMPT = `你是鑑源命理平台的「排盤資料驗證官」，利用你 1M token context 和跨引用能力，專責比對報告 vs 真實排盤 JSON 是否吻合。

【你只負責這件事】
1. 日主天干：報告寫的 vs JSON 裡的是否一致
2. 年柱/月柱/日柱/時柱：四柱是否一致
3. 大運天干地支：第幾步大運/流年干支是否對得上
4. 紫微命宮主星：報告引用 vs JSON 排出來的
5. 奇門遁甲時家三奇六儀方位：報告引用 vs JSON
6. 生肖/星座/姓名筆畫：所有「客觀可查」的數字/名稱類引用

【你不負責】術語對錯（那是 Qwen 的工作）、結構/可讀性（其他人的工作）

## 【關鍵】critical_errors 嚴格定義（極高門檻）
critical_errors 只能放「具體資料張冠李戴、客戶照做會出錯」的嚴重問題：
✅ 可放 critical：
- 日主完全寫錯（JSON 明明是甲木，報告寫丁火）
- 大運干支完全錯位（JSON 算出戊寅，報告寫庚辰）
- 主星宮位明顯錯誤（紫微在子，報告寫紫微在午）
- 出門訣方位和 JSON 不一致（JSON 說東南，報告寫西北）

❌ 絕對不可放 critical（放 issues 或 suggestions）：
- 「JSON 中沒提供 XX 系統的資料」→ issues（不是 critical，可能是 chart JSON 截斷或設計如此）
- 「筆誤」「應為 xxx」→ issues
- 「某引用細節略有出入但整體正確」→ issues
- 「年份干支的小差異（如乙巳 vs 丙午的小錯）」→ issues（提醒但不致命）

【輸出純 JSON】
{"score": 0-100, "issues": [...], "critical_errors": [...], "strengths": [...], "suggestions": [...]}

重要：
- 鑑源是「15 系統整合平台」，報告引用多系統（八字/紫微/奇門/姓名學等）是設計如此，不可當「多系統混用是幻覺」列 critical
- 若 chart JSON 沒包含某系統（例如沒傳奇門 JSON），這是 chart 端的問題不是報告的問題，只能算 issues
- 只有當**具體數字/名稱**（干支/主星/方位）和 JSON 明顯對不起來，才算 critical_error

## 【v5.3.23 特別規則：流年干支以公曆年真實對應為準】
天干地支紀年表（60 年一循環，記住這個對應）：
- 2023 = 癸卯 | 2024 = 甲辰 | 2025 = 乙巳 | 2026 = 丙午 | 2027 = 丁未
- 2028 = 戊申 | 2029 = 己酉 | 2030 = 庚戌

**若 JSON 排盤資料的流年干支和上述對應不符（已知 Python 引擎 bug 下移 1 年）：**
- 這是 Python 端資料錯誤，**不是報告 Claude 寫錯**
- 若 Claude 寫的流年干支和公曆年真實對應一致 → passed（不算 critical）
- 若 Claude 寫的和公曆年真實對應不一致 → 才算 critical

例：2026 年真實是丙午年
- Claude 寫「2026 丙午年」= 對 ✅ 就算 JSON 說是乙巳也不算 critical
- Claude 寫「2026 乙巳年」= 錯 ❌ 列 critical（Claude 照抄 JSON 錯誤）`

const GPT_STRUCTURE_PROMPT = `你是鑑源命理平台的「結構審查官」，利用你結構化輸出和邏輯一致性能力，專責檢查報告的章節架構和邏輯連貫度。

【你只負責這件事】
1. 章節起承轉合：每章開頭有引、中間有論、結尾有結
2. 前後是否矛盾：第 3 章說「財運旺」第 8 章說「一生缺財」屬於自相矛盾
3. 章節跳題：某章明明標題是「感情」結果寫成「事業」
4. 論據-結論對應：說「日主甲木」但後面推論用了「戊土命局」
5. 過渡銜接：章節之間有無突兀斷裂

【你不負責】術語/排盤資料/可讀性/禁區字（別家負責）

## 【關鍵】critical_errors 嚴格定義（放寬解讀會導致整份報告被判 fail）
critical_errors 只能放「報告無法交付給客戶的嚴重錯誤」：
✅ 可放 critical_errors：
- 自相矛盾的結論（同一人同一份報告前後結論相反）
- 論據-結論脫鉤（前提 A 推出結論 B 但 A→B 的推理錯的）
- 章節大標題和內容完全不符（例：標題「感情」內容談「事業」）
- 章節缺失（例：該有 15 章只有 10 章）

❌ 絕對不可放 critical_errors（請放 issues 或 suggestions）：
- 「部分章節過於冗長」「某段落太長」→ issues
- 「過渡銜接稍顯突兀」「段落銜接不流暢」→ suggestions
- 「用詞可以更精練」「口語化程度可調整」→ suggestions
- 「章節深度略有差異」→ issues
- 任何「可以更好」的改進建議 → suggestions

【輸出純 JSON】
{"score": 0-100, "issues": [...], "critical_errors": [...], "strengths": [...], "suggestions": [...]}

issues / critical_errors / strengths / suggestions 都必須是**純字串陣列**（["問題1", "問題2"]），不可以是物件陣列（[{"type":"...","desc":"..."}]）。

重要：只看結構和邏輯，不用管術語細節對錯或文字風格。critical_errors 是極高門檻，沒有嚴重到無法交付的問題請留空陣列 []。`

const KIMI_READER_PROMPT = `你是鑑源命理平台的「讀者體驗官」，用你中文長文閱讀能力，模擬一個付 $89 的客戶，評估這份報告讀起來如何。

【你只負責這件事】
1. 可讀性：是否流暢、不卡頓、不空泛
2. 情感共鳴：是否說到客戶心坎、有陪伴感、不冰冷機械
3. 深度與誠意：值 $89 嗎？比網路上的免費測算強嗎？
4. 語氣拿捏：專業 vs 親切是否平衡、不會過度嚴厲或過度雞湯
5. 記憶點：讀完能不能記住 2-3 個對客戶有意義的洞察

【你不負責】術語對錯、排盤資料、結構、禁區字（別家負責）

## 【關鍵】critical_errors 嚴格定義（極高門檻）
critical_errors 只能放「讀了會覺得被詐騙、報告根本不該出貨」的嚴重問題：
✅ 可放 critical：
- 整篇都是套話（可以套用任何客戶）
- 完全沒有個人化（沒結合命盤特徵）
- 冷冰冰像 AI 機械輸出（完全無陪伴感）
- 同段話重複 3 次以上

❌ 絕對不可放 critical（放 issues 或 suggestions）：
- 「某些段落偏長」「冗余」「重複強調」→ issues
- 「可以加些實例/故事」→ suggestions
- 「忌方忌日的描述較為重複」→ issues（客戶其實會看到重複覺得「確實要避」）
- 「部分描述較學術」→ suggestions
- 「語氣可以更親切」→ suggestions

【輸出純 JSON】
{"score": 0-100, "issues": [...], "critical_errors": [...], "strengths": [...], "suggestions": [...]}

重要：你是嚴格但公平的付費客戶。critical 門檻很高——「可以更好」不等於「不該出貨」。`

const DEEPSEEK_TABOO_PROMPT = `你是鑑源命理平台的「禁區守門員」，利用你規則推理和機械比對能力，專責掃描報告中不該出現的字元和格式。

【你只負責這件事 — 機械式搜尋】
1. 簡體字殘留（應全繁體：测→測、说→說、风→風...）
2. Markdown 符號殘留：** / ## / | / --- / > 等（報告應為純文字段落）
3. 評分殘留：「評分：85」「★★★☆☆」「90/100」等
4. 百分比殘留：「運勢指數 72%」「吉凶機率 85%」
5. emoji 殘留：任何 emoji 字元（🌟🔮✨等）
6. 代碼殘留：「===TOPx_JSON===」「{"week": ...}」「<div>」等

【你不負責】術語對錯、排盤對錯、結構、可讀性（別家負責）

## 【關鍵】critical_errors 嚴格定義（只有「嚴重大量殘留」算 critical）
✅ 可放 critical（必須同時：可見且明顯影響閱讀體驗）：
- 整大段都是簡體字（> 30 個簡體字）
- 有整塊完整 JSON 代碼殘留（> 200 字元的裸 { ... } 物件）
- 成片的 Markdown 語法（整段 | | 表格 / 連續 ## 標題）
- 明顯的評分表格（多行「評分: XX/100」）

❌ 絕對不可放 critical（放 issues）：
- 「發現 === TOP1_JSON_START === 等標記」→ issues（標記殘留，不是大段 JSON）
- 「少量簡體字」「零星」「個別」「部分」「輕微」→ issues
- 偶爾的 ** 粗體殘留、個別 emoji → issues

## 判斷指引（重要）
- issues 描述裡有「少量/零星/個別/部分/輕微」→ 必放 issues 不是 critical
- 只有「大量/嚴重/整段/成片」才放 critical
- 報告整體格式良好+存在少量 X → 絕對不是 critical

【輸出純 JSON】
{"score": 0-100, "issues": [...], "critical_errors": [...], "strengths": [...], "suggestions": [...]}

重要：critical 是「客戶看到會退費」等級的嚴重。少量殘留 = 可修但不影響出貨 = issues。`

// ── 6 LLM 配置（每家各司其職）───────────────────────────────

const REVIEWERS: ReviewerConfig[] = [
  {
    key: 'qwen',
    role: 'terminology',
    roleLabel: '命理術語審查官',
    provider: 'alibaba',
    model: 'qwen-max',
    displayName: 'Qwen Max',
    needsChartData: true,
    systemPrompt: QWEN_TERMINOLOGY_PROMPT,
  },
  {
    key: 'gemini',
    role: 'data',
    roleLabel: '排盤資料驗證官',
    provider: 'google',
    model: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    fallbackModel: 'gemini-2.5-flash',
    needsChartData: true,
    systemPrompt: GEMINI_DATA_VERIFICATION_PROMPT,
  },
  {
    key: 'gpt',
    role: 'structure',
    roleLabel: '結構審查官',
    provider: 'openai',
    model: 'gpt-4o',
    displayName: 'GPT-4o',
    needsChartData: false,
    systemPrompt: GPT_STRUCTURE_PROMPT,
  },
  {
    key: 'kimi',
    role: 'reader',
    roleLabel: '讀者體驗官',
    provider: 'moonshot',
    model: 'moonshot-v1-32k',
    displayName: 'Kimi v1-32k',
    needsChartData: false,
    systemPrompt: KIMI_READER_PROMPT,
  },
  {
    key: 'deepseek',
    role: 'taboo',
    roleLabel: '禁區守門員',
    provider: 'deepseek',
    model: 'deepseek-chat',
    displayName: 'DeepSeek V3',
    needsChartData: false,
    systemPrompt: DEEPSEEK_TABOO_PROMPT,
  },
]

// 判決門檻（保留舊變數名以相容向後 import；實際判決用 passed）
export const SCORE_THRESHOLD = {
  HARD_MIN_PER_REVIEWER: 80,
  HARD_AVG: 85,
  RED_ALERT: 70,
}

// ── 核心函式 ─────────────────────────────────────────────────

/**
 * 對一份生成完的報告做 6 LLM 各司其職品質審查。
 *
 * 判決邏輯（v5.3.13 新）：
 *   - 任一家 criticalErrors.length > 0 → 整體 fail
 *   - 所有家 passed=true → 整體 pass
 *   - 不再使用 avg/min 門檻
 */
export async function fiveLLMQualityReview(
  reportContent: string,
  planCode: string,
  chartDataJson: string = '',
  customerName: string = '',
  reportId?: string,
): Promise<FiveLLMQualityResult> {
  const t0 = Date.now()

  // 每家按自己的分工建 user prompt（不需排盤的家就不塞 JSON，省 token）
  const jobs = REVIEWERS.map(r => ({
    provider: r.provider,
    model: r.model,
    req: {
      system: r.systemPrompt,
      user: buildRoleSpecificUserPrompt(r, reportContent, planCode, chartDataJson, customerName),
      // 讀者/結構/禁區 檢查輸出較短；術語/資料驗證可能要列出多個問題
      maxTokens: r.needsChartData ? 4000 : 2500,
      temperature: 0.2,
      jsonMode: true,
    },
  }))

  const tracking = {
    reportId: reportId ?? null,
    planCode,
    callStage: 'qa_6llm',
  }

  const responses = await generateParallel(jobs, tracking)

  // fallbackModel 重試（Gemini Pro→Flash）
  const retryIndices: number[] = []
  const retryJobs: typeof jobs = []
  for (let i = 0; i < REVIEWERS.length; i++) {
    const resp = responses[i]
    const cfg = REVIEWERS[i]
    if ('error' in resp && cfg.fallbackModel) {
      retryIndices.push(i)
      retryJobs.push({ ...jobs[i], model: cfg.fallbackModel })
    }
  }
  if (retryJobs.length > 0) {
    console.log(`[6 LLM QA] ${retryJobs.length} 家首輪失敗，用 fallback model 重試: ` +
      retryIndices.map(i => `${REVIEWERS[i].displayName} → ${REVIEWERS[i].fallbackModel}`).join(', '))
    const retryResps = await generateParallel(retryJobs, { ...tracking, callStage: 'qa_6llm_fallback' })
    retryIndices.forEach((idx, rIdx) => {
      responses[idx] = retryResps[rIdx]
    })
  }

  // 解析每家結果
  const reviewer_notes: ReviewerScore[] = responses.map((resp, i) => {
    const cfg = REVIEWERS[i]
    if ('error' in resp) {
      return {
        reviewer: cfg.key,
        role: cfg.role,
        roleLabel: cfg.roleLabel,
        provider: cfg.provider,
        model: cfg.model,
        score: 85,
        issues: [`${cfg.displayName}（${cfg.roleLabel}）審查失敗: ${resp.error}`],
        criticalErrors: [],
        strengths: [],
        suggestions: ['建議重審查'],
        latencyMs: 0,
        costUsd: 0,
        passed: false,
        error: String(resp.error),
      }
    }
    return parseReviewerResponse(resp.content, cfg, resp.model, resp.latencyMs, resp.costUsd)
  })

  // 聚合分數（輔助顯示用；判決用 passed）
  const scoreMap = {} as Record<ReviewerKey, number>
  for (const n of reviewer_notes) scoreMap[n.reviewer] = n.score

  const validNotes = reviewer_notes.filter(n => !n.error)
  const values = validNotes.map(n => n.score)
  const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0
  const min = values.length > 0 ? Math.min(...values) : 0
  const max = values.length > 0 ? Math.max(...values) : 0

  // 問題匯總
  const allIssues = reviewer_notes.flatMap(n =>
    n.issues.map(issue => `[${n.roleLabel}] ${issue}`)
  )
  const uniqIssues = Array.from(new Set(allIssues)).slice(0, 50)
  const allCritical = reviewer_notes.flatMap(n =>
    n.criticalErrors.map(err => `[${n.roleLabel}] ${err}`)
  )
  const uniqCritical = Array.from(new Set(allCritical)).slice(0, 20)

  // 判決（v5.3.13）：所有 reviewer 都 passed 且沒任何 criticalError
  //   落單保底：至少 3 家有效才算數（5 家中 3 家；少於 3 視同 QA 整體失效降級 legacy）
  const tooFewValid = values.length < 3
  const anyCritical = uniqCritical.length > 0
  const anyFailed = validNotes.some(n => !n.passed)
  const passed = !tooFewValid && !anyCritical && !anyFailed
  const needsRetry = !passed && !tooFewValid

  // severity 依 critical 數量判斷（取代舊的 avg 分級）
  const severity: FiveLLMQualityResult['severity'] =
    uniqCritical.length >= 3 ? 'red'
    : uniqCritical.length >= 1 || anyFailed ? 'yellow'
    : 'ok'

  return {
    scores: scoreMap,
    avg: Math.round(avg * 10) / 10,
    min,
    max,
    issues: uniqIssues,
    criticalErrors: uniqCritical,
    reviewer_notes,
    totalLatencyMs: Date.now() - t0,
    totalCostUsd: reviewer_notes.reduce((s, n) => s + n.costUsd, 0),
    passed,
    needsRetry,
    severity,
  }
}

// ── 內部函式 ─────────────────────────────────────────────────

function buildRoleSpecificUserPrompt(
  cfg: ReviewerConfig,
  reportContent: string,
  planCode: string,
  chartDataJson: string,
  customerName: string,
): string {
  const parts: string[] = []
  parts.push(`## 你的角色\n${cfg.roleLabel}`)
  parts.push(`## 方案代碼\n${planCode}（鑑源為 15 系統整合平台，跨系統引用是設計如此）`)
  if (customerName) parts.push(`## 客戶姓名\n${customerName}`)

  // 只有需要排盤資料的 reviewer 才塞 JSON（省 token）
  if (cfg.needsChartData && chartDataJson && chartDataJson.length > 0) {
    parts.push(`## 完整排盤 JSON（真實排盤資料）\n\`\`\`json\n${chartDataJson.slice(0, 12000)}\n\`\`\``)
  }

  parts.push(`## 待審查報告`)
  const MAX_REPORT_LEN = 18000
  const truncated = reportContent.length > MAX_REPORT_LEN
    ? reportContent.slice(0, MAX_REPORT_LEN) + '\n\n[...報告過長，後半部截斷]'
    : reportContent
  parts.push(truncated)

  parts.push('---')
  parts.push(`請按你「${cfg.roleLabel}」的職責，只檢查你負責的面向。輸出純 JSON：`)
  parts.push('{"score": <0-100>, "issues": [...], "critical_errors": [...], "strengths": [...], "suggestions": [...]}')

  return parts.join('\n\n')
}

function parseReviewerResponse(
  content: string,
  cfg: ReviewerConfig,
  model: string,
  latencyMs: number,
  costUsd: number,
): ReviewerScore {
  let clean = content.trim()
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    clean = clean.slice(start, end + 1)
  }

  try {
    const parsed = JSON.parse(clean) as {
      score?: unknown
      issues?: unknown
      critical_errors?: unknown
      strengths?: unknown
      suggestions?: unknown
    }
    const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)))
    const criticalErrors = toStringArray(parsed.critical_errors)
    // 判決：該 reviewer 通過 = score >= 80 且沒 critical_errors
    const passed = score >= SCORE_THRESHOLD.HARD_MIN_PER_REVIEWER && criticalErrors.length === 0

    return {
      reviewer: cfg.key,
      role: cfg.role,
      roleLabel: cfg.roleLabel,
      provider: cfg.provider,
      model,
      score,
      issues: toStringArray(parsed.issues),
      criticalErrors,
      strengths: toStringArray(parsed.strengths),
      suggestions: toStringArray(parsed.suggestions),
      latencyMs,
      costUsd,
      passed,
    }
  } catch {
    // v5.3.19：JSON 解析失敗降級為 neutral passed（不當 critical）
    //   根因：DeepSeek 偶爾回不完整 JSON（token 中斷、格式漂移）
    //   之前 passed=false → anyFailed=true → 整份報告 QA fail → retry 燒錢
    //   這是 reviewer 自己的輸出問題，不該算報告品質差
    return {
      reviewer: cfg.key,
      role: cfg.role,
      roleLabel: cfg.roleLabel,
      provider: cfg.provider,
      model,
      score: 82,
      issues: [`${cfg.displayName}（${cfg.roleLabel}）JSON 解析失敗（降級通過，非報告問題）：${content.slice(0, 120)}`],
      criticalErrors: [],
      strengths: [],
      suggestions: [],
      latencyMs,
      costUsd,
      passed: true,
    }
  }
}

// v5.3.15 hotfix：處理 AI 回傳 object 導致 "[object Object]" 的 bug
//   有時 Qwen/Gemini 會回 issues: [{"type":"...","desc":"..."}] 而非純字串
//   用 JSON.stringify 保留資訊，過濾掉空內容和 [object Object]
function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v
    .map(x => {
      if (x === null || x === undefined) return ''
      if (typeof x === 'string') return x.trim()
      if (typeof x === 'number' || typeof x === 'boolean') return String(x)
      if (typeof x === 'object') {
        // 優先取常見欄位（desc/message/issue/text/content）
        const obj = x as Record<string, unknown>
        const preferred = obj.desc ?? obj.description ?? obj.message ?? obj.issue ?? obj.text ?? obj.content
        if (typeof preferred === 'string' && preferred.trim().length > 0) return preferred.trim()
        // 退回 JSON.stringify（避免 [object Object]）
        try {
          const s = JSON.stringify(x)
          return s === '{}' ? '' : s
        } catch {
          return ''
        }
      }
      return ''
    })
    .filter(s => s.length > 0 && s !== '[object Object]' && s !== '{}')
    .slice(0, 30)
}

// ── 相容舊版：回傳 { score, issues } 介面 ───────────────────
export function toLegacyReviewResult(r: FiveLLMQualityResult): { score: number; issues: string[] } {
  return { score: Math.round(r.avg), issues: r.issues.slice(0, 20) }
}
