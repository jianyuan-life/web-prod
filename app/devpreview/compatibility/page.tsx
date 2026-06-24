// DEV-ONLY 預覽(驗 CompatibilityReport 渲染、繞 gate、驗完刪)、production guard
import { notFound } from 'next/navigation'
import { ReportRenderer } from '@/components/report/ReportRenderer'
import { MOCK_COMPATIBILITY_LIN_YUAN_LIN } from '@/lib/mocks/compatibility-lin-yuan-lin'
export const dynamic = 'force-dynamic'
export default function P() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <ReportRenderer type="compatibility" id="lin-yuan-lin" data={{ type: 'compatibility', data: MOCK_COMPATIBILITY_LIN_YUAN_LIN }} />
}
