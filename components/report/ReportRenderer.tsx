// v5.10.201 Sprint 1 — ReportRenderer dispatch
// 對應 unified spec C 段第一 sprint step 3
// Jamie 提的 unified 路由設計:`<ReportRenderer type={type} data={data} />` dispatch 到 4 type
//
// Sprint 1 只 dispatch、不 fetch data(留 sprint 2 加 Supabase RLS adapter)
//
// v5.10.252 wire dead component #3:JianyuanNavBar 在所有 4 type 報告共用 nav
// 暫時跟 global Navbar 共存(Sprint 3 改 route group hide global)
import { LifeBlueprintReport } from './types/LifeBlueprintReport'
import { HeartDoubtsReport } from './types/HeartDoubtsReport'
import { CompatibilityReport } from './types/CompatibilityReport'
import { FamilyBlueprintReport } from './types/FamilyBlueprintReport'
import { JianyuanNavBar } from './shared/JianyuanNavBar'
import type { ReportData } from '@/types/report-schemas'

export const REPORT_TYPES = ['life-blueprint', 'heart-doubts', 'compatibility', 'family-blueprint'] as const
export type ReportType = typeof REPORT_TYPES[number]

export function isReportType(t: string): t is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(t)
}

interface ReportRendererProps {
  type: ReportType
  id: string
  data?: ReportData | null // Sprint 1:可選、null 時走 skeleton fallback
}

export function ReportRenderer({ type, id, data }: ReportRendererProps) {
  // v5.10.252:wire JianyuanNavBar(Beta /r/* 專屬 nav、無 logged-in user 給 null = 顯登入按鈕)
  // 暫時跟 global Navbar 同時顯示、Sprint 3 改 route group hide global

  // Sprint 1:type-safe dispatch、data 對應 type 才 pass、否則 skeleton fallback
  const reportContent = (() => {
    switch (type) {
      case 'life-blueprint':
        return (
          <LifeBlueprintReport
            id={id}
            data={data?.type === 'life-blueprint' ? data.data : undefined}
          />
        )
      case 'heart-doubts':
        return (
          <HeartDoubtsReport
            id={id}
            data={data?.type === 'heart-doubts' ? data.data : undefined}
          />
        )
      case 'compatibility':
        return (
          <CompatibilityReport
            id={id}
            data={data?.type === 'compatibility' ? data.data : undefined}
          />
        )
      case 'family-blueprint':
        return (
          <FamilyBlueprintReport
            id={id}
            data={data?.type === 'family-blueprint' ? data.data : undefined}
          />
        )
      default: {
        const _exhaustive: never = type
        return null
      }
    }
  })()

  return (
    <>
      {/* v5.10.252 wire dead component #3:JianyuanNavBar 用於 /r/* Beta 路徑
          注意:目前跟 global Navbar 同存(Sprint 3 改 route group(/r)/layout.tsx 隱藏 global)
          userEmail 留 null = 顯示「我的報告 / 登入」、Sprint 2.x 從 server component 傳入 */}
      <JianyuanNavBar />
      {reportContent}
    </>
  )
}
