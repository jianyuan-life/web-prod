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
import { isBetaTester } from '@/lib/auth-helper-server'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

interface PageProps {
  params: Promise<{ type: string; id: string }>
}

// v5.10.205 Sprint 1 step C(Codex Top 2 + Gemini 共識):
//   Feature Flag 從 v5.10.204 hard-block return false 升級為 Beta tester email whitelist
//   - 對齊 lesson #117:server-side runtime env(非 NEXT_PUBLIC_)在 Vercel runtime safe(unlike build-time inline)
//   - 對齊 Codex 推薦:cookie/user role 替代 process.env hard-coded check
//   - 對齊 Gemini 推薦:server-side auth gate + Supabase admin.getUser 驗簽
//
// 機制:
//   - 訪客無 JWT → 404(notFound)
//   - 訪客 JWT email NOT in BETA_TESTER_EMAILS env var → 404
//   - 訪客 JWT email in whitelist → 進入 ReportRenderer
//
// Vercel 設定:
//   Settings → Environment Variables → BETA_TESTER_EMAILS=jamie@jianyuan.life,...
//
// Sprint 2 升級點:改用 Supabase user_metadata.is_beta_tester(避免 env var manage email list)

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

  // Feature Flag:Beta tester whitelist check(server-side、Vercel runtime env reliable)
  const allowed = await isBetaTester()
  if (!allowed) {
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
