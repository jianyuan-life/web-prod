import { shouldUseConsultationReportV1 } from './runtime-config.ts'

export type ConsultationFallbackDecision =
  | { mode: 'legacy_allowed' }
  | { mode: 'workflow_only'; plan: 'C' | 'G15'; reason: string }

export function consultationFallbackDecision(
  planCode: string,
  birthData: { plan_type?: unknown } | null | undefined,
  environment: Record<string, string | undefined> = process.env,
): ConsultationFallbackDecision {
  if (planCode === 'C' && shouldUseConsultationReportV1('C', environment)) {
    return {
      mode: 'workflow_only',
      plan: 'C',
      reason: 'C consultation v1 必須由 durable workflow 生成，不得降級成交付舊報告',
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
