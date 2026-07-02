// ============================================================
// 敘事綜合萃取(命格原型/一句話/天賦Top3/課題Top3)— 共用純函式
//
// v5.10.461(P0-4 修、2026-07-03):從 workflows/generate-report/steps.ts
// aiExtractNarrative 抽出。原邏輯只活在 workflow "use step" 內、fallback
// generate-report route 與 admin backfill 無法重用 → 6/24 fallback 重生的
// 報告 narrative_summary 全空、v5.10.454 招牌「命格綜合卡」0 客戶可見。
//
// 黃金驗證 2026-06-23 通過(12 份 C/D/G15/R、平均可追溯率 1.0、0 flagged、
// 見 tasks/golden_validation_2026-06-23.md)。忠於原文、報告沒寫的回 null。
// 失敗一律回 null(呼叫端不阻塞、卡片 graceful 不顯)。
// ============================================================

export type NarrativeSummary = {
  archetype: string | null
  oneLiner: string | null
  talentsTop3: string[]
  risksTop3: string[]
}

export async function extractNarrativeFromContent(reportContent: string, timeoutMs = 60000): Promise<NarrativeSummary | null> {
  if (!reportContent || reportContent.length < 800) return null
  const GK = process.env.GEMINI_API_KEY
  if (!GK) return null
  const prompt = `你是嚴謹資料萃取器。以下是命理報告全文。**只萃取報告「已明確寫出」的內容、絕對不得推斷/發明/誇大。每個欄位用詞盡量用報告原句片語。報告沒寫的填 null/空陣列。**

只輸出 JSON:
{
  "archetype": "命格原型/封號(報告命格名片有寫的、如「太陽之火」,否則 null)",
  "oneLiner": "報告對此人的一句話核心定位(用報告原句、否則 null)",
  "talentsTop3": ["報告明確指出的天賦/優勢、最多3、每條用報告原文關鍵片語"],
  "risksTop3": ["報告明確指出的課題/風險、最多3、每條用報告原文關鍵片語"]
}

報告全文:
${reportContent.slice(0, 48000)}`
  try {
    const ctrl = new AbortController()
    const to = setTimeout(() => ctrl.abort(), timeoutMs)
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', {
      method: 'POST',
      headers: { 'x-goog-api-key': GK, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: 'application/json' } }),
      signal: ctrl.signal,
    })
    clearTimeout(to)
    const j = await r.json()
    const t = j?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).filter(Boolean).join('')
    if (!t) return null
    const parsed = JSON.parse(t)
    // 防呆:至少要有 archetype 或 talents、否則視為無效
    if (!parsed || (!parsed.archetype && !(parsed.talentsTop3 && parsed.talentsTop3.length))) return null
    return parsed as NarrativeSummary
  } catch (e) {
    console.error('extractNarrativeFromContent 失敗(不阻塞、narrative 略過):', e instanceof Error ? e.message : e)
    return null
  }
}
