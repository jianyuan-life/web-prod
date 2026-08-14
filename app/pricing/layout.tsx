import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '方案與定價',
  description: '鑒源提供三個命理方案：人生藍圖($89)整理個人模式與行動方向、家族藍圖($59)分析家庭互動、月度精選($89)每月嚴選吉時。報告為數位內容，付款後開始處理，方案內容與保障條款請見頁面說明。',
  keywords: '鑒源定價, 命理報告價格, 八字報告, 紫微斗數報告, 奇門出門訣, 家庭命理分析',
  alternates: { canonical: 'https://jianyuan.life/pricing' },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
