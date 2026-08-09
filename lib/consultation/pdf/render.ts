import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import PDFDocument from '@react-pdf/pdfkit'
import type {
  ConsultationPdfChapter,
  ConsultationPdfEvidence,
  ConsultationPdfModel,
} from './policy.ts'

export const CONSULTATION_PDF_FONT_SHA256 = 'dd7c5a343fb520359405b2dfa7988e954da2713507b9d8f56ff299c973e8ab4a'
export const MAX_RENDERED_PDF_BYTES = 20_000_000

const FONT_NAME = 'JianYuanNotoSansTC'
const FONT_PATH = fileURLToPath(new URL('./assets/NotoSansTC-Regular.woff2', import.meta.url))
const FONT_HASH = createHash('sha256').update(readFileSync(FONT_PATH)).digest('hex')

if (FONT_HASH !== CONSULTATION_PDF_FONT_SHA256) {
  throw new Error('Consultation PDF font asset integrity check failed')
}

// @react-pdf/renderer already ships this PDFKit fork. Using it directly avoids
// Yoga pagination edge cases and, unlike renderToBuffer, subsets the CJK font.

const PAGE = {
  width: 595.28,
  height: 841.89,
  left: 48,
  right: 48,
  top: 62,
  bottom: 58,
}

const CONTENT_WIDTH = PAGE.width - PAGE.left - PAGE.right

export const CONSULTATION_PDF_PALETTE = {
  paper: '#F2EEE5',
  paperDeep: '#E8E0D2',
  ink: '#292A28',
  inkSoft: '#5B5A55',
  inkMuted: '#656159',
  vermilion: '#9E4030',
  bronze: '#7B5928',
  bronzeSoft: '#C9B991',
  indigo: '#2F465C',
  sage: '#566650',
  white: '#FFFDF8',
} as const

const palette = CONSULTATION_PDF_PALETTE

const NO_LINE_START = new Set(Array.from('，。！？；：、）》」』】〉〕％‰°'))
const NO_LINE_END = new Set(Array.from('（《「『【〈〔'))

type PdfKitDocument = any

type TextStyle = {
  size: number
  color?: string
  lineHeight?: number
  characterSpacing?: number
}

type StructureTag = 'P' | 'H1' | 'H2' | 'H3' | 'H4'

type DrawWrappedOptions = TextStyle & {
  x?: number
  width?: number
  after?: number
  allowPageBreak?: boolean
  structureType?: StructureTag
}

class ConsultationPdfPainter {
  readonly doc: PdfKitDocument
  readonly model: ConsultationPdfModel
  private y = PAGE.top
  private pageKinds: Array<'cover' | 'body'> = []
  private readonly widthCache = new Map<string, number>()
  private readonly structureRoot: any

  constructor(doc: PdfKitDocument, model: ConsultationPdfModel) {
    this.doc = doc
    this.model = model
    this.structureRoot = this.doc.struct('Document', {
      title: `${model.planTitle} · ${model.people.join('／')}`,
      lang: 'zh-TW',
    })
    this.doc.addStructure(this.structureRoot)
  }

  private artifact(draw: () => void): void {
    this.doc.markContent('Artifact', { type: 'Layout' })
    try {
      draw()
    } finally {
      this.doc.endMarkedContent()
    }
  }

  private createStructure(type: StructureTag): any {
    const structure = this.doc.struct(type, { lang: 'zh-TW' })
    this.structureRoot.add(structure)
    return structure
  }

  private font(size: number, color: string = palette.ink): void {
    this.doc.font(FONT_NAME).fontSize(size).fillColor(color)
  }

  private glyphWidth(glyph: string, size: number): number {
    const key = `${size}:${glyph}`
    const cached = this.widthCache.get(key)
    if (cached !== undefined) return cached
    this.font(size)
    const codePoint = glyph.codePointAt(0)
    const fontkitFont = this.doc._font?.font
    if (
      codePoint === undefined
      || typeof fontkitFont?.hasGlyphForCodePoint !== 'function'
      || !fontkitFont.hasGlyphForCodePoint(codePoint)
    ) {
      throw new Error('Consultation PDF font coverage check failed')
    }
    const measured = this.doc.widthOfString(glyph, { features: [] })
    this.widthCache.set(key, measured)
    return measured
  }

