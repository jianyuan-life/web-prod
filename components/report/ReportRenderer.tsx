// v5.10.201 Sprint 1 — ReportRenderer dispatch
// 對應 unified spec C 段第一 sprint step 3
// Jamie 提的 unified 路由設計:`<ReportRenderer type={type} data={data} />` dispatch 到 4 type
//
// Sprint 1 只 dispatch、不 fetch data(留 sprint 2 加 Supabase RLS adapter)
import { LifeBlueprintReport } from './types/LifeBlueprintReport'
import { HeartDoubtsReport } from './types/HeartDoubtsReport'
import { CompatibilityReport } from './types/CompatibilityReport'
import { FamilyBlueprintReport } from './types/FamilyBlueprintReport'

export const REPORT_TYPES = ['life-blueprint', 'heart-doubts', 'compatibility', 'family-blueprint'] as const
export type ReportType = typeof REPORT_TYPES[number]

export function isReportType(t: string): t is ReportType {
  return (REPORT_TYPES as readonly string[]).includes(t)
}

interface ReportRendererProps {
  type: ReportType
  id: string
  // TODO Sprint 2:data?: LifeBlueprint | HeartDoubts | Compatibility | Family
}

export function ReportRenderer({ type, id }: ReportRendererProps) {
  switch (type) {
    case 'life-blueprint':
      return <LifeBlueprintReport id={id} />
    case 'heart-doubts':
      return <HeartDoubtsReport id={id} />
    case 'compatibility':
      return <CompatibilityReport id={id} />
    case 'family-blueprint':
      return <FamilyBlueprintReport id={id} />
    default: {
      // 編譯時保證所有 case 都處理
      const _exhaustive: never = type
      return null
    }
  }
}
