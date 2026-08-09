import {
  BIRTH_TIME_DEPENDENT_SYSTEMS,
  CALCULATOR_SYSTEM_EVIDENCE_CLASS,
  EXPECTED_CALCULATOR_SYSTEMS,
  type CalculatorAnalysis,
} from './calculator-facts.ts'

type ConsultationCalculatorResult = {
  systems_count?: unknown
  client_data?: unknown
  analyses?: unknown
  partial_failures?: unknown
  failed_systems?: unknown
  success?: unknown
  error?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasEntries(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : isRecord(value) ? Object.keys(value).length > 0 : Boolean(value)
}

export function assertCompleteConsultationCalculatorResult(
  value: unknown,
): asserts value is ConsultationCalculatorResult & {
  systems_count: number
  client_data: Record<string, unknown>
  analyses: CalculatorAnalysis[]
} {
  if (!isRecord(value)) throw new Error('排盤回應格式不正確')
  if (value.success === false || hasEntries(value.error)) {
    throw new Error('排盤服務回報失敗，報告已停止生成')
  }
  if (hasEntries(value.partial_failures) || hasEntries(value.failed_systems)) {
    throw new Error('排盤有部分失敗，報告已停止生成')
  }
  if (value.systems_count !== EXPECTED_CALCULATOR_SYSTEMS.length) {
    throw new Error(`排盤必須回傳完整 ${EXPECTED_CALCULATOR_SYSTEMS.length} 套系統`)
  }
  if (!isRecord(value.client_data) || Object.keys(value.client_data).length === 0) {
    throw new Error('排盤客戶核心資料缺失')
  }
  if (!Array.isArray(value.analyses) || value.analyses.length !== EXPECTED_CALCULATOR_SYSTEMS.length) {
    throw new Error(`排盤分析必須恰有 ${EXPECTED_CALCULATOR_SYSTEMS.length} 套系統`)
  }

  const seen = new Set<string>()
  for (const [index, rawAnalysis] of value.analyses.entries()) {
    if (!isRecord(rawAnalysis)) throw new Error(`第 ${index + 1} 套排盤格式不正確`)
    const system = typeof rawAnalysis.system === 'string' ? rawAnalysis.system.trim() : ''
    if (!EXPECTED_CALCULATOR_SYSTEMS.includes(system as (typeof EXPECTED_CALCULATOR_SYSTEMS)[number])) {
      throw new Error(`排盤包含不支援或缺少的系統：${system || `#${index + 1}`}`)
    }
    if (seen.has(system)) throw new Error(`排盤系統重複：${system}`)
    seen.add(system)
    if (rawAnalysis.success === false || hasEntries(rawAnalysis.error)) {
      throw new Error(`${system} 排盤失敗，報告已停止生成`)
    }
    if (typeof rawAnalysis.score !== 'number' || !Number.isFinite(rawAnalysis.score)) {
      throw new Error(`${system} 缺少可驗證的分析結果`)
    }
  }

  const missing = EXPECTED_CALCULATOR_SYSTEMS.filter((system) => !seen.has(system))
  if (missing.length > 0) throw new Error(`排盤缺少系統：${missing.join('、')}`)
}

export function consultationCalculatorEvidenceForGeneration<
  T extends ConsultationCalculatorResult,
>(
  result: T,
  birthData: unknown,
): T & { analyses: CalculatorAnalysis[]; client_data: Record<string, unknown> } {
  assertCompleteConsultationCalculatorResult(result)
  const timeUnknown = isRecord(birthData) && birthData.time_unknown === true
  const analyses = result.analyses.filter((analysis) => {
    const system = typeof analysis.system === 'string' ? analysis.system : ''
    if (CALCULATOR_SYSTEM_EVIDENCE_CLASS[system as keyof typeof CALCULATOR_SYSTEM_EVIDENCE_CLASS] === 'held') {
      return false
    }
    return !timeUnknown || !BIRTH_TIME_DEPENDENT_SYSTEMS.has(system)
  })

  const clientData = timeUnknown
    ? {
        name: result.client_data.name,
        gender: result.client_data.gender,
        birth_date: result.client_data.birth_date,
        calendar_type: result.client_data.calendar_type,
        time_unknown: true,
      }
    : { ...result.client_data }

  return {
    ...result,
    analyses,
    client_data: clientData,
  } as T & { analyses: CalculatorAnalysis[]; client_data: Record<string, unknown> }
}
