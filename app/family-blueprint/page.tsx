import type { Metadata } from 'next'

import ConsultationProductPage from '@/components/consultation/marketing/ConsultationProductPage'
import { CONSULTATION_PRODUCTS } from '@/components/consultation/marketing/product-data'

export const metadata: Metadata = {
  title: '家族藍圖｜把家庭互動整理成可以對話的地圖',
  description:
    '鑒源家族藍圖整合 2–8 份已完成的人生藍圖，整理家庭需求、互動循環與 90 天練習，不替成員貼標籤或裁決對錯。',
  alternates: { canonical: 'https://jianyuan.life/family-blueprint' },
  openGraph: {
    title: '家族藍圖｜鑒源 JianYuan',
    description: '看見一家人如何彼此影響，把衝突改寫成可以討論的需要。',
    url: 'https://jianyuan.life/family-blueprint',
    siteName: '鑒源 JianYuan',
    locale: 'zh_TW',
    type: 'website',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: '鑒源家族藍圖' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '家族藍圖｜鑒源 JianYuan',
    description: '以每位成員的完整個人報告為起點，整理互動、界線與共同練習。',
    images: ['/og-default.png'],
  },
  robots: { index: true, follow: true },
}
export default function FamilyBlueprintPage() {
  return <ConsultationProductPage product={CONSULTATION_PRODUCTS.G15} />
}
