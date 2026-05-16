// ============================================================
// 提示詞合集 Prompt 8 — Writer-Judge 雙 Agent(Judge 側)
// ============================================================
// Writer(Opus 4.6,既有 claudeStreamingCall)產出後,Judge 用
// 獨立 context 的 Sonnet 拿 報告 + 排盤 JSON,輸出
// { score, hallucinations[], missing_citations[] };score<90 退回
// Writer 修(max 2 輪、由呼叫端控制)。
//
// 對齊根 CLAUDE.md「Anti-pattern:Self-review」— Judge 用不同模型
// (Sonnet)+ 全新 context(不帶 Writer 歷史)。
//
// 🔴 自治邊界:Judge 純函式 = 自治;接進 workflow(改付費生成流程)
//   = P0 認可版變更,需 promptfoo + 4 層審查 + 老闆。本檔未自動 wire。

export interface JudgeVerdict {
  score: number // 0-100
  hallucinations: string[]
  missing_citations: string[]
  raw?: string
}

const JUDGE_SYSTEM =
  '你是命理報告獨立稽核官(與撰寫者無關、不偏袒)。' +
  '【排盤數據】是唯一真相。檢查報告:① 是否有排盤找不到依據的具體聲稱(hallucination)' +
  '② 是否該引用排盤卻沒引(missing citation)③ 0-100 整體可信分。' +
  '只回 JSON:{"score":int,"hallucinations":[...],"missing_citations":[...]}。'

/**
 * 用 Sonnet 獨立 context 審報告。失敗回 score=-1(呼叫端視為 judge 不可用、
 * 不阻塞主流程;不可因 judge 掛掉就把報告當不合格丟棄)。
 */
export async function judgeReport(report: string, chartJson: string): Promise<JudgeVerdict> {
  const key = process.env.CLAUDE_API_KEY
  if (!key) return { score: -1, hallucinations: [], missing_citations: [], raw: 'no CLAUDE_API_KEY' }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        system: [{ type: 'text', text: JUDGE_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [
          {
            role: 'user',
            content: `【排盤數據】\n${chartJson.slice(0, 12000)}\n\n【報告】\n${report.slice(0, 20000)}\n\n只回 JSON。`,
          },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) return { score: -1, hallucinations: [], missing_citations: [], raw: `HTTP ${res.status}` }
    const data = await res.json()
    const txt: string = Array.isArray(data?.content)
      ? data.content.find((c: { type?: string }) => c?.type === 'text')?.text || ''
      : ''
    const s = txt.indexOf('{')
    const e = txt.lastIndexOf('}')
    if (s < 0 || e < 0) return { score: -1, hallucinations: [], missing_citations: [], raw: txt.slice(0, 300) }
    const parsed = JSON.parse(txt.slice(s, e + 1))
    return {
      score: typeof parsed.score === 'number' ? parsed.score : -1,
      hallucinations: Array.isArray(parsed.hallucinations) ? parsed.hallucinations : [],
      missing_citations: Array.isArray(parsed.missing_citations) ? parsed.missing_citations : [],
    }
  } catch (e) {
    return { score: -1, hallucinations: [], missing_citations: [], raw: e instanceof Error ? e.message : String(e) }
  }
}

/** Writer-Judge 迴圈控制(呼叫端用;writer 為既有生成函式注入) */
export async function writerJudgeLoop(
  writer: (revisionNote?: string) => Promise<string>,
  chartJson: string,
  opts: { minScore?: number; maxRounds?: number } = {},
): Promise<{ report: string; verdict: JudgeVerdict; rounds: number }> {
  const minScore = opts.minScore ?? 90
  const maxRounds = opts.maxRounds ?? 2
  let report = await writer()
  let verdict = await judgeReport(report, chartJson)
  let rounds = 0
  while (verdict.score >= 0 && verdict.score < minScore && rounds < maxRounds) {
    rounds++
    const note =
      `上一版 judge score=${verdict.score}。需修正:\n` +
      `幻覺:${verdict.hallucinations.join('; ') || '無'}\n` +
      `缺引用:${verdict.missing_citations.join('; ') || '無'}\n請修正後重寫。`
    report = await writer(note)
    verdict = await judgeReport(report, chartJson)
  }
  return { report, verdict, rounds }
}
