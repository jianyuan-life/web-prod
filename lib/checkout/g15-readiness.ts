export type G15CheckoutReadinessInput = {
  selectedCount: number
  relationshipContext: string
  consultationGoals: string
  consentAccepted: boolean
}

export function getG15CheckoutBlockers(input: G15CheckoutReadinessInput): string[] {
  const blockers: string[] = []
  if (input.selectedCount < 2) blockers.push('請至少選擇 2 位家庭成員。')
  if (input.relationshipContext.trim().length < 8) {
    blockers.push('請至少用 8 個字描述成員之間的關係。')
  }
  if (input.consultationGoals.trim().length < 8) {
    blockers.push('請至少用 8 個字描述這次最想理解或改善的事。')
  }
  if (!input.consentAccepted) blockers.push('請確認已取得每位成員的資料使用同意。')
  return blockers
}
