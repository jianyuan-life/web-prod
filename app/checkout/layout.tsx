import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '結帳 — 鑒源 JianYuan',
  description: '填寫生辰資料，完成命理報告購買。鑒源融合東西方14大命理系統，精準分析您的命格。',
  robots: { index: false, follow: false },
}

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
