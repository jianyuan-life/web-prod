import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '結帳',  // root layout template 會補「| 鑒源 JianYuan」;方案名由 checkout page 客戶端動態補(plan 來自 searchParams、layout 取不到)
  description: '填寫並確認服務所需資料。付款後開始處理排盤與報告；請在送出前核對出生日期、時間與地點。',
  robots: { index: false, follow: false },
}

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return children
}
