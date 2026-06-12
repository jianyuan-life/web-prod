import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '結帳',  // root layout template 會補「| 鑒源 JianYuan」;方案名由 checkout page 客戶端動態補(plan 來自 searchParams、layout 取不到)
  description: '填寫生辰資料，完成命理報告購買。鑒源融合東西方14大命理系統，精準分析您的命格。',
  robots: { index: false, follow: false },
}

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
