export const CONSULTATION_RELATIONSHIP_STATUSES = [
  'single',
  'partnered',
  'married',
  'separated',
  'divorced',
  'widowed',
  'not_applicable',
  'prefer_not_to_say',
] as const

export type ConsultationRelationshipStatus =
  typeof CONSULTATION_RELATIONSHIP_STATUSES[number]

export interface ConsultationRelationshipContext {
  status: ConsultationRelationshipStatus
  label: string
  promptInstruction: string
}

const STATUS_SET = new Set<string>(CONSULTATION_RELATIONSHIP_STATUSES)

/**
 * Accepts only explicit checkout status tokens. Substring matching is
 * intentionally forbidden because `unmarried` contains `marri`.
 */
export function normalizeConsultationRelationshipStatus(
  value: unknown,
): ConsultationRelationshipStatus | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'unmarried') return 'single'
  return STATUS_SET.has(normalized)
    ? normalized as ConsultationRelationshipStatus
    : null
}

const RELATIONSHIP_CONTEXTS: Record<
  ConsultationRelationshipStatus,
  Omit<ConsultationRelationshipContext, 'status'>
> = {
  single: {
    label: '單身',
    promptInstruction: '【目前關係狀態：單身】只分析當事人的親密關係模式、需要與界線；不得假設正在交往、催婚，或預測何時必然遇到對象。若談未來關係，寫成可觀察的選擇條件，不寫必然事件。',
  },
  partnered: {
    label: '穩定交往或有伴侶',
    promptInstruction: '【目前關係狀態：穩定交往或有伴侶】可以討論現有互動、溝通、承諾與界線；不得稱對方為配偶或假設一定會結婚、分手。只能描述當事人這一端可核對的模式，不替伴侶判定內心。',
  },
  married: {
    label: '已婚',
    promptInstruction: '【目前關係狀態：已婚】聚焦婚姻中的溝通、分工、界線與共同生活；不得寫成尋找對象或催婚，也不得預測離婚、復合或婚姻成敗。伴侶的內在只能請當事人核對，不可代替對方下結論。',
  },
  separated: {
    label: '分居',
    promptInstruction: '【目前關係狀態：分居】以敏感、中性的語氣討論當下界線、溝通、安全感與可控選擇；不得假設會復合或離婚，不把責任歸給命盤，也不替另一方判定動機。',
  },
  divorced: {
    label: '離婚',
    promptInstruction: '【目前關係狀態：離婚】尊重既有經歷，不暗示這代表個人失敗或命定問題，也不預設想再婚。關係章可談可核對的互動模式、修復與未來界線，但不得預測下一段關係何時發生。',
  },
  widowed: {
    label: '喪偶',
    promptInstruction: '【目前關係狀態：喪偶】採哀傷知情且尊重的語氣；不得把失落歸因於命盤，不預測會出現「取代」伴侶的人，也不催促開始新關係。若內容碰到持續痛苦，只能溫和鼓勵尋求可信任的人或專業支持。',
  },
  not_applicable: {
    label: '不適用',
    promptInstruction: '【目前關係狀態：不適用】不寫戀愛、婚姻、配偶或桃花預測；把關係章轉為重要人際、界線、信任與支持網絡，並讓讀者自行核對哪些描述適用。',
  },
  prefer_not_to_say: {
    label: '不願回答',
    promptInstruction: '【目前關係狀態：不願回答】尊重讀者不回答，不推測其現況；全章使用中性稱呼，只談可由本人核對的關係需要、互動模式與界線，不寫配偶、單身或婚姻前提。',
  },
}

export function getConsultationRelationshipContext(
  value: unknown,
): ConsultationRelationshipContext | null {
  const status = normalizeConsultationRelationshipStatus(value)
  if (!status) return null
  return { status, ...RELATIONSHIP_CONTEXTS[status] }
}

export function buildConsultationRelationshipPrompt(value: unknown): string {
  return getConsultationRelationshipContext(value)?.promptInstruction
    ?? '【目前關係狀態：未提供有效狀態】輸入不完整；不得假設讀者單身、交往、已婚或想進入關係。只談可由本人核對的人際需要、互動模式與界線。'
}
