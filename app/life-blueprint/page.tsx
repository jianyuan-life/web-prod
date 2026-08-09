import type { Metadata } from 'next'

import ConsultationProductPage from '@/components/consultation/marketing/ConsultationProductPage'
import { CONSULTATION_PRODUCTS } from '@/components/consultation/marketing/product-data'

export const metadata: Metadata = {
  title: '人生藍圖｜把人生線索整理成可行動的個人卷宗',
  description:
    '鑒源人生藍圖以 14 套命理系統交叉參照，將性格、關係、工作與人生階段整理成分層、可回看的繁體中文諮詢報告。',
  alternates: { canonical: 'https://jianyuan.life/life-blueprint' },
  openGraph: {
    title: '人生藍圖｜鑒源 JianYuan',
    description: '先看結論，再理解依據，最後把洞察帶回生活驗證。',
    url: 'https://jianyuan.life/life-blueprint',
    siteName: '鑒源 JianYuan',
    locale: 'zh_TW',
    type: 'website',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: '鑒源人生藍圖' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '人生藍圖｜鑒源 JianYuan',
    description: '一份能先掃讀、再深入、最後帶走行動的個人諮詢報告。',
    images: ['/og-default.png'],
  },
  robots: { index: true, follow: true },
}
export default function LifeBlueprintPage() {
  return <ConsultationProductPage product={CONSULTATION_PRODUCTS.C} />
}
