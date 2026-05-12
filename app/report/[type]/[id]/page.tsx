// v5.10.201 Sprint 1 — unified report 路由(Jamie 規格 + Codex L3 + Gemini L4 共識)
//
// 路由:/report/[type]/[id]
// type:life-blueprint | heart-doubts | compatibility | family-blueprint
// id:paid_reports.id(UUID)
//
// Feature Flag:env var `ENABLE_NEW_REPORT_RENDERER`
//   - production:預設 false → 404(無感、不破壞既有 /report/[token]/)
//   - dev / preview:true → 開放新 UI
//   - Sprint 2+ 改 white-list email(Jamie + Beta 用戶)
//
// 注意:
//   - Next.js 16 dynamic route、跟既有 /report/[token]/page.tsx 不衝突(雙層 vs 單層 param)
//   - Sprint 1 純 skeleton、Sprint 2 加 Supabase RLS + paid_reports adapter
//   - 強制 dynamic 避免 build-time prerender(避開 Codex P1 access_token 漏出風險)
import { notFound } from 'next/navigation'
import { ReportRenderer, isReportType } from '@/components/report/ReportRenderer'
import { getReport } from '@/lib/report-adapter'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

interface PageProps {
  params: Promise<{ type: string; id: string }>
}

function isFeatureEnabled(): boolean {
  // Sprint 1:純 env var(production 預設 false)
  // Sprint 2:擴展為 white-list email + Beta cookie
  return process.env.ENABLE_NEW_REPORT_RENDERER === 'true'
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { type } = await params
  const TITLES: Record<string, string> = {
    'life-blueprint': '人生藍圖',
    'heart-doubts': '心之所惑',
    'compatibility': '合否?',
    'family-blueprint': '家族藍圖',
  }
  const title = TITLES[type] || '命理報告'
  return {
    title: `${title} · 鑒源命理`,
    robots: { index: false, follow: false }, // 報告頁不索引
  }
}

export default async function UnifiedReportPage({ params }: PageProps) {
  const { type, id } = await params

  // Feature Flag:未啟用 → 404(無感、安全)
  if (!isFeatureEnabled()) {
    notFound()
  }

  // type 必須是 4 種之一
  if (!isReportType(type)) {
    notFound()
  }

  // id 基本 format 驗證(UUID 或數字、避免 SQL injection)
  if (!id || !/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
    notFound()
  }

  // Sprint 1 step 5:fetch via adapter(目前只有 mock 何宥諄 life-blueprint、其他 type 待 Sprint 2)
  const reportData = await getReport(type, id)
  // 找不到也 render skeleton(避免訪客撞 404、Sprint 1 demo 用)
  // Sprint 2 改成 notFound() / redirect /auth/login

  return <ReportRenderer type={type} id={id} data={reportData} />
}