  private splitLines(value: string, width: number, size: number): string[] {
    const lines: string[] = []
    let current = ''
    let currentWidth = 0

    const pushCurrent = (): void => {
      lines.push(current)
      current = ''
      currentWidth = 0
    }

    for (const glyph of Array.from(value)) {
      if (glyph === '\r') continue
      if (glyph === '\n') {
        pushCurrent()
        continue
      }

      const glyphWidth = this.glyphWidth(glyph, size)
      if (current.length > 0 && currentWidth + glyphWidth > width) {
        if (NO_LINE_START.has(glyph)) {
          current += glyph
          pushCurrent()
          continue
        }
        const finalGlyph = Array.from(current).at(-1) ?? ''
        if (NO_LINE_END.has(finalGlyph)) {
          current = current.slice(0, -finalGlyph.length)
          currentWidth -= this.glyphWidth(finalGlyph, size)
          if (current.length > 0) pushCurrent()
          current = finalGlyph
          currentWidth = this.glyphWidth(finalGlyph, size)
        } else {
          pushCurrent()
        }
      }
      current += glyph
      currentWidth += glyphWidth
    }
    if (current.length > 0 || lines.length === 0) lines.push(current)
    return lines
  }

  private paintPaper(): void {
    this.artifact(() => {
      this.doc.save()
      this.doc.fillColor(palette.paper).rect(0, 0, PAGE.width, PAGE.height).fill()
      this.doc.opacity(0.34)
      this.doc.strokeColor(palette.bronzeSoft).lineWidth(0.45)
      this.doc.circle(PAGE.width + 30, 88, 116).stroke()
      this.doc.circle(PAGE.width + 30, 88, 154).stroke()
      this.doc.opacity(1)
      this.doc.restore()
    })
  }

  private addPage(kind: 'cover' | 'body'): void {
    this.doc.addPage({ size: 'A4', margin: 0 })
    this.pageKinds.push(kind)
    this.paintPaper()
    this.y = PAGE.top
  }

  private ensureSpace(height: number): void {
    if (this.y + height <= PAGE.height - PAGE.bottom) return
    this.addPage('body')
  }

  private drawLine(
    value: string,
    x: number,
    y: number,
    style: TextStyle,
    width?: number,
    align: 'left' | 'right' | 'center' = 'left',
    structureParent?: any,
    structureType: StructureTag = 'P',
    artifact = false,
  ): void {
    const glyphs = Array.from(value)
    if (glyphs.length === 0) return
    const spacing = style.characterSpacing ?? 0
    const valueWidth = glyphs.reduce(
      (sum, glyph) => sum + this.glyphWidth(glyph, style.size),
      Math.max(0, glyphs.length - 1) * spacing,
    )
    const availableWidth = width ?? valueWidth
    const cursor = align === 'right'
      ? x + availableWidth - valueWidth
      : align === 'center'
        ? x + (availableWidth - valueWidth) / 2
        : x
    const draw = (parent?: any): void => {
      this.font(style.size, style.color)
      this.doc.text(value, cursor, y, {
        lineBreak: false,
        characterSpacing: spacing,
        features: [],
        ...(parent ? { structParent: parent, structType: 'Span' } : {}),
      })
    }
    if (artifact) {
      this.artifact(() => draw())
      return
    }
    const parent = structureParent ?? this.createStructure(structureType)
    draw(parent)
    if (!structureParent) parent.end()
  }

  private drawWrapped(value: string, options: DrawWrappedOptions): number {
    const x = options.x ?? PAGE.left
    const width = options.width ?? CONTENT_WIDTH
    const lineHeight = options.lineHeight ?? options.size * 1.65
    const lines = this.splitLines(value, width, options.size)
    const structure = this.createStructure(options.structureType ?? 'P')
    let renderedHeight = 0

    for (const line of lines) {
      if (options.allowPageBreak !== false) this.ensureSpace(lineHeight)
      this.drawLine(line, x, this.y, options, width, 'left', structure)
      this.y += lineHeight
      renderedHeight += lineHeight
    }
    structure.end()
    const after = options.after ?? 0
    this.y += after
    return renderedHeight + after
  }

