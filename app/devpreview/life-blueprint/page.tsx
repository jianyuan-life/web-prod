// DEV-ONLY 預覽頁(報告重構視覺驗證、繞 auth gate、驗完刪)
// 2026-06-23 goal:驗 ReportSnapshot + LifeBlueprintReport 結構化渲染
// 🔴 production guard:非 development 一律 404(防誤上線)
import { notFound } from 'next/navigation'
import { ReportRenderer } from '@/components/report/ReportRenderer'
import { mockHeYuZhunLifeBlueprint } from '@/lib/mocks/he-yu-zhun-life-blueprint'

export const dynamic = 'force-dynamic'

export default function DevPreviewLifeBlueprint() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return (
    <ReportRenderer
      type="life-blueprint"
      id="he-yu-zhun"
      data={{ type: 'life-blueprint', data: mockHeYuZhunLifeBlueprint }}
    />
  )
}
