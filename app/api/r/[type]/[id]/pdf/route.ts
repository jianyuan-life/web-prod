// v5.10.232 — PDF download API route(對應 4 PDF templates、server-side render + stream)
//
// 路徑:/api/report/[type]/[id]/pdf
// 要求:Beta whitelist email(同 /r/[type]/[id]/ Feature Flag)
// 流:server render PDF → ReadableStream → 客戶端下載
import { NextRequest, NextResponse } from 'next/server'
import { renderToStream, type DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import { isReportType } from '@/components/report/ReportRenderer'
import { getReport } from '@/lib/report-adapter'
import { isBetaTester } from '@/lib/auth-helper-server'
import { LifeBlueprintPDF } from '@/lib/pdf/life-blueprint-template'
import { HeartDoubtsPDF } from '@/lib/pdf/heart-doubts-template'
import { CompatibilityPDF } from '@/lib/pdf/compatibility-template'
import { FamilyBlueprintPDF } from '@/lib/pdf/family-blueprint-template'

export const runtime = 'nodejs' // @react-pdf 需 Node runtime
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ type: string; id: string }>
}

const TYPE_LABELS: Record<string, string> = {
  'life-blueprint': '人生藍圖',
  'heart-doubts': '心之所惑',
  'compatibility': '合否',
  'family-blueprint': '家族藍圖',
}

export async function GET(_req: NextRequest, { params }: PageProps) {
  const { type, id } = await params

  // Beta whitelist check
  const allowed = await isBetaTester()
  if (!allowed) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // Type validation
  if (!isReportType(type)) {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 })
  }
  if (!id || !/^[a-zA-Z0-9_-]{2,64}$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  // Fetch report data
  const report = await getReport(type, id)
  if (!report) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // Dispatch to correct PDF template
  let pdfElement: ReactElement<DocumentProps>
  switch (report.type) {
    case 'life-blueprint':
      pdfElement = LifeBlueprintPDF({ data: report.data }) as ReactElement<DocumentProps>
      break
    case 'heart-doubts':
      pdfElement = HeartDoubtsPDF({ data: report.data }) as ReactElement<DocumentProps>
      break
    case 'compatibility':
      pdfElement = CompatibilityPDF({ data: report.data }) as ReactElement<DocumentProps>
      break
    case 'family-blueprint':
      pdfElement = FamilyBlueprintPDF({ data: report.data }) as ReactElement<DocumentProps>
      break
    default: {
      const _exhaustive: never = report
      return NextResponse.json({ error: 'unknown type' }, { status: 500 })
    }
  }

  try {
    const stream = await renderToStream(pdfElement)
    const filename = `鑒源-${TYPE_LABELS[type] || type}-${id}.pdf`

    return new NextResponse(stream as unknown as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store, no-cache, must-revalidate',
      },
    })
  } catch (e) {
    console.error('[pdf] render failed:', e)
    return NextResponse.json({ error: 'render failed' }, { status: 500 })
  }
}