  private measureWrapped(value: string, width: number, size: number, lineHeight: number): number {
    return this.splitLines(value, width, size).length * lineHeight
  }

  private sectionHeading(kicker: string, title: string, lead?: string): void {
    this.drawWrapped(kicker, {
      size: 7.8,
      color: palette.vermilion,
      lineHeight: 10,
      characterSpacing: 1.3,
      after: 8,
    })
    this.drawWrapped(title, {
      size: 23,
      color: palette.ink,
      lineHeight: 30,
      after: lead ? 8 : 18,
      structureType: 'H2',
    })
    if (lead) {
      this.drawWrapped(lead, {
        size: 10.8,
        color: palette.inkSoft,
        lineHeight: 17,
        after: 22,
      })
    }
  }

  cover(): void {
    this.addPage('cover')
    const accent = this.model.plan === 'G15' ? palette.sage : palette.indigo
    this.artifact(() => {
      this.doc.fillColor(palette.vermilion).rect(0, 0, 12, PAGE.height).fill()
      this.doc.fillColor(accent).rect(66, 64, 76, 2).fill()
    })
    this.y = 94
    this.drawWrapped('鑑源 · 當代鑑識卷宗', {
      x: 66,
      width: 475,
      size: 8.5,
      color: palette.bronze,
      lineHeight: 12,
      characterSpacing: 1.8,
      after: 16,
      allowPageBreak: false,
    })
    this.drawWrapped(this.model.planTitle, {
      x: 66,
      width: 440,
      size: 40,
      lineHeight: 50,
      characterSpacing: 2.2,
      after: 10,
      allowPageBreak: false,
      structureType: 'H1',
    })
    this.drawWrapped(this.model.subtitle, {
      x: 66,
      width: 350,
      size: 13,
      color: palette.inkSoft,
      lineHeight: 21,
      after: 34,
      allowPageBreak: false,
    })

    this.artifact(() => {
      this.doc.strokeColor(palette.bronzeSoft).lineWidth(0.7).moveTo(66, this.y).lineTo(520, this.y).stroke()
    })
    this.y += 18
    const meta = [
      ['受談者', this.model.people.join('／')],
      ['報告基準日', this.model.asOfDate],
      ['報告編號', this.model.reportNumber],
    ]
    for (const [label, value] of meta) {
      this.drawWrapped(label, {
        x: 66,
        width: 430,
        size: 7.5,
        color: palette.inkMuted,
        lineHeight: 10,
        characterSpacing: 1.1,
        after: 4,
        allowPageBreak: false,
      })
      this.drawWrapped(value, {
        x: 66,
        width: 430,
        size: 11.5,
        color: palette.indigo,
        lineHeight: 18,
        after: 8,
        allowPageBreak: false,
      })
    }

    const statement = '先看結論，再回到生活核對。這份報告的用途，是幫你把感受、關係與行動變成可討論的線索。'
    this.artifact(() => {
      this.doc.fillColor(palette.vermilion).rect(66, 690, 2, 72).fill()
    })
    const savedY = this.y
    this.y = 694
    this.drawWrapped(statement, {
      x: 83,
      width: 430,
      size: 10.8,
      color: palette.inkSoft,
      lineHeight: 18,
      allowPageBreak: false,
    })
    this.y = savedY
  }

