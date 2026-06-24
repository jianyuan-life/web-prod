// DEV-ONLY 預覽(驗 FamilyBlueprintReport 渲染、繞 gate、驗完刪)、production guard
import { notFound } from 'next/navigation'
import { ReportRenderer } from '@/components/report/ReportRenderer'
import { MOCK_FAMILY_BLUEPRINT_HE_JIA } from '@/lib/mocks/family-blueprint-he-jia'
export const dynamic = 'force-dynamic'
export default function P() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <ReportRenderer type="family-blueprint" id="he-jia" data={{ type: 'family-blueprint', data: MOCK_FAMILY_BLUEPRINT_HE_JIA }} />
}
