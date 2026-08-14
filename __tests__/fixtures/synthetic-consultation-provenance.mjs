import { createHash } from 'node:crypto'

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function calculationCommit(runtimeBundle) {
  return runtimeBundle.match(/(?:^|\|)git=([0-9a-f]{40})(?:\||$)/u)?.[1] ??
    runtimeBundle.match(/^git:([0-9a-f]{40})$/u)?.[1] ??
    'c'.repeat(40)
}

export function attachSyntheticConsultationProvenance(envelope) {
  const systems = envelope.response.analyses.map((analysis, index) => ({
    system: analysis.system,
    rule_id: `JY-STRICT-SYNTHETIC-${String(index + 1).padStart(2, '0')}`,
    school: analysis.system === '八字四柱'
      ? envelope.requestPayload.bazi_school
      : analysis.system === '吠陀占星'
        ? `${envelope.requestPayload.ayanamsa_type}_only`
        : 'production_variant_unverified',
    source_edition: analysis.system === '九星氣學' ? null : 'synthetic-test-edition',
    source_locator: analysis.system === '九星氣學' ? null : `synthetic-test-locator-${index}`,
    source_evidence_sha256: analysis.system === '九星氣學' ? null : String(index + 1).padStart(64, '0'),
    verification_status: analysis.system === '九星氣學' ? 'UNVERIFIED' : 'VERIFIED',
    public_offer_role: analysis.system === '九星氣學'
      ? 'supplementary_not_in_public_14'
      : 'core_public_14',
    delivery_policy: analysis.system === '九星氣學'
      ? 'hold'
      : 'deliver',
    implementation_locator: `calculators/synthetic_${index}.py`,
    claim_authority_scope: analysis.system === '九星氣學'
      ? 'none_until_verified'
      : analysis.system === '古典占星'
        ? 'strict_classical_claims_after_exclusion'
        : 'system_only',
    claim_authority_excludes: analysis.system === '古典占星' ? ['九星氣學'] : [],
    calculation_commit: calculationCommit(envelope.calculatorBundleVersion),
    runtime_bundle: envelope.calculatorBundleVersion,
  }))
  const registry = {
    schema_version: 'jianyuan.provenance.registry.v1',
    definition_sha256: '1'.repeat(64),
    technical_slot_count: 15,
    public_offer_system_count: 14,
    count_semantics: 'inventory_only_not_correctness_evidence',
    systems,
  }
  envelope.response.provenance_registry = registry
  envelope.response.provenance_registry_sha256 = createHash('sha256')
    .update(canonicalJson(registry), 'utf8')
    .digest('hex')
  envelope.response.analyses = envelope.response.analyses.map((analysis) => ({
    ...analysis,
    provenance: structuredClone(systems.find((entry) => entry.system === analysis.system)),
  }))
  const successfulSlots = envelope.response.analyses
    .filter((analysis) => analysis.status === 'success').length
  const heldSlots = envelope.response.analyses
    .filter((analysis) => analysis.status === 'held').length
  const failedSlots = envelope.response.analyses
    .filter((analysis) => analysis.status === 'failed').length
  envelope.response.coverage = {
    expected_slots: 15,
    covered_slots: envelope.response.analyses.length,
    successful_slots: successfulSlots,
    held_slots: heldSlots,
    failed_slots: failedSlots,
    is_complete: envelope.response.analyses.length === 15 && failedSlots === 0,
  }
  return envelope
}

export function refreshSyntheticCoverage(envelope) {
  const analyses = envelope.response.analyses
  envelope.response.coverage = {
    expected_slots: 15,
    covered_slots: analyses.length,
    successful_slots: analyses.filter((analysis) => analysis.status === 'success').length,
    held_slots: analyses.filter((analysis) => analysis.status === 'held').length,
    failed_slots: analyses.filter((analysis) => analysis.status === 'failed').length,
    is_complete: analyses.length === 15 &&
      analyses.every((analysis) => analysis.status !== 'failed'),
  }
  return envelope
}
