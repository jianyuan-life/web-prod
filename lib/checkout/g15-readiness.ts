export type G15CheckoutReadinessInput = {
  selectedCount: number
  relationshipContext: string
  consultationGoals: string
  allMembersAccepted: boolean
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
  if (!input.allMembersAccepted) {
    blockers.push('請寄出逐位同意邀請，並等待每位成年成員完成同意。')
  }
  return blockers
}
