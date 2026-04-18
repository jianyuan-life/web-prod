// ============================================================
// 鑑源 AI 團隊 — Post-Generation 5 LLM 品質審查
// ============================================================
// 每份報告生成完成後，自動用 5 個 LLM 並行評分：
//   GPT-4o / Qwen-Max / Gemini 2.5 Pro / Kimi / DeepSeek
//
// 回傳：{ scores, avg, min, issues, reviewer_notes, ... }
//
// 搭配：
//   - workflows/generate-report/steps.ts → aiReviewReport（整合點）
//   - supabase/migrations/create_report_qa_log.sql（評分紀錄）
//   - app/jamie/quality-reports/page.tsx（後台檢視）
//   - lib/ai/observability/telegram.ts（告警）
//
// 重要：
//   1. 5 LLM 並行呼叫（不序列），~30-60 秒完成
//   2. 單一 LLM 失敗不阻塞其他（降級給 80 分 + 標記）
//   3. 所有呼叫進熔斷器（provider-registry）避免連鎖崩壞
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- side effect：確保 5 LLM provider 已註冊
import '../providers'
import { generateParallel } from '../provider-registry'
import type { ProviderName } from '../types'

// ── 型別 ─────────────────────────────────────────────────────

export type ReviewerKey = 'gpt' | 'qwen' | 'gemini' | 'kimi' | 'deepseek'

export interface ReviewerScore {
  reviewer: ReviewerKey
  provider: ProviderName
  model: string
  score: number              // 0-100
  issues: string[]           // 問題清單
  criticalErrors: string[]   // 命理致命錯誤（幻覺、十神錯等）
  strengths: string[]
  suggestions: string[]
  latencyMs: number
  costUsd: number
  passed: boolean            // score >= 95
  error?: string             // 失敗時保留訊息
}

export interface FiveLLMQualityResult {
  scores: Record<ReviewerKey, number>
  avg: number
  min: number
  max: number
  issues: string[]                      // 所有 reviewer 問題匯總（去重）
  criticalErrors: string[]              // 致命錯誤匯總
  reviewer_notes: ReviewerScore[]       // 5 位 reviewer 完整結果
  totalLatencyMs: number
  totalCostUsd: number

  // 判決
  passed: boolean            // min >= 95 且 avg >= 93
  needsRetry: boolean        // 不通過但可重試
  severity: 'ok' | 'yellow' | 'red'  // ok=全過 / yellow=avg<93 / red=avg<85
}

// ── 5 LLM 配置 ───────────────────────────────────────────────

// 5 位 reviewer 的 provider/model 優先順序（自動降級）
// 每人使用「主模型 + 備援模型」避免單一 provider 失效導致評分空白
const REVIEWERS: Array<{
  key: ReviewerKey
  provider: ProviderName
  model: string
  displayName: string
  fallbackModel?: string
}> = [
  { key: 'gpt',      provider: 'openai',    model: 'gpt-4o',              displayName: 'GPT-4o' },
  { key: 'qwen',     provider: 'alibaba',   model: 'qwen-max',            displayName: 'Qwen Max' },
  // v5.3.6：Gemini 2.5 Pro 推理最強但免費層 quota 極少（~5 RPM / 25 RPD）。
  // 先主打 Pro，其下 five-llm-qa 執行時若遇到 429 會自動降級到 Flash（fallbackModel 屬性）。
  // 升級成付費 Gemini API 之後，拔掉 fallbackModel 即可恢復純 Pro。
  { key: 'gemini',   provider: 'google',    model: 'gemini-2.5-pro',      displayName: 'Gemini 2.5 Pro', fallbackModel: 'gemini-2.5-flash' },
  { key: 'kimi',     provider: 'moonshot',  model: 'moonshot-v1-32k',     displayName: 'Kimi (Moonshot)' },
  { key: 'deepseek', provider: 'deepseek',  model: 'deepseek-chat',       displayName: 'DeepSeek V3' },
]

// 評分門檻
export const SCORE_THRESHOLD = {
  HARD_MIN_PER_REVIEWER: 95,   // 單一 reviewer 最低分
  HARD_AVG: 93,                // 5 位平均分
  RED_ALERT: 85,               // 紅色警報門檻（avg < 85）
}

// ── 統一 system prompt（5 LLM 共用）─────────────────────────

