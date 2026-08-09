import { createServiceClient } from '../supabase.ts'
import type { ConsultationCostLedger } from './cost-policy.ts'

export type ConsultationCostLedgerStore = {
  load: (reportId: `report:${string}`) => Promise<{ ledger: unknown | null; version: number }>
  save: (input: {
    reportId: `report:${string}`
    ledger: ConsultationCostLedger
    expectedVersion: number
  }) => Promise<{ version: number }>
}

export function createSupabaseConsultationCostLedgerStore(): ConsultationCostLedgerStore {
  const client = createServiceClient()
  return {
    async load(reportId) {
      const { data, error } = await client
        .from('consultation_cost_ledgers')
        .select('ledger, version')
        .eq('report_id', reportId)
        .maybeSingle()
      if (error) throw new Error(`cost ledger load failed: ${error.message}`)
      if (!data) return { ledger: null, version: 0 }
      const version = Number(data.version)
      if (!Number.isSafeInteger(version) || version < 1) throw new Error('cost ledger version invalid')
      return { ledger: data.ledger, version }
    },

    async save({ reportId, ledger, expectedVersion }) {
      const { data, error } = await client.rpc('cas_consultation_cost_ledger', {
        p_report_id: reportId,
        p_plan: ledger.plan,
        p_policy_version: ledger.policyVersion,
        p_ledger: ledger,
        p_expected_version: expectedVersion,
      })
      if (error) throw new Error(`cost ledger CAS failed: ${error.message}`)
      const version = Number(data)
      if (!Number.isSafeInteger(version) || version <= expectedVersion) {
        throw new Error('cost ledger CAS returned invalid version')
      }
      return { version }
    },
  }
}
