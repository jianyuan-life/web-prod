// ============================================================
// 鑑源 AI 團隊 — 三方 Peer Review（並行審查）
// ============================================================
// 三個不同陣營（美國 GPT / Google Gemini / 中國 Qwen）並行審同一份稿
// 三方都 ≥ 96 分才通過
// 任一 < 96 → 收集具體反饋回主筆重寫

import { generateParallel } from '../provider-registry'
import { ASTROLOGY_VALIDATOR, STRUCTURE_ARCHITECT, UX_ADVOCATE, type RoleConfig } from './roles'
import type { ReviewResult } from '../types'

const PASS_THRESHOLD = 96  // 全部 ≥ 96 才通過

export interface PeerReviewResult {
  passed: boolean
  overallScore: number              // 三方平均
  weakestScore: number              // 最低的那個
  reviews: ReviewResult[]           // 三方完整結果
  combinedFeedback: string          // 給主筆的整合反饋（失敗時用）
  totalLatencyMs: number
  totalCostUsd: number
}

/**
 * 對一份報告草稿做三方 Peer Review
 *
 * @param draft 報告草稿
 * @param chartDataJson 排盤 JSON（審查時 LLM 參考用，才能抓到「引用命盤錯」）
 * @param planCode 方案代碼（給審查 LLM 背景資訊）
 */
export async function peerReview(
  draft: string,
  chartDataJson: string,
  planCode: string,
  reportId?: string,
): Promise<PeerReviewResult> {
  const t0 = Date.now()

  // 3 方審查同時發送（若主 provider 掛掉會自動降級到備援）
  const jobs = [ASTROLOGY_VALIDATOR, STRUCTURE_ARCHITECT, UX_ADVOCATE].map(role => {
    // 取第一個可用的 provider（registry 有熔斷器，這裡先用 role.providers[0]）
    const first = role.providers[0]
    return {
      provider: first.provider,
      model: first.model,
      req: {
        system: role.systemPrompt,
        user: buildReviewUserPrompt(draft, chartDataJson, planCode, role),
        maxTokens: 2000,
        temperature: 0.2,  // 審查要穩定
        jsonMode: true,
      },
    }
  })

  const responses = await generateParallel(jobs, {
    reportId: reportId ?? null,
    planCode,
    callStage: 'team_peer_review',
  })

  // 解析三方結果
  const roles: RoleConfig[] = [ASTROLOGY_VALIDATOR, STRUCTURE_ARCHITECT, UX_ADVOCATE]
  const reviews: ReviewResult[] = responses.map((resp, i) => {
    const role = roles[i]
    if ('error' in resp) {
      // 備援：審查失敗給個中等分數，不阻塞
      return {
        score: 85,
        issues: [`${role.name} 審查失敗: ${resp.error}`],
        strengths: [],
        suggestions: ['重試審查'],
        reviewer: role.name,
        reviewerModel: 'error',
        latencyMs: 0,
        costUsd: 0,
      }
    }
    return parseReviewJson(resp.content, role, resp.model, resp.latencyMs, resp.costUsd)
  })

  const overallScore = reviews.reduce((s, r) => s + r.score, 0) / reviews.length
  const weakestScore = Math.min(...reviews.map(r => r.score))
  const passed = weakestScore >= PASS_THRESHOLD

  // 若未過，整合反饋給主筆
  const combinedFeedback = !passed ? buildCombinedFeedback(reviews) : ''

  return {
    passed,
    overallScore: Math.round(overallScore * 10) / 10,
    weakestScore,
    reviews,
    combinedFeedback,
    totalLatencyMs: Date.now() - t0,
    totalCostUsd: reviews.reduce((s, r) => s + r.costUsd, 0),
  }
}

// ============================================================
// 內部函式
// ============================================================

function buildReviewUserPrompt(
  draft: string,
  chartDataJson: string,
  planCode: string,
  role: RoleConfig,
): string {
  return `## 方案代碼
${planCode}

## 命盤 JSON（真實排盤資料，用於驗證報告引用是否正確）
\`\`\`json
${chartDataJson.slice(0, 15000)}
\`\`\`

## 待審查報告草稿

${draft}

---

請依照系統指示的評分標準審查這份報告。輸出純 JSON，不要包 markdown code block，格式：
{"score": <0-100 整數>, "issues": [具體問題清單], "strengths": [優點清單], "suggestions": [修改建議清單]}

重要：
- score 是整數 0-100
- 每項 issue / suggestion 要具體，引用報告的段落或措辭
- 若評分 < 96，suggestions 必須具體指出「哪一句該改成什麼」
`
}

function parseReviewJson(
  content: string,
  role: RoleConfig,
  model: string,
  latencyMs: number,
  costUsd: number,
): ReviewResult {
  // 嘗試解析 JSON（有些 LLM 會誤加 markdown code block）
  let clean = content.trim()
  clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  // 找第一個 { 到最後一個 }
  const start = clean.indexOf('{')
  const end = clean.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    clean = clean.slice(start, end + 1)
  }

  try {
    const parsed = JSON.parse(clean)
    return {
      score: Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0))),
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(String) : [],
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
      reviewer: role.name,
      reviewerModel: model,
      latencyMs,
      costUsd,
    }
  } catch {
    // 解析失敗：給默認 80 分 + 標記
    return {
      score: 80,
      issues: [`${role.name} JSON 解析失敗，原始回應: ${content.slice(0, 200)}`],
      strengths: [],
      suggestions: ['建議重審查'],
      reviewer: role.name,
      reviewerModel: model,
      latencyMs,
      costUsd,
    }
  }
}

/**
 * 把三方反饋整合成給主筆修訂用的提示
 */
function buildCombinedFeedback(reviews: ReviewResult[]): string {
  const lines: string[] = [
    '以下是三方 Peer Review 的反饋，請依此修訂報告：',
    '',
  ]
  for (const r of reviews) {
    lines.push(`## ${r.reviewer} 評分：${r.score}/100`)
    if (r.issues.length > 0) {
      lines.push('### 問題：')
      r.issues.forEach(i => lines.push(`- ${i}`))
    }
    if (r.suggestions.length > 0) {
      lines.push('### 修改建議：')
      r.suggestions.forEach(s => lines.push(`- ${s}`))
    }
    lines.push('')
  }
  lines.push('---')
  lines.push('請根據上面所有具體反饋重寫報告。保留原本好的部分，修正被指出的問題。')
  return lines.join('\n')
}