  overview(): void {
    this.addPage('body')
    this.doc.outline.addItem('30 秒先看', { fit: true, pageNumber: null })
    this.sectionHeading(
      '30 秒先看',
      '先抓住三個重點',
      '不用一次讀完。先從最有感的一項開始，用近期經驗核對。',
    )

    this.model.quickItems.forEach((item, index) => {
      const innerWidth = CONTENT_WIDTH - 30
      const conclusionHeight = this.measureWrapped(item.conclusion, innerWidth, 11.7, 18)
      const check = `可以怎麼核對：${item.selfCheck}`
      const checkHeight = this.measureWrapped(check, innerWidth, 8.8, 14)
      const height = 22 + conclusionHeight + checkHeight + 18
      this.ensureSpace(height + 12)
      const top = this.y
      this.artifact(() => {
        this.doc.fillColor(palette.white).rect(PAGE.left, top, CONTENT_WIDTH, height).fill()
        this.doc.fillColor(palette.vermilion).rect(PAGE.left, top, 2.2, height).fill()
      })
      this.y = top + 10
      this.drawWrapped(String(index + 1).padStart(2, '0'), {
        x: PAGE.left + 14,
        width: innerWidth,
        size: 7.2,
        color: palette.bronze,
        lineHeight: 10,
        characterSpacing: 1,
        after: 3,
        allowPageBreak: false,
      })
      this.drawWrapped(item.conclusion, {
        x: PAGE.left + 14,
        width: innerWidth,
        size: 11.7,
        color: palette.ink,
        lineHeight: 18,
        after: 4,
        allowPageBreak: false,
      })
      this.drawWrapped(check, {
        x: PAGE.left + 14,
        width: innerWidth,
        size: 8.8,
        color: palette.inkSoft,
        lineHeight: 14,
        allowPageBreak: false,
      })
      this.y = top + height + 12
    })

    this.ensureSpace(48)
    this.drawWrapped('閱讀路徑', {
      size: 7.8,
      color: palette.vermilion,
      lineHeight: 10,
      characterSpacing: 1.3,
      after: 12,
      structureType: 'H3',
    })
    this.artifact(() => {
      this.doc.strokeColor(palette.bronzeSoft).lineWidth(0.55).moveTo(PAGE.left, this.y).lineTo(PAGE.width - PAGE.right, this.y).stroke()
    })
    for (const chapter of this.model.chapters) {
      const titleHeight = this.measureWrapped(chapter.title, CONTENT_WIDTH - 48, 9.3, 14)
      const rowHeight = Math.max(30, titleHeight + 16)
      this.ensureSpace(rowHeight)
      const top = this.y
      this.drawLine(String(chapter.ordinal).padStart(2, '0'), PAGE.left, top + 8, {
        size: 8,
        color: palette.vermilion,
      }, 34)
      this.y = top + 8
      this.drawWrapped(chapter.title, {
        x: PAGE.left + 42,
        width: CONTENT_WIDTH - 48,
        size: 9.3,
        color: palette.ink,
        lineHeight: 14,
        allowPageBreak: false,
      })
      this.y = top + rowHeight
      this.artifact(() => {
        this.doc.strokeColor(palette.bronzeSoft).lineWidth(0.45).moveTo(PAGE.left, this.y).lineTo(PAGE.width - PAGE.right, this.y).stroke()
      })
    }
  }

  private conclusionBox(chapter: ConsultationPdfChapter): void {
    const innerWidth = CONTENT_WIDTH - 30
    const textHeight = this.measureWrapped(chapter.conclusionSubtitle, innerWidth, 11.8, 18)
    const height = textHeight + 38
    this.ensureSpace(height + 18)
    const top = this.y
    this.artifact(() => {
      this.doc.fillColor(palette.white).rect(PAGE.left, top, CONTENT_WIDTH, height).fill()
      this.doc.strokeColor(palette.bronze).lineWidth(0.8)
        .moveTo(PAGE.left, top).lineTo(PAGE.width - PAGE.right, top)
        .moveTo(PAGE.left, top + height).lineTo(PAGE.width - PAGE.right, top + height).stroke()
    })
    this.y = top + 10
    this.drawWrapped('這章先記住', {
      x: PAGE.left + 15,
      width: innerWidth,
      size: 7.2,
      color: palette.bronze,
      lineHeight: 10,
      characterSpacing: 1.2,
      after: 5,
      allowPageBreak: false,
      structureType: 'H3',
    })
    this.drawWrapped(chapter.conclusionSubtitle, {
      x: PAGE.left + 15,
      width: innerWidth,
      size: 11.8,
      color: palette.indigo,
      lineHeight: 18,
      allowPageBreak: false,
    })
    this.y = top + height + 18
  }

