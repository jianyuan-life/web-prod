import type { Metadata } from 'next'
import Link from 'next/link'
import { PUBLIC_CLAIMS } from '@/lib/public-claims'

export const metadata: Metadata = {
  title: `${PUBLIC_CLAIMS.whitepaper.title} | 鑒源 JianYuan`,
  description: PUBLIC_CLAIMS.whitepaper.description,
  keywords: ['命理排盤方法', '命理資料限制', '八字排盤', '紫微斗數', '奇門遁甲'],
  openGraph: {
    title: PUBLIC_CLAIMS.whitepaper.title,
    description: PUBLIC_CLAIMS.whitepaper.description,
    type: 'article',
    url: 'https://jianyuan.life/whitepaper',
    images: ['/logo-full.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: PUBLIC_CLAIMS.whitepaper.title,
    description: PUBLIC_CLAIMS.whitepaper.description,
  },
  alternates: { canonical: 'https://jianyuan.life/whitepaper' },
}

const SECTIONS = [
  {
    title: '排盤與解讀是兩件事',
    paragraphs: [
      PUBLIC_CLAIMS.whitepaper.calculation,
      `${PUBLIC_CLAIMS.methodology.summary} ${PUBLIC_CLAIMS.methodology.limits}`,
    ],
  },
  {
    title: '流派差異怎麼看',
    paragraphs: [PUBLIC_CLAIMS.whitepaper.variation, PUBLIC_CLAIMS.methodology.comparison],
  },
  {
    title: '出生資料會影響什麼',
    paragraphs: [
      PUBLIC_CLAIMS.whitepaper.dataLimits,
      '若出生時間只能確定到時辰，或完全不確定，請把相關結果視為範圍提示；需要精確時柱或宮位時，宜先向家人或出生機構核對。',
    ],
  },
  {
    title: '公開數字的原則',
    paragraphs: [PUBLIC_CLAIMS.whitepaper.publication],
  },
] as const

export default function WhitepaperPage() {
  return (
    <article className="jy-page jy-public-page jy-whitepaper-page py-20 max-w-3xl mx-auto px-6">
      <header className="text-center mb-16">
        <div className="inline-block mb-4 text-sm tracking-widest text-gold uppercase">
          METHODS & LIMITS
        </div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gradient-gold mb-6 leading-tight text-balance break-words">
          {PUBLIC_CLAIMS.whitepaper.title}
        </h1>
        <p className="text-lg md:text-xl text-text-muted max-w-2xl mx-auto leading-relaxed">
          {PUBLIC_CLAIMS.whitepaper.description}
        </p>
      </header>

      <section className="mb-16">
        <h2 className="text-2xl font-bold text-white mb-6 border-l-4 border-gold pl-4">
          這份說明涵蓋什麼
        </h2>
        <p className="text-text leading-relaxed">{PUBLIC_CLAIMS.whitepaper.purpose}</p>
      </section>

      {SECTIONS.map((section) => (
        <section key={section.title} className="mb-14">
          <h2 className="text-2xl font-bold text-white mb-5 border-l-4 border-gold pl-4">
            {section.title}
          </h2>
          <div className="space-y-4 text-text leading-relaxed">
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </div>
        </section>
      ))}

      <section className="rounded-xl border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">有方法或資料問題？</h2>
        <p className="text-text-muted mb-6 max-w-xl mx-auto">
          如果你發現盤面與其他來源不同，請附上輸入資料、曆法與比較來源；客服會協助釐清設定差異。
        </p>
        <a
          href="mailto:support@jianyuan.life?subject=排盤方法與資料限制"
          className="inline-block px-8 py-3 rounded-full bg-gold text-dark font-semibold hover:opacity-90 transition"
        >
          聯繫客服
        </a>
      </section>

      <div className="mt-16 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-text-muted border-t border-white/10 pt-8">
        <Link href="/" className="hover:text-gold transition">返回首頁</Link>
        <Link href="/faq" className="hover:text-gold transition">查看常見問題</Link>
        <Link href="/blog" className="hover:text-gold transition">研究文章</Link>
      </div>
    </article>
  )
}
