import Link from 'next/link'
import { BLOG_POSTS } from '@/lib/blog'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '命理知識 — 鑒源 JianYuan',
  description: '深入淺出的命理入門教學：八字、紫微斗數、姓名學、西洋占星。讓命理不再神秘，用白話文帶你看懂自己的命格。',
  keywords: '命理教學, 八字入門, 紫微斗數教學, 姓名學, 上升星座, 生肖運勢, 命理知識',
  alternates: { canonical: 'https://jianyuan.life/blog' },
  openGraph: {
    title: '命理知識 — 鑒源 JianYuan',
    description: '深入淺出的命理入門教學：八字、紫微斗數、姓名學、西洋占星。',
    url: 'https://jianyuan.life/blog',
    siteName: '鑒源 JianYuan',
    type: 'website',
    locale: 'zh_TW',
  },
}

const CATEGORY_COLORS: Record<string, string> = {
  '流年運勢': 'bg-red-400/15 text-red-300',
  '命理入門': 'bg-blue-400/15 text-blue-300',
}

export default function BlogListPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-4xl mx-auto px-6">
        {/* 標題 */}
        <div className="text-center mb-14">
          <div className="text-[11px] tracking-[0.25em] text-gold/50 mb-3">BLOG</div>
          <h1 className="text-3xl md:text-4xl text-cream mb-4" style={{ fontFamily: 'var(--font-sans)' }}>
            命理知識
          </h1>
          <p className="text-text-muted text-sm max-w-md mx-auto leading-relaxed">
            用白話文帶你看懂命理。從八字到紫微斗數，從姓名學到西洋占星，每篇文章都讓你離「理解自己」更近一步。
          </p>
        </div>

        {/* 文章列表 */}
        <div className="space-y-5">
          {BLOG_POSTS.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`}
              className="glass rounded-2xl p-6 md:p-8 block group transition-all hover:-translate-y-1">
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-[10px] px-2.5 py-1 rounded-full font-medium ${CATEGORY_COLORS[post.category] || 'bg-gold/15 text-gold'}`}>
                  {post.category}
                </span>
                <span className="text-[11px] text-text-muted">{post.date}</span>
                <span className="text-[11px] text-text-muted">{post.readingTime} 分鐘閱讀</span>
              </div>
              <h2 className="text-lg md:text-xl font-semibold text-cream group-hover:text-gold transition-colors mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
                {post.title}
              </h2>
              {/* v5.10.297:line-clamp-2 → 3、blog description 別 2 行斷重點、加 CJK keep-all */}
              <p
                className="text-sm text-text-muted leading-relaxed"
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'keep-all',
                  overflowWrap: 'break-word',
                }}
              >
                {post.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {post.keywords.slice(0, 4).map(kw => (
                  <span key={kw} className="text-[10px] text-text-muted/60 bg-white/5 px-2 py-0.5 rounded">
                    {kw}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <div className="glass rounded-2xl p-8 md:p-10">
            <h2 className="text-xl text-cream mb-3" style={{ fontFamily: 'var(--font-sans)' }}>
              讀了這麼多，不如親自體驗
            </h2>
            <p className="text-sm text-text-muted mb-6 max-w-md mx-auto">
              免費速算工具，30 秒看到你的基本命格。不需註冊，不需付費。
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/tools/bazi" className="px-6 py-3 bg-gold text-dark font-bold rounded-lg text-sm btn-glow">
                八字速算
              </Link>
              <Link href="/tools/ziwei" className="px-6 py-3 glass text-cream font-semibold rounded-lg text-sm hover:bg-surface-hover transition-colors">
                紫微速算
              </Link>
              <Link href="/tools/name" className="px-6 py-3 glass text-cream font-semibold rounded-lg text-sm hover:bg-surface-hover transition-colors">
                姓名鑑定
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
