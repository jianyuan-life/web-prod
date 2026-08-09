import 'server-only'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '私人諮詢報告｜鑑源',
  description: '鑑源人生藍圖與家族藍圖私人報告閱讀頁。',
  referrer: 'no-referrer',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
}
export default function ConsultationLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