const QA_SYSTEM_PROMPT = `你是付費命理報告 QA 審查員，用最嚴苛標準審查報告。

【評分區間】
- 95-100：世界頂級專業水準（罕見）
- 90-94：行業平均以上，可接受但仍有改進空間
- 85-89：明顯瑕疵，不及格
- <85：嚴重問題，不應出貨

【評分維度】每項都要嚴格檢查：
1. 命理準確性：日主/十神/大運/流年/主星/宮位等是否對，有無 AI 幻覺編造
2. 起承轉合結構：章節不跳題、邏輯流暢、前後不矛盾
3. 可讀性：不空泛、有共鳴、讀者看得進去
4. 禁區檢查：無簡體字、無 Markdown 符號（**、##、|）、無評分/百分比、無 emoji
5. 深度與誠意：值 $89 嗎？客戶會覺得物超所值嗎？

【致命錯誤（critical_errors）必須抓出】
- 命盤引用錯誤（日主、天干地支、大運干支）
- 不存在的命理關係（例：子戌相刑、丙庚相沖）
- 生肖/星座/宮位張冠李戴
- 自相矛盾的結論

【輸出格式】
純 JSON，不要包 markdown code block：
{
  "score": 95,
  "issues": ["問題1", "問題2"],
  "critical_errors": ["致命錯誤1"],
  "strengths": ["優點1"],
  "suggestions": ["改進建議1"]
}

重要：
- score 是整數 0-100
- 評 95+ 要很克制，不是每份報告都是頂級
- 發現命理幻覺一律 < 85 分且列入 critical_errors
- 只輸出 JSON，不要任何說明文字`

// ── 核心函式 ─────────────────────────────────────────────────

/**
 * 對一份生成完的報告做 5 LLM 並行品質審查。
 *
 * @param reportContent 完整報告內容
 * @param planCode 方案代碼（C/D/G15/R/E1/E2）
 * @param chartDataJson 排盤 JSON（讓 LLM 能抓「引用命盤錯」；可選）
 * @param customerName 客戶姓名（隱私檢查用；可選）
 */
