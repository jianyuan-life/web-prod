import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '紫微斗數速算 免費排盤｜鑒源 JianYuan',
  description: '免費紫微斗數排盤工具——排列紫微命盤、十四主星解讀、十二宮位分析。採用紫微斗數全書傳統排法，即時出結果不需註冊。',
  keywords: '紫微斗數, 紫微排盤, 十四主星, 十二宮位, 紫微命盤, 免費紫微, 紫微斗數免費',
  openGraph: {
    title: '紫微斗數速算｜鑒源 JianYuan',
    description: '免費紫微斗數排盤，十四主星與十二宮位完整解讀。',
    url: 'https://jianyuan.life/tools/ziwei',
    type: 'website',
  },
  alternates: { canonical: 'https://jianyuan.life/tools/ziwei' },
}

export default function ZiweiLayout({ children }: { children: React.ReactNode }) {
  return children
}
