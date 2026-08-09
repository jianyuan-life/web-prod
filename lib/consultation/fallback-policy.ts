export type ConsultationFallbackDecision =
  | { mode: 'legacy_allowed' }
  | { mode: 'workflow_only'; plan: 'C' | 'G15'; reason: string }

export function consultationFallbackDecision(
  planCode: string,
  birthData: { plan_type?: unknown } | null | undefined,
  _environment: Record<string, string | undefined> = process.env,
): ConsultationFallbackDecision {
  if (planCode === 'C') {
    return {
      mode: 'workflow_only',
      plan: 'C',
      reason: 'C 人生藍圖必須由可重試的完整工作流生成，不得降級為簡化備援報告',
    }
  }
  if (
    planCode === 'G15' &&
    (birthData?.plan_type === 'family_email' || birthData?.plan_type === 'family_reports')
  ) {
    return {
      mode: 'workflow_only',
      plan: 'G15',
      reason: 'G15 家族藍圖必須由 durable workflow 生成',
    }
  }
  return { mode: 'legacy_allowed' }
}