export async function fiveLLMQualityReview(
  reportContent: string,
  planCode: string,
  chartDataJson: string = '',
  customerName: string = '',
  reportId?: string,
): Promise<FiveLLMQualityResult> {
  const t0 = Date.now()

  // 建構 5 個並行 job
  const jobs = REVIEWERS.map(r => ({
    provider: r.provider,
    model: r.model,
    req: {
      system: QA_SYSTEM_PROMPT,
      user: buildReviewUserPrompt(reportContent, planCode, chartDataJson, customerName),
      maxTokens: 2000,
      temperature: 0.2,  // 審查要穩定
      jsonMode: true,
    },
  }))

  const tracking = {
    reportId: reportId ?? null,
    planCode,
    callStage: 'qa_5llm',
  }

  const responses = await generateParallel(jobs, tracking)

  // v5.3.6：若某 reviewer 有 fallbackModel 且第一輪失敗（通常是 Gemini 2.5 Pro 免費層 429），
  // 自動用 fallbackModel 再試一輪（Pro → Flash）。老闆升級 Gemini 付費後可拔掉 fallbackModel。
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
    console.log(`[5 LLM QA] ${retryJobs.length} 家首輪失敗，用 fallback model 重試: ` +
      retryIndices.map(i => `${REVIEWERS[i].displayName} → ${REVIEWERS[i].fallbackModel}`).join(', '))
    const retryResps = await generateParallel(retryJobs, { ...tracking, callStage: 'qa_5llm_fallback' })
    retryIndices.forEach((idx, rIdx) => {
      responses[idx] = retryResps[rIdx]
    })
  }

  // 解析 5 個結果
  const reviewer_notes: ReviewerScore[] = responses.map((resp, i) => {
    const cfg = REVIEWERS[i]
    if ('error' in resp) {
      // 降級：審查失敗給中等分數但標記為 error，不阻塞主流程
      return {
        reviewer: cfg.key,
        provider: cfg.provider,
        model: cfg.model,
        score: 85,
        issues: [`${cfg.displayName} 審查失敗: ${resp.error}`],
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

  // 聚合
  const scoreMap = {} as Record<ReviewerKey, number>
  for (const n of reviewer_notes) scoreMap[n.reviewer] = n.score
  // v5.3.6：error/quota 失敗的 reviewer 排除計算。
  //   原先：Gemini 429 → 降級給 85 → 納入 min → 永遠 min<95 → 全部報告 fail
  //   改為：只有實際評分過的 reviewer 才算 min/avg，失敗的只列出警告
  //   落單保底：至少 2 家有效才算數；少於 2 家視同 QA 失效降級 legacy 路徑
  const validNotes = reviewer_notes.filter(n => !n.error)
  const values = validNotes.map(n => n.score)
  const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0
  const min = values.length > 0 ? Math.min(...values) : 0
  const max = values.length > 0 ? Math.max(...values) : 0

  // 問題去重
  const allIssues = reviewer_notes.flatMap(n => n.issues)
  const uniqIssues = Array.from(new Set(allIssues)).slice(0, 50)
  const allCritical = reviewer_notes.flatMap(n => n.criticalErrors)
  const uniqCritical = Array.from(new Set(allCritical)).slice(0, 20)

  // 判決：最低分 >= 95 且 平均 >= 93 才通過
  // v5.3.6：若有效 reviewer < 2 家，視為 QA 本身失效，不阻擋（讓 legacy reviewerScore 接手判斷）
  const tooFewValid = values.length < 2
  const passed = !tooFewValid && min >= SCORE_THRESHOLD.HARD_MIN_PER_REVIEWER && avg >= SCORE_THRESHOLD.HARD_AVG
  const needsRetry = !passed && !tooFewValid
  const severity: FiveLLMQualityResult['severity'] =
    avg < SCORE_THRESHOLD.RED_ALERT ? 'red'
    : avg < SCORE_THRESHOLD.HARD_AVG ? 'yellow'
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

function buildReviewUserPrompt(
  reportContent: string,
  planCode: string,
  chartDataJson: string,
  customerName: string,
): string {
  const parts: string[] = []
  parts.push(`## 方案代碼\n${planCode}`)
  if (customerName) parts.push(`## 客戶姓名\n${customerName}`)

  if (chartDataJson && chartDataJson.length > 0) {
    // 限制 chart JSON 長度避免爆 context
    parts.push(`## 命盤 JSON（真實排盤資料，用於驗證報告引用是否正確）\n\`\`\`json\n${chartDataJson.slice(0, 12000)}\n\`\`\``)
  }

  parts.push(`## 待審查報告草稿`)
  // 限制報告長度（避免 5 LLM 都吃爆 token）
  const MAX_REPORT_LEN = 18000
  const truncated = reportContent.length > MAX_REPORT_LEN
    ? reportContent.slice(0, MAX_REPORT_LEN) + '\n\n[...報告過長，後半部截斷用於審查]'
    : reportContent
  parts.push(truncated)

  parts.push('---')
  parts.push('請依系統指示用最嚴苛標準評分。輸出純 JSON，不要 markdown code block：')
  parts.push('{"score": <0-100>, "issues": [...], "critical_errors": [...], "strengths": [...], "suggestions": [...]}')

  return parts.join('\n\n')
}

function parseReviewerResponse(
  content: string,
  cfg: typeof REVIEWERS[number],
  model: string,
  latencyMs: number,
  costUsd: number,
): ReviewerScore {
  // 清掉 markdown code block
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
    return {
      reviewer: cfg.key,
      provider: cfg.provider,
      model,
      score,
      issues: toStringArray(parsed.issues),
      criticalErrors: toStringArray(parsed.critical_errors),
      strengths: toStringArray(parsed.strengths),
      suggestions: toStringArray(parsed.suggestions),
      latencyMs,
      costUsd,
      passed: score >= SCORE_THRESHOLD.HARD_MIN_PER_REVIEWER,
    }
  } catch {
    // 解析失敗：給 80 分 + 標記，不阻塞
    return {
      reviewer: cfg.key,
      provider: cfg.provider,
      model,
      score: 80,
      issues: [`${cfg.displayName} JSON 解析失敗：${content.slice(0, 200)}`],
      criticalErrors: [],
      strengths: [],
      suggestions: ['建議重審查'],
      latencyMs,
      costUsd,
      passed: false,
    }
  }
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.map(x => String(x)).filter(s => s.length > 0).slice(0, 30)
}

// ── 相容舊版：回傳 { score, issues } 介面 ───────────────────
// workflows/generate-report/index.ts 既有判斷 score < 75 / score < 70 的地方繼續可用
export function toLegacyReviewResult(r: FiveLLMQualityResult): { score: number; issues: string[] } {
  return { score: Math.round(r.avg), issues: r.issues.slice(0, 20) }
}
