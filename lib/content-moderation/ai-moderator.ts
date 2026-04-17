// ============================================================
// 內容守門員 — AI 審查（Layer 2）
// ============================================================
// 用途：呼叫 AI Moderation API（優先 OpenAI Moderation，fallback Claude Haiku）
// 回傳：各分類分數 + 布林阻擋/警告判定
//
// 為什麼用兩個 provider？
//   - OpenAI Moderation API 免費、快、原生支援多類別
//   - Claude Haiku 備援：若 OpenAI key 未設定或 API 掛掉，退而求其次
//
// 策略：
//   - 任一類別 score > HARD_THRESHOLD (0.8) → blocked
//   - 任一類別 score > SOFT_THRESHOLD (0.6) → warning（特別是政治/醫療）
// ============================================================

export type AiModerationCategory =
  | 'hate'
  | 'hate/threatening'
  | 'harassment'
  | 'harassment/threatening'
  | 'self-harm'
  | 'self-harm/intent'
  | 'self-harm/instructions'
  | 'sexual'
  | 'sexual/minors'
  | 'violence'
  | 'violence/graphic'
  | 'political'          // Claude-specific（自定）
  | 'medical-promise'    // 自定
  | 'investment-promise' // 自定

export interface AiModerationResult {
  /** 是否阻擋（任一類別超過 HARD_THRESHOLD） */
  blocked: boolean
  /** 警告列表（超過 SOFT_THRESHOLD 但未 block 的類別） */
  warnings: string[]
  /** 各類別分數（0~1） */
  scores: Partial<Record<AiModerationCategory, number>>
  /** 使用的 provider */
  provider: 'openai' | 'claude-haiku' | 'fallback-skip'
  /** 錯誤訊息（若有） */
  error?: string
}

const HARD_THRESHOLD = 0.8
const SOFT_THRESHOLD = 0.6

/**
 * 主入口：呼叫 AI Moderation
 * - 優先 OpenAI（便宜+快）
 * - fallback Claude Haiku（若 OPENAI_API_KEY 未設定）
 * - 最後 fallback：回傳 blocked=false（不阻擋業務流程）
 */
export async function moderateWithAI(content: string): Promise<AiModerationResult> {
  // 超長內容只取前 60,000 字元（OpenAI Moderation 單次上限 32k tokens）
  const truncated = content.length > 60000 ? content.slice(0, 60000) : content

  // Provider 1：OpenAI Moderation API
  if (process.env.OPENAI_API_KEY) {
    try {
      return await callOpenAIModeration(truncated)
    } catch (err) {
      console.error('[content-moderation] OpenAI 失敗，fallback Claude Haiku:', err)
    }
  }

  // Provider 2：Claude Haiku
  if (process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY) {
    try {
      return await callClaudeHaiku(truncated)
    } catch (err) {
      console.error('[content-moderation] Claude Haiku 失敗:', err)
      return {
        blocked: false,
        warnings: [],
        scores: {},
        provider: 'fallback-skip',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  // 沒任何 API key：保留行為（不阻擋，但標註 skip）
  return {
    blocked: false,
    warnings: [],
    scores: {},
    provider: 'fallback-skip',
    error: '未設定 OPENAI_API_KEY / CLAUDE_API_KEY，AI 審查已跳過',
  }
}

// ────────────────────────────────────────────────────────────
// OpenAI Moderation API
// Endpoint: https://api.openai.com/v1/moderations
// Model: omni-moderation-latest
// ────────────────────────────────────────────────────────────
async function callOpenAIModeration(content: string): Promise<AiModerationResult> {
  const apiKey = process.env.OPENAI_API_KEY!
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'omni-moderation-latest',
      input: content,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`OpenAI Moderation ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  const result = data.results?.[0]
  if (!result) throw new Error('OpenAI Moderation 回傳空結果')

  // 合併 flagged categories 的分數
  const scores: Partial<Record<AiModerationCategory, number>> = {}
  const catScores = result.category_scores || {}
  for (const key of Object.keys(catScores)) {
    scores[key as AiModerationCategory] = catScores[key]
  }

  // 判定
  const blocked = Object.values(scores).some(s => typeof s === 'number' && s >= HARD_THRESHOLD)
  const warnings: string[] = []
  for (const [cat, score] of Object.entries(scores)) {
    if (typeof score === 'number' && score >= SOFT_THRESHOLD && score < HARD_THRESHOLD) {
      warnings.push(`${cat}: ${score.toFixed(2)}`)
    }
  }

  return { blocked, warnings, scores, provider: 'openai' }
}

// ────────────────────────────────────────────────────────────
// Claude Haiku 作為備援
// 請 Haiku 判斷 7 大類別，回傳 0~1 分數
// ────────────────────────────────────────────────────────────
async function callClaudeHaiku(content: string): Promise<AiModerationResult> {
  const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY!

  const prompt = `你是內容安全審查員。請針對以下文字，針對各類別給 0~1 的風險分數（0 = 無風險、1 = 高風險）。
只回 JSON，不要任何解釋。格式：
{"hate":0.0,"harassment":0.0,"self-harm":0.0,"sexual":0.0,"violence":0.0,"political":0.0,"medical-promise":0.0,"investment-promise":0.0}

注意：
- political = 偏頗的政治立場、政治人物評論、主權爭議
- medical-promise = 醫療過度承諾、保證治癒、勸阻就醫
- investment-promise = 投資穩賺、保證獲利、具體標的預測

待審文字（最多 10,000 字）：
${content.slice(0, 10000)}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Claude Haiku ${res.status}: ${body.slice(0, 200)}`)
  }

  const data = await res.json()
  const text = data.content?.[0]?.text || ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Claude Haiku 未回傳合法 JSON')

  const parsed = JSON.parse(match[0]) as Record<string, number>
  const scores: Partial<Record<AiModerationCategory, number>> = {}
  for (const key of Object.keys(parsed)) {
    const n = Number(parsed[key])
    if (Number.isFinite(n)) scores[key as AiModerationCategory] = Math.max(0, Math.min(1, n))
  }

  const blocked = Object.values(scores).some(s => typeof s === 'number' && s >= HARD_THRESHOLD)
  const warnings: string[] = []
  for (const [cat, score] of Object.entries(scores)) {
    if (typeof score === 'number' && score >= SOFT_THRESHOLD && score < HARD_THRESHOLD) {
      warnings.push(`${cat}: ${score.toFixed(2)}`)
    }
  }

  return { blocked, warnings, scores, provider: 'claude-haiku' }
}