  private evidenceLines(entry: ConsultationPdfEvidence): string[] {
    const statusLabels = {
      convergent: '多系統相互支持',
      mixed: '同時存在支持與分歧',
      single_system: '目前只有單一系統支持',
      insufficient: '目前資料不足，不當作穩定結論',
    } as const
    return [
      `證據狀態：${entry.evidenceStatuses.map((status) => statusLabels[status]).join('；')}`,
      `相互支持：${entry.supportingSystems.join('、') || '未達到多系統共識'}`,
      `分歧系統：${entry.opposingSystems.join('、') || '目前無被標記的相反依據'}`,
      entry.sources.length > 0 ? `參考來源：${entry.sources.join('／')}` : '',
      ...entry.applicability.map((value) => `何時適用：${value}`),
      ...entry.invalidation.map((value) => `何時不採用：${value}`),
      ...entry.limitations.map((value) => `使用邊界：${value}`),
    ].filter(Boolean)
  }

  private evidenceItemHeight(entry: ConsultationPdfEvidence, lines: string[]): number {
    const innerWidth = CONTENT_WIDTH - 26
    const labelHeight = this.measureWrapped(entry.label, innerWidth, 9.4, 15)
    const lineHeights = lines.map((line) => this.measureWrapped(line, innerWidth, 8, 13))
    return 18 + labelHeight + lineHeights.reduce((sum, value) => sum + value + 3, 0) + 10
  }

  private evidenceItem(entry: ConsultationPdfEvidence): void {
    const lines = this.evidenceLines(entry)
    const totalHeight = this.evidenceItemHeight(entry, lines)
    const innerWidth = CONTENT_WIDTH - 26

    if (totalHeight <= PAGE.height - PAGE.top - PAGE.bottom) {
      this.ensureSpace(totalHeight + 8)
      const top = this.y
      this.artifact(() => {
        this.doc.fillColor(palette.paperDeep).rect(PAGE.left, top, CONTENT_WIDTH, totalHeight).fill()
        this.doc.fillColor(palette.sage).rect(PAGE.left, top, 1.6, totalHeight).fill()
      })
      this.y = top + 9
      this.drawWrapped(entry.label, {
        x: PAGE.left + 13,
        width: innerWidth,
        size: 9.4,
        color: palette.indigo,
        lineHeight: 15,
        after: 5,
        allowPageBreak: false,
        structureType: 'H4',
      })
      for (const line of lines) {
        this.drawWrapped(line, {
          x: PAGE.left + 13,
          width: innerWidth,
          size: 8,
          color: palette.inkSoft,
          lineHeight: 13,
          after: 3,
          allowPageBreak: false,
        })
      }
      this.y = top + totalHeight + 8
      return
    }

    this.ensureSpace(46)
    this.drawWrapped(entry.label, {
      x: PAGE.left + 13,
      width: innerWidth,
      size: 9.4,
      color: palette.indigo,
      lineHeight: 15,
      after: 7,
      structureType: 'H4',
    })
    for (const line of lines) {
      this.drawWrapped(line, {
        x: PAGE.left + 13,
        width: innerWidth,
        size: 8,
        color: palette.inkSoft,
        lineHeight: 13,
        after: 4,
      })
    }
    this.y += 8
  }

