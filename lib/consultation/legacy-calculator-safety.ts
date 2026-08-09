import {
  BIRTH_TIME_DEPENDENT_SYSTEMS,
  CALCULATOR_SYSTEM_EVIDENCE_CLASS,
  EXPECTED_CALCULATOR_SYSTEMS,
  isCalculatorAnalysisFailure,
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
    if (isCalculatorAnalysisFailure(rawAnalysis)) {
      throw new Error(`${system} 排盤失敗，報告已停止生成`)
    }
    if (typeof rawAnalysis.score !== 'number' || !Number.isFinite(rawAnalysis.score)) {
      throw new Error(`${system} 缺少可驗證的分析結果`)
    }
  }

  const missing = EXPECTED_CALCULATOR_SYSTEMS.filter((system) => !seen.has(system))
  if (missing.length > 0) throw new Error(`排盤缺少系統：${missing.join('、')}`)
}

// ---------------------------------------------------------------------------
// D／R／legacy G15 的窄型失敗閘
// ---------------------------------------------------------------------------
//
// 上面那個 15 槽斷言只對 C 成立。獨立盤點的結果:D 取 5–8 套、R 取 8 套、
// legacy G15 的 canonical family 路徑不重算,對它們要求 15 槽會把正常請求擋掉。
//
// 這裡只問一件事:回應裡有沒有失敗標記。沒有就放行,不管幾套。
//
// E1–E4 明確排除。它們與 D／R／G15 共用同一個 callPythonCalculate,所以排除
// 必須是白名單判斷,不能寫成「C 以外都套」—— E3 是凍結契約,一個 byte 都不能動。
//
// 擋的是 Fly 唯讀驗算實際看到的形狀:HTTP 200、systems_count=15、沒有
// partial_failures、沒有 failed_systems、success 不是 false、連 error 欄位都沒有,
// 只有某一套的 detail 寫著「計算異常：'planet_name'」。只檢查 success 與 error
// 會整個漏掉,這正是那份報告特別點名的漏接。
export const LEGACY_FAILURE_GATE_PLANS: ReadonlySet<string> = new Set(['D', 'R', 'G15'])

export function assertNoLegacyCalculatorFailureMarkers(
  value: unknown,
  planCode: string,
): void {
  if (!LEGACY_FAILURE_GATE_PLANS.has(planCode)) return

  if (!isRecord(value)) throw new Error('排盤回應格式不正確')
  if (value.success === false || hasEntries(value.error)) {
    throw new Error('排盤服務回報失敗，報告已停止生成')
  }
  if (hasEntries(value.partial_failures) || hasEntries(value.failed_systems)) {
    throw new Error('排盤有部分失敗，報告已停止生成')
  }
  if (!isRecord(value.client_data) || Object.keys(value.client_data).length === 0) {
    throw new Error('排盤客戶核心資料缺失')
  }
  if (!Array.isArray(value.analyses) || value.analyses.length === 0) {
    throw new Error('排盤回傳空結果')
  }

  for (const [index, rawAnalysis] of value.analyses.entries()) {
    if (!isRecord(rawAnalysis)) throw new Error(`第 ${index + 1} 套排盤格式不正確`)
    if (!isCalculatorAnalysisFailure(rawAnalysis)) continue
    const system = typeof rawAnalysis.system === 'string' && rawAnalysis.system.trim()
      ? rawAnalysis.system.trim()
      : `第 ${index + 1} 套`
    // 指名是哪一套,但不要把內部例外字串(如 'planet_name')轉進呼叫端訊息。
    throw new Error(`${system} 排盤失敗，報告已停止生成`)
  }
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
