export const G15_CONTEXT_MIN_LENGTH = 8
export const G15_CONTEXT_MAX_LENGTH = 1200
export const G15_CONTEXT_MAX_ENTRIES = 8

export type G15ConsultationContext = {
  statedRelationships: string[]
  consultationGoals: string[]
}

export type G15ConsultationContextValidation =
  | { ok: true; context: G15ConsultationContext }
  | { ok: false; message: string }

const INSTRUCTION_INJECTION_PATTERN = /(?:忽略(?:前面|先前|上述).{0,20}(?:指示|規則).{0,20}(?:改寫|輸出|揭露).{0,20}(?:系統|提示)|(?:system|developer|assistant)\s*(?:prompt|message)|jailbreak|越獄提示)/iu

function normalizeEntries(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > G15_CONTEXT_MAX_ENTRIES) return null
  const normalized: string[] = []
  for (const entry of value) {
    if (typeof entry !== 'string') return null
    const text = entry
      .normalize('NFC')
      .replace(/[\u0000-\u001f\u007f-\u009f]+/gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
    if (
      text.length < G15_CONTEXT_MIN_LENGTH ||
      text.length > G15_CONTEXT_MAX_LENGTH ||
      INSTRUCTION_INJECTION_PATTERN.test(text)
    ) return null
    normalized.push(text)
  }
  return [...new Set(normalized)]
}

export function validateG15ConsultationContext(value: unknown): G15ConsultationContextValidation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: '請填寫家庭關係與本次最想處理的問題' }
  }

  const input = value as Record<string, unknown>
  const statedRelationships = normalizeEntries(input.stated_relationships)
  const consultationGoals = normalizeEntries(input.consultation_goals)
  if (!statedRelationships || !consultationGoals) {
    return {
      ok: false,
      message: `家庭關係與諮詢目標每項需為 ${G15_CONTEXT_MIN_LENGTH}-${G15_CONTEXT_MAX_LENGTH} 字，且不得包含要求系統改寫規則的指令`,
    }
  }

  return {
    ok: true,
    context: { statedRelationships, consultationGoals },
  }
}
