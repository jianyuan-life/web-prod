import type { SupabaseClient } from '@supabase/supabase-js'

import { G15_SELECTION_COLUMNS } from './prepare-checkout-birth-data.ts'
import {
  G15_CONSENT_RECEIPT_COLUMNS,
  G15_CONSENT_SELECTION_COLUMNS,
  hashG15ConsentReportIds,
  validateG15PersistedConsentAuthority,
} from './g15-independent-consent.ts'
import { validateG15Selection, type G15SelectionReportRow } from './validate-g15-selection.ts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizedUuid(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

/**
 * Re-checks the durable G15 order binding immediately before workflow start.
 * A checkout snapshot is only a locator: consumed selection, receipts and live
 * C-report owners in PostgreSQL are the authority.
 */
export async function verifyG15ConsumedOrderBinding(input: {
  supabase: SupabaseClient
  reportId: unknown
  stripeSessionId: unknown
  purchaserUserId: unknown
  birthData: unknown
}): Promise<boolean> {
  const reportId = normalizedUuid(input.reportId)
  const purchaserUserId = normalizedUuid(input.purchaserUserId)
  const stripeSessionId = typeof input.stripeSessionId === 'string' ? input.stripeSessionId.trim() : ''
  if (
    !UUID_PATTERN.test(reportId)
    || !UUID_PATTERN.test(purchaserUserId)
    || !/^cs_(test|live)_[A-Za-z0-9_]{10,220}$/u.test(stripeSessionId)
    || !isRecord(input.birthData)
  ) return false

  const selectionId = normalizedUuid(input.birthData.consent_selection_id)
  const requestedReportIds = Array.isArray(input.birthData.report_ids)
    ? input.birthData.report_ids.map(normalizedUuid)
    : []
  const persisted = validateG15PersistedConsentAuthority({
    authority: input.birthData.consent_authority,
    selectionId,
    reportIds: requestedReportIds,
  })
  if (!persisted.ok) return false

  const selectionResult = await input.supabase
    .from('g15_consent_selections')
    .select(G15_CONSENT_SELECTION_COLUMNS)
    .eq('id', selectionId)
    .eq('purchaser_user_id', purchaserUserId)
    .eq('consumed_stripe_session_id', stripeSessionId)
    .eq('consumed_report_id', reportId)
    .maybeSingle()
  if (selectionResult.error || !isRecord(selectionResult.data)) return false
  const selection = selectionResult.data
  const selectedReportIds = Array.isArray(selection.selected_report_ids)
    ? selection.selected_report_ids.map(normalizedUuid)
    : []
  if (
    !selection.consumed_at
    || selection.superseded_at !== null
    || selectedReportIds.length !== requestedReportIds.length
    || JSON.stringify([...selectedReportIds].sort()) !== JSON.stringify([...requestedReportIds].sort())
    || selection.selected_report_ids_hash !== hashG15ConsentReportIds(selectedReportIds)
    || selection.policy_version !== persisted.authority.policy_version
    || selection.purpose !== persisted.authority.purpose
    || selection.sharing_scope !== persisted.authority.sharing_scope
  ) return false

  const receiptsResult = await input.supabase
    .from('g15_consent_receipts')
    .select(G15_CONSENT_RECEIPT_COLUMNS)
    .eq('selection_id', selectionId)
  if (receiptsResult.error || !Array.isArray(receiptsResult.data)) return false
  const receipts = receiptsResult.data.filter(isRecord)
  if (receipts.length !== selectedReportIds.length) return false
  const receiptByReport = new Map(receipts.map((receipt) => [normalizedUuid(receipt.subject_report_id), receipt]))
  const expectedSubjects = persisted.authority.subject_user_ids_by_report
  for (const selectedReportId of selectedReportIds) {
    const receipt = receiptByReport.get(selectedReportId)
    if (
      !receipt
      || receipt.status !== 'accepted'
      || receipt.revoked_at !== null
      || receipt.accept_token_hash !== null
      || typeof receipt.revoke_token_hash !== 'string'
      || receipt.accepted_at !== persisted.authority.accepted_at_by_report[selectedReportId]
      || normalizedUuid(receipt.subject_user_id) !== expectedSubjects[selectedReportId]
    ) return false
  }

  const reportsResult = await input.supabase
    .from('paid_reports')
    .select(G15_SELECTION_COLUMNS)
    .in('id', selectedReportIds)
  const selectionValidation = await validateG15Selection({
    selectedReportIds,
    auth: { userId: purchaserUserId },
    ownershipMode: 'independent-subjects',
    queryReports: async () => ({
      data: (reportsResult.data ?? []) as unknown as G15SelectionReportRow[],
      error: reportsResult.error,
    }),
  })
  if (!selectionValidation.ok) return false
  return selectionValidation.reportIds.every((selectedReportId, index) => (
    expectedSubjects[selectedReportId] === selectionValidation.subjectUserIds[index]
  ))
}
