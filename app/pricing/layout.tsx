import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '方案與定價',
  description: '鑒源提供三個命理方案:人生藍圖($89)完整人生分析、家族藍圖($59)家庭互動分析、月度精選($89)每月嚴選吉時。東西方十四大命理系統、精準分析、依電子商品慣例不支援退款。',
  keywords: '鑒源定價, 命理報告價格, 八字報告, 紫微斗數報告, 奇門出門訣, 家庭命理分析',
  alternates: { canonical: 'https://jianyuan.life/pricing' },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
