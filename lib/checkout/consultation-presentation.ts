export type ConsultationCheckoutPlan = 'C' | 'G15'

const CONSULTATION_CHECKOUT_PLANS = new Set<ConsultationCheckoutPlan>(['C', 'G15'])

export function isConsultationCheckoutPlan(planCode: string): planCode is ConsultationCheckoutPlan {
  return CONSULTATION_CHECKOUT_PLANS.has(planCode as ConsultationCheckoutPlan)
}
