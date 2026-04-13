import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '方案與定價',
  description: '鑒源提供6種命理方案：人生藍圖（$89）、心之所惑（$39）、家族藍圖（$59）、合否？（$59）、事件出門訣（$89）、月盤出門訣（$99）。東西方15大命理系統，精準分析。',
  keywords: '鑒源定價, 命理報告價格, 八字報告, 紫微斗數報告, 奇門出門訣, 家庭命理分析',
  alternates: { canonical: 'https://jianyuan.life/pricing' },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children
}
