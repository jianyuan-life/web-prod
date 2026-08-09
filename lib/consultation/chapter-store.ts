import { createServiceClient } from '../supabase.ts'
import type { NormalizedConsultationChapter } from './chapter-assembly.ts'

export type ConsultationChapterDraftStore = {
  load: (reportId: `report:${string}`) => Promise<unknown[]>
  save: (reportId: `report:${string}`, draft: NormalizedConsultationChapter) => Promise<void>
}

export function createSupabaseConsultationChapterDraftStore(): ConsultationChapterDraftStore {
  const client = createServiceClient()
  return {
    async load(reportId) {
      const { data, error } = await client
        .from('consultation_chapter_drafts')
        .select('draft')
        .eq('report_id', reportId)
      if (error) throw new Error(`chapter draft load failed: ${error.message}`)
      return (data ?? []).map((row) => row.draft)
    },

    async save(reportId, draft) {
      const { error } = await client.rpc('save_consultation_chapter_draft', {
        p_report_id: reportId,
        p_idempotency_key: draft.receipt.idempotencyKey,
        p_input_hash: draft.receipt.inputHash,
        p_prompt_version_hash: draft.receipt.promptVersionHash,
        p_output_hash: draft.receipt.outputHash,
        p_draft: draft,
      })
      if (error) throw new Error(`chapter draft save failed: ${error.message}`)
    },
  }
}
