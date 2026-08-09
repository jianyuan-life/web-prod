import { READING_LAYER_ORDER } from '../../../lib/consultation/report-contract.ts'
import type {
  ConsultationReportContract,
  EvidenceAppendixEntry,
  ReportAgeContext,
  ReportParagraph,
} from '../../../lib/consultation/report-contract'
import type { ConsultationReportLoadResult } from '../../../lib/consultation/load-report'

type ReadyLoadResult = Extract<ConsultationReportLoadResult, { ok: true }>

export type LegacyDocumentBlock = {
  id: string
  kind: 'heading' | 'paragraph' | 'list' | 'quote' | 'code' | 'rule'
  text: string
  level?: number
  ordered?: boolean
  items?: string[]
}

export type LegacyDocument = {
  headings: Array<{ id: string; text: string; level: number }>
  blocks: LegacyDocumentBlock[]
}

export type ReaderPerson = {
  personId: string
  displayName: string
  relationshipLabel: '受談者' | '成員'
  birthTime: {
    status: 'exact' | 'unknown'
    confidence: 'standard' | 'reduced'
    affectedSystems: string[]
  }
  age: null | {
    ageYears: number
    stage: ReportAgeContext['stage']
    readerMode: ReportAgeContext['readerMode']
    timeHorizonEndAge: number | null
  }
}

export type ReaderEvidence = {
  evidenceId: string
  label: string
  type: EvidenceAppendixEntry['type']
  limitations: string[]
  sourceTitles: string[]
  applicability: string[]
  invalidation: string[]
  evidenceStatuses: ConsultationReportContract['claimLedger']['entries'][number]['evidenceStatus'][]
  supportingSystems: string[]
  opposingSystems: string[]
}

export type StructuredReaderModel = {
  mode: 'structured'
  plan: 'C' | 'G15'
  title: string
  asOfDate: string
  rendererBindingHash: string
  layerOrder: readonly ['quick_30s', 'route_3m', 'deep_read', 'evidence_appendix']
  quickItems: ConsultationReportContract['readingLayers']['quick_30s']['items']
  routeItems: Array<{
    chapterId: string
    targetId: string
    title: string
    conclusionSubtitle: string
    readingLoad: 'brief' | 'focused' | 'deep'
  }>
  chapters: Array<{
    chapterId: string
    targetId: string
    title: string
    conclusionSubtitle: string
    paragraphs: ReportParagraph[]
  }>
  evidence: ReaderEvidence[]
  sources: ConsultationReportContract['sourceManifest']
  people: ReaderPerson[]
}

export type LegacyReaderModel = {
  mode: 'legacy_full_text'
  plan: 'C' | 'G15'
  title: string
  asOfDate: null
  layerOrder: readonly ['quick_30s', 'route_3m', 'deep_read', 'evidence_appendix']
  quickItems: never[]
  routeItems: Array<{ targetId: string; title: string }>
  chapters: never[]
  evidence: never[]
  sources: Array<{ title: '已保存的舊版報告原文'; source: 'paid_reports' }>
  people: never[]
  document: LegacyDocument
  legacyNotice: {
    summaryAvailable: false
    ageContextAvailable: false
    factLedgerAvailable: false
  }
}

export type ConsultationReaderModel = StructuredReaderModel | LegacyReaderModel

function flushParagraph(
  blocks: LegacyDocumentBlock[],
  paragraphLines: string[],
  nextId: () => string,
): void {
  if (paragraphLines.length === 0) return
  blocks.push({
    id: nextId(),
    kind: 'paragraph',
    text: paragraphLines.join('\n').trim(),
  })
  paragraphLines.length = 0
}