  chapter(chapter: ConsultationPdfChapter): void {
    this.addPage('body')
    this.doc.outline.addItem(chapter.title, { fit: true, pageNumber: null })
    this.sectionHeading(
      `章節 ${String(chapter.ordinal).padStart(2, '0')}`,
      chapter.title,
    )
    this.conclusionBox(chapter)

    for (const paragraph of chapter.paragraphs) {
      this.drawWrapped(paragraph.text, {
        size: 9.35,
        color: palette.ink,
        lineHeight: 16.4,
        after: 10,
      })
    }

    const firstEvidence = chapter.evidence[0]
    const firstEvidenceHeight = firstEvidence
      ? this.evidenceItemHeight(firstEvidence, this.evidenceLines(firstEvidence)) + 8
      : 0
    // Keep the evidence heading with its first card instead of orphaning the
    // heading at the bottom of a long chapter page.
    this.ensureSpace(52 + firstEvidenceHeight)
    this.artifact(() => {
      this.doc.strokeColor(palette.bronze).lineWidth(0.8).moveTo(PAGE.left, this.y).lineTo(PAGE.width - PAGE.right, this.y).stroke()
    })
    this.y += 14
    this.drawWrapped('參考來源與使用邊界', {
      size: 10.5,
      color: palette.vermilion,
      lineHeight: 16,
      characterSpacing: 0.6,
      after: 10,
      structureType: 'H3',
    })
    for (const entry of chapter.evidence) this.evidenceItem(entry)
  }

  appendix(): void {
    this.addPage('body')
    this.doc.outline.addItem('參考與限制', { fit: true, pageNumber: null })
    this.sectionHeading(
      '最後一站',
      '參考與限制',
      '這一頁不是免責聲明，而是幫你判斷什麼可以採用、什麼需要再求證。',
    )

    this.appendixSection('報告參考來源', this.model.sources.map((source, index) => `${index + 1}. ${source}`))
    this.appendixSection('閱讀與使用邊界', this.model.generalLimitations.map((value, index) => `${index + 1}. ${value}`))
    this.appendixSection(
      '基準日與人物範圍',
      this.model.peopleDetails.map((person) =>
        `${person.displayName}：基準日實足 ${person.ageYears} 歲，閱讀階段為${person.stageLabel}。${person.birthTimeLabel}。`,
      ),
    )
  }

  private appendixSection(title: string, lines: string[]): void {
    this.ensureSpace(58)
    this.drawWrapped(title, {
      size: 13.2,
      color: palette.indigo,
      lineHeight: 19,
      after: 7,
      structureType: 'H3',
    })
    this.artifact(() => {
      this.doc.strokeColor(palette.bronzeSoft).lineWidth(0.6).moveTo(PAGE.left, this.y).lineTo(PAGE.width - PAGE.right, this.y).stroke()
    })
    this.y += 9
    for (const line of lines) {
      this.drawWrapped(line, {
        size: 9.2,
        color: palette.inkSoft,
        lineHeight: 15,
        after: 6,
      })
    }
    this.y += 12
  }

  finishChrome(): void {
    const range = this.doc.bufferedPageRange()
    for (let index = 0; index < range.count; index += 1) {
      this.doc.switchToPage(range.start + index)
      const kind = this.pageKinds[index]
      if (kind === 'cover') {
        this.artifact(() => {
          this.doc.strokeColor(palette.bronzeSoft).lineWidth(0.55).moveTo(66, 795).lineTo(541, 795).stroke()
        })
        this.drawLine(`JianYuan · ${this.model.plan}`, 66, 806, { size: 6.8, color: palette.inkMuted }, 240, 'left', undefined, 'P', true)
        this.drawLine('PRIVATE COPY', 301, 806, { size: 6.8, color: palette.inkMuted }, 240, 'right', undefined, 'P', true)
        continue
      }

      this.drawLine('鑑源 JIANYUAN · LIVING DOSSIER', PAGE.left, 24, {
        size: 7.1,
        color: palette.bronze,
        characterSpacing: 1.05,
      }, 275, 'left', undefined, 'P', true)
      this.drawLine(`${this.model.planTitle} · ${this.model.asOfDate}`, 320, 24, {
        size: 6.8,
        color: palette.inkMuted,
      }, PAGE.width - PAGE.right - 320, 'right', undefined, 'P', true)
      this.artifact(() => {
        this.doc.strokeColor(palette.bronzeSoft).lineWidth(0.55).moveTo(PAGE.left, 42).lineTo(PAGE.width - PAGE.right, 42).stroke()
      })

      this.artifact(() => {
        this.doc.strokeColor(palette.bronzeSoft).lineWidth(0.55).moveTo(PAGE.left, 797).lineTo(PAGE.width - PAGE.right, 797).stroke()
      })
      this.drawLine(`報告編號 ${this.model.reportNumber}`, PAGE.left, 808, {
        size: 6.8,
        color: palette.inkMuted,
      }, 350, 'left', undefined, 'P', true)
      this.drawLine(`${index + 1} / ${range.count}`, 420, 808, {
        size: 6.8,
        color: palette.inkMuted,
      }, PAGE.width - PAGE.right - 420, 'right', undefined, 'P', true)
    }
  }
}

