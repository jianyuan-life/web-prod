import type {
  CheckoutFormState as LegacyCheckoutFormState,
  G15SearchResult as LegacyG15SearchResult,
} from '@/components/checkout/types'
import type { ConsultationRelationshipStatus } from '@/lib/checkout/consultation-input-contract'

export type ConsultationCheckoutFormState = Omit<LegacyCheckoutFormState, 'marital_status'> & {
  marital_status: ConsultationRelationshipStatus | 'unmarried'
  guardian_name: string
  guardian_relationship: string
  guardian_consent: boolean
  birthLocationPrecision: '' | 'city'
}

export type ConsultationG15SearchResult = LegacyG15SearchResult & {
  eligible?: boolean
  reasonCode?: string
  reason?: string | null
  eligibilityReason?: string
}

export type G15ConsentDisplayStatus = 'not_invited' | 'pending' | 'accepted' | 'revoked' | 'expired'

export interface G15ConsentMemberState {
  reportId: string
  name: string
  email: string
  status: G15ConsentDisplayStatus
  acceptedAt?: string | null
  revokedAt?: string | null
}