export function buildLegacyDocument(content: string): LegacyDocument {
  const lines = content.replace(/\r\n?/gu, '\n').split('\n')
  const headings: LegacyDocument['headings'] = []
  const blocks: LegacyDocumentBlock[] = []
  const paragraphLines: string[] = []
  let blockIndex = 0
  let inCode = false
  let codeLines: string[] = []
  const nextId = () => `legacy-block-${++blockIndex}`

  for (const line of lines) {
    if (/^\s*```/u.test(line)) {
      flushParagraph(blocks, paragraphLines, nextId)
      if (inCode) {
        blocks.push({ id: nextId(), kind: 'code', text: codeLines.join('\n') })
        codeLines = []
      }
      inCode = !inCode
      continue
    }
    if (inCode) {
      codeLines.push(line)
      continue
    }

    const heading = /^(#{1,6})\s+(.+?)\s*$/u.exec(line)
    if (heading) {
      flushParagraph(blocks, paragraphLines, nextId)
      const id = `legacy-section-${headings.length + 1}`
      const entry = { id, text: heading[2], level: heading[1].length }
      headings.push(entry)
      blocks.push({ id, kind: 'heading', text: entry.text, level: entry.level })
      continue
    }

    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line)) {
      flushParagraph(blocks, paragraphLines, nextId)
      blocks.push({ id: nextId(), kind: 'rule', text: '' })
      continue
    }

    const unorderedItem = /^\s*[-*+]\s+(.+)$/u.exec(line)
    const orderedItem = /^\s*\d+[.)]\s+(.+)$/u.exec(line)
    if (unorderedItem || orderedItem) {
      flushParagraph(blocks, paragraphLines, nextId)
      const itemText = (unorderedItem ?? orderedItem)![1]
      const ordered = Boolean(orderedItem)
      const previous = blocks.at(-1)
      if (previous?.kind === 'list' && previous.ordered === ordered) {
        previous.items!.push(itemText)
        previous.text = previous.items!.join('\n')
      } else {
        blocks.push({
          id: nextId(),
          kind: 'list',
          text: itemText,
          items: [itemText],
          ordered,
        })
      }
      continue
    }

    const quote = /^\s*>\s?(.*)$/u.exec(line)
    if (quote) {
      flushParagraph(blocks, paragraphLines, nextId)
      blocks.push({ id: nextId(), kind: 'quote', text: quote[1] })
      continue
    }

    if (line.trim().length === 0) {
      flushParagraph(blocks, paragraphLines, nextId)
      continue
    }
    paragraphLines.push(line)
  }

  if (inCode && codeLines.length > 0) {
    blocks.push({ id: nextId(), kind: 'code', text: codeLines.join('\n') })
  }
  flushParagraph(blocks, paragraphLines, nextId)
  return { headings, blocks }
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function buildEvidence(
  report: ConsultationReportContract,
  entry: EvidenceAppendixEntry,
): ReaderEvidence {
  const claimById = new Map(report.claimLedger.entries.map((claim) => [claim.claimId, claim]))
  const sourceById = new Map(report.sourceManifest.map((source) => [source.sourceId, source]))
  const claims = entry.claimIds
    .map((claimId) => claimById.get(claimId))
    .filter((claim): claim is NonNullable<typeof claim> => Boolean(claim))

  return {
    evidenceId: entry.evidenceId,
    label: entry.label,
    type: entry.type,
    limitations: [...entry.limitations],
    sourceTitles: entry.sourceIds
      .map((sourceId) => sourceById.get(sourceId)?.title)
      .filter((title): title is string => Boolean(title)),
    applicability: unique(claims.map((claim) => claim.applicability)),
    invalidation: unique(claims.map((claim) => claim.invalidation)),
    evidenceStatuses: unique(claims.map((claim) => claim.evidenceStatus)) as ReaderEvidence['evidenceStatuses'],
    supportingSystems: unique(claims.flatMap((claim) => claim.supportingSystemIds)),
    opposingSystems: unique(claims.flatMap((claim) => claim.opposingSystemIds)),
  }
}

export function buildConsultationReaderModel(
  loaded: ReadyLoadResult,
): ConsultationReaderModel {
  const title = loaded.plan === 'C' ? '人生藍圖' : '家族藍圖'
  if (loaded.mode === 'legacy_full_text') {
    const document = buildLegacyDocument(loaded.content)
    return {
      mode: 'legacy_full_text',
      plan: loaded.plan,
      title,
      asOfDate: null,
      layerOrder: READING_LAYER_ORDER,
      quickItems: [],
      routeItems: document.headings.map((heading) => ({
        targetId: heading.id,
        title: heading.text,
      })),
      chapters: [],
      evidence: [],
      sources: [{ title: '已保存的舊版報告原文', source: 'paid_reports' }],
      people: [],
      document,
      legacyNotice: {
        summaryAvailable: false,
        ageContextAvailable: false,
        factLedgerAvailable: false,
      },
    }
  }

  const report = loaded.report
  const paragraphById = new Map(report.paragraphs.map((paragraph) => [paragraph.paragraphId, paragraph]))
  const chapterById = new Map(report.chapters.map((chapter) => [chapter.chapterId, chapter]))
  const chapterTargetById = new Map(
    report.chapters.map((chapter, index) => [chapter.chapterId, `report-chapter-${index + 1}`]),
  )
  const ageByPersonId = new Map(report.ageContexts.map((age) => [age.personId, age]))
  const relationshipLabel = loaded.plan === 'C' ? '受談者' as const : '成員' as const
  const people = report.people.map((person): ReaderPerson => {
    const age = ageByPersonId.get(person.personId)
    return {
      personId: person.personId,
      displayName: person.displayName,
      relationshipLabel,
      birthTime: {
        status: person.birthTime.status,
        confidence: person.birthTime.confidence,
        affectedSystems: [...person.birthTime.affectedSystems],
      },
      age: age
        ? {
            ageYears: age.ageYears,
            stage: age.stage,
            readerMode: age.readerMode,
            timeHorizonEndAge: age.timeHorizonEndAge,
          }
        : null,
    }
  })

  const routeItems = report.readingLayers.route_3m.chapters.flatMap((route) => {
    const chapter = chapterById.get(route.chapterId)
    if (!chapter) return []
    return [{
      chapterId: chapter.chapterId,
      targetId: chapterTargetById.get(chapter.chapterId)!,
      title: chapter.title,
      conclusionSubtitle: route.conclusionSubtitle,
      readingLoad: route.readingLoad,
    }]
  })
  const chapters = report.readingLayers.deep_read.chapterIds.flatMap((chapterId) => {
    const chapter = chapterById.get(chapterId)
    if (!chapter) return []
    return [{
      chapterId: chapter.chapterId,
      targetId: chapterTargetById.get(chapter.chapterId)!,
      title: chapter.title,
      conclusionSubtitle: chapter.conclusionSubtitle,
      paragraphs: chapter.paragraphIds
        .map((paragraphId) => paragraphById.get(paragraphId))
        .filter((paragraph): paragraph is ReportParagraph => Boolean(paragraph)),
    }]
  })

  return {
    mode: 'structured',
    plan: loaded.plan,
    title,
    asOfDate: report.asOfDate,
    rendererBindingHash: report.rendererBinding?.contentHash ?? '',
    layerOrder: READING_LAYER_ORDER,
    quickItems: report.readingLayers.quick_30s.items,
    routeItems,
    chapters,
    evidence: report.readingLayers.evidence_appendix.entries.map((entry) =>
      buildEvidence(report, entry)),
    sources: report.sourceManifest,
    people,
  }
}