function finalizeTaggedParentTree(doc: PdfKitDocument): void {
  const structureRoot = doc.getStructTreeRoot()
  const internalTree = structureRoot?.data?.ParentTree
  const rawItems = internalTree?._items
  if (!rawItems || typeof rawItems !== 'object' || Array.isArray(rawItems)) {
    throw new Error('Consultation PDF tagged ParentTree is unavailable')
  }
  const keys = Object.keys(rawItems)
    .map((value) => Number.parseInt(value, 10))
    .sort((left, right) => left - right)
  if (
    keys.length === 0
    || keys.some((key, index) => key !== index)
    || structureRoot.data.ParentTreeNextKey !== keys.length
  ) {
    throw new Error('Consultation PDF tagged ParentTree is incomplete')
  }

  const nums: unknown[] = []
  for (const key of keys) {
    const owners = rawItems[key]
    if (!Array.isArray(owners) || owners.length === 0 || owners.some((owner) => !owner)) {
      throw new Error('Consultation PDF tagged ParentTree contains an invalid page entry')
    }
    nums.push(key, owners)
  }

  // @react-pdf/pdfkit 5.1.1's PDFObject serializer special-cases
  // PDFNameTree but not its PDFNumberTree sibling. Leaving the internal tree
  // in place serializes implementation fields (`/_items`, `/limits`) instead
  // of the ISO 32000 `/Nums` number tree required to resolve each MCID. Build
  // the standard indirect object explicitly and fail closed if the fork's
  // internal contract changes.
  const parentTree = doc.ref({
    Nums: nums,
    Limits: [keys[0], keys.at(-1)],
  })
  parentTree.end()
  structureRoot.data.ParentTree = parentTree
}

export async function renderConsultationPdfModel(
  model: ConsultationPdfModel,
): Promise<Uint8Array> {
  const metadataDate = new Date(`${model.asOfDate}T00:00:00.000Z`)
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    size: 'A4',
    margin: 0,
    compress: true,
    pdfVersion: '1.7',
    tagged: true,
    lang: 'zh-TW',
    pageLayout: 'oneColumn',
    displayTitle: true,
    info: {
      Title: `鑑源 ${model.planTitle} · ${model.people.join('／')}`,
      Author: '鑑源 JianYuan',
      Subject: `${model.planTitle} · 報告基準日 ${model.asOfDate}`,
      Creator: 'JianYuan Consultation PDF',
      Producer: 'JianYuan Consultation PDF',
      Keywords: `JianYuan, ${model.planTitle}, consultation`,
      CreationDate: metadataDate,
      ModDate: metadataDate,
    },
  })
  // Passing the resolved file path is intentional. The bundled PDFKit/fontkit
  // path loader produces a bounded TrueType subset; the Buffer loader embeds
  // the entire CJK font program.
  doc.registerFont(FONT_NAME, FONT_PATH)

  const chunks: Buffer[] = []
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Uint8Array) => chunks.push(Buffer.from(chunk)))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const painter = new ConsultationPdfPainter(doc, model)
  painter.cover()
  painter.overview()
  for (const chapter of model.chapters) painter.chapter(chapter)
  painter.appendix()
  painter.finishChrome()
  finalizeTaggedParentTree(doc)
  doc.end()

  const buffer = await completed
  if (buffer.byteLength > MAX_RENDERED_PDF_BYTES) {
    throw new Error(`Consultation PDF exceeded the delivery size limit (${buffer.byteLength} bytes)`)
  }
  return new Uint8Array(buffer)
}
