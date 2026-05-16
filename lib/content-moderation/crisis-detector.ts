// ============================================================
// 提示詞合集 Prompt 6 — Crisis Detector
// ============================================================
// 掃 AI 報告 markdown,命中三類風險詞 → report.meta.crisis=true,
// 前端在報告最頂插 <CrisisCard/>(見 components/CrisisCard.tsx),
// 並寫 audit log(crisis_events)。
//
// additive 純函式、零行為變化:由呼叫端(report 渲染 / 生成後 QA)
// 決定是否套用。本檔不自動 wire。法務 review 後上線(P0)。

export type CrisisCategory = 'self_harm' | 'severe_depression' | 'acute_stress'

export interface CrisisScanResult {
  crisis: boolean
  categories: CrisisCategory[]
  matchedTerms: string[]
}

// 風險詞庫(提示詞合集 Prompt 6 原文 + 常見變體;中英雙語)
const RISK_TERMS: Record<CrisisCategory, string[]> = {
  self_harm: [
    '自殺', '自我了結', '不想活', '想消失', '結束一切', '活不下去',
    '解脫', '我想離開', '了結自己', '輕生', '不如死了', '一了百了',
    'kill myself', 'end my life', 'suicide', 'want to die',
  ],
  severe_depression: [
    '沒有未來', '毫無意義', '所有人沒我會更好', '沒有人需要我',
    '人生沒意義', '活著好累', '撐不下去了',
    'everyone better off without me', 'no future', 'pointless to live',
  ],
  acute_stress: [
    '撐不下去', '崩潰邊緣', '失控', '想傷害他人', '不想再忍',
    '快瘋了', '受不了了',
    'breaking down', 'lose control', 'hurt someone',
  ],
}

/**
 * 掃描文字。命中任一類即 crisis=true。
 * 大小寫不敏感(英文);中文直接 includes。
 */
export function scanForCrisis(text: string): CrisisScanResult {
  if (!text) return { crisis: false, categories: [], matchedTerms: [] }
  const lower = text.toLowerCase()
  const cats = new Set<CrisisCategory>()
  const hits: string[] = []
  for (const [cat, terms] of Object.entries(RISK_TERMS) as [CrisisCategory, string[]][]) {
    for (const t of terms) {
      const needle = /[a-z]/i.test(t) ? t.toLowerCase() : t
      const hay = /[a-z]/i.test(t) ? lower : text
      if (hay.includes(needle)) {
        cats.add(cat)
        hits.push(t)
      }
    }
  }
  return { crisis: cats.size > 0, categories: [...cats], matchedTerms: [...new Set(hits)] }
}

/**
 * 寫 audit log 到 supabase crisis_events(表不存在則僅 console、不阻塞)。
 * server-only 呼叫。
 */
export async function logCrisisEvent(input: {
  userId?: string | null
  reportId?: string | null
  matchedTerms: string[]
  locale: string
}): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    await fetch(`${url}/rest/v1/crisis_events`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: input.userId || null,
        report_id: input.reportId || null,
        matched_terms: input.matchedTerms,
        locale: input.locale,
        ts: new Date().toISOString(),
      }),
    })
  } catch {
    /* audit log 失敗不阻塞主流程 */
  }
}
