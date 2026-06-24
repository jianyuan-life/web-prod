// DEV-ONLY 預覽(驗 HeartDoubtsReport 渲染、繞 gate、驗完刪)、production guard
import { notFound } from 'next/navigation'
import { ReportRenderer } from '@/components/report/ReportRenderer'
import { MOCK_HEART_DOUBTS_HE_XUAN_YI } from '@/lib/mocks/heart-doubts-he-xuan-yi'
export const dynamic = 'force-dynamic'
export default function P() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <ReportRenderer type="heart-doubts" id="he-xuan-yi" data={{ type: 'heart-doubts', data: MOCK_HEART_DOUBTS_HE_XUAN_YI }} />
}
