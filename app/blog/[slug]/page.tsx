import Link from 'next/link'
import { BLOG_POSTS, getPostBySlug } from '@/lib/blog'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import DOMPurify from 'isomorphic-dompurify'

// v5.3.41 XSS 防護：blog 內文走 markdown → HTML 管線，雖目前來源可信
// 但預留 sanitize 防未來接入 CMS / 第三方投稿時被 Prompt Injection 入侵
const BLOG_SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'p','h1','h2','h3','h4','h5','h6','strong','em','u','s','ul','ol','li',
    'a','br','hr','blockquote','table','thead','tbody','tr','th','td',
    'code','pre','span','div','b','i','sup','sub','img',
  ],
  ALLOWED_ATTR: ['href','target','rel','class','id','style','colspan','rowspan','align','src','alt','width','height','loading'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script','iframe','object','embed','form','input','button','link','meta','style'],
  FORBID_ATTR: ['onerror','onload','onclick','onmouseover','onfocus','onblur','onsubmit','formaction'],
}

// SSG — 預先生成所有文章頁面
export function generateStaticParams() {
  return BLOG_POSTS.map(p => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) return { title: '文章不存在' }
  return {
    title: `${post.title} — 鑒源 JianYuan`,
    description: post.description,
    keywords: post.keywords.join(', '),
    alternates: { canonical: `https://jianyuan.life/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.description,
      url: `https://jianyuan.life/blog/${slug}`,
      type: 'article',
      publishedTime: post.date,
      authors: [post.author],
    },
  }
}

// 簡易 Markdown → HTML（處理 ##、**、|表格|、列表）
function renderMarkdown(md: string) {
  const lines = md.split('\n')
  const html: string[] = []
  let inTable = false
  let tableRows: string[] = []

  function flushTable() {
    if (!tableRows.length) return
    const rows = tableRows.filter(r => !r.match(/^\|[\s:-]+\|$/))
    if (rows.length > 0) {
      html.push('<div class="overflow-x-auto my-6"><table class="w-full text-sm">')
      rows.forEach((row, i) => {
        const cells = row.split('|').filter(Boolean).map(c => c.trim())
        const tag = i === 0 ? 'th' : 'td'
        const cls = i === 0 ? 'class="text-left text-gold/80 font-semibold py-2 px-3 border-b border-gold/10"' : 'class="py-2 px-3 border-b border-white/5 text-text-muted"'
        html.push(`<tr>${cells.map(c => `<${tag} ${cls}>${formatInline(c)}</${tag}>`).join('')}</tr>`)
      })
      html.push('</table></div>')
    }
    tableRows = []
    inTable = false
  }

  function formatInline(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong class="text-cream font-semibold">$1</strong>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" class="text-gold hover:underline">$1</a>')
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // 表格行
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      if (!inTable) inTable = true
      tableRows.push(trimmed)
      continue
    } else if (inTable) {
      flushTable()
    }

    if (!trimmed) {
      html.push('')
      continue
    }

    // H2
    if (trimmed.startsWith('## ')) {
      html.push(`<h2 class="text-xl font-bold text-cream mt-10 mb-4 pb-2 border-b border-gold/10" style="font-family:var(--font-sans)">${formatInline(trimmed.slice(3))}</h2>`)
      continue
    }

    // 列表
    if (trimmed.startsWith('- ')) {
      html.push(`<li class="text-text-muted leading-relaxed ml-4 mb-1">${formatInline(trimmed.slice(2))}</li>`)
      continue
    }

    // 普通段落
    html.push(`<p class="text-text leading-[2] mb-4">${formatInline(trimmed)}</p>`)
  }
  if (inTable) flushTable()
  return html.join('\n')
}

export default async function BlogArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = getPostBySlug(slug)
  if (!post) notFound()

  // FAQPage JSON-LD（從文章 FAQ 段落提取）
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [] as { '@type': string; name: string; acceptedAnswer: { '@type': string; text: string } }[],
  }
  // 嘗試從 content 提取 FAQ
  const faqMatches = post.content.matchAll(/### (.+?)\n\n([\s\S]+?)(?=\n\n###|\n\n##|$)/g)
  for (const match of faqMatches) {
    faqSchema.mainEntity.push({
      '@type': 'Question',
      name: match[1].trim(),
      acceptedAnswer: { '@type': 'Answer', text: match[2].trim().replace(/\n/g, ' ') },
    })
  }

  // Article JSON-LD
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { '@type': 'Organization', name: post.author },
    publisher: { '@type': 'Organization', name: '鑒源 JianYuan', url: 'https://jianyuan.life' },
  }

  const contentHtml = DOMPurify.sanitize(renderMarkdown(post.content), BLOG_SANITIZE_CONFIG)

  return (
    <div className="min-h-screen pt-24 pb-16">
      {/* JSON-LD */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      {faqSchema.mainEntity.length > 0 && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      )}

      <article className="max-w-3xl mx-auto px-6">
        {/* 標頭 */}
        <div className="mb-10">
          <Link href="/blog" className="text-xs text-text-muted hover:text-gold transition-colors mb-4 inline-block">
            &larr; 返回文章列表
          </Link>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[10px] px-2.5 py-1 rounded-full bg-gold/15 text-gold font-medium">{post.category}</span>
            <span className="text-[11px] text-text-muted">{post.date}</span>
            <span className="text-[11px] text-text-muted">{post.readingTime} 分鐘閱讀</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-cream leading-[1.4] mb-4" style={{ fontFamily: 'var(--font-sans)' }}>
            {post.title}
          </h1>
          <p className="text-text-muted leading-relaxed">{post.description}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {post.keywords.map(kw => (
              <span key={kw} className="text-[10px] text-text-muted/60 bg-white/5 px-2 py-0.5 rounded">{kw}</span>
            ))}
          </div>
        </div>

        {/* 內文 */}
        <div className="prose-dark" dangerouslySetInnerHTML={{ __html: contentHtml }} />

        {/* CTA */}
        <div className="mt-14 glass rounded-2xl p-8 text-center">
          <h2 className="text-xl text-cream mb-3" style={{ fontFamily: 'var(--font-sans)' }}>
            想更深入了解自己的命格？
          </h2>
          <p className="text-sm text-text-muted mb-6 max-w-md mx-auto">
            免費速算工具，30 秒看到你的基本命格。想要完整分析，人生藍圖用 15 套系統交叉驗證。
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/tools/bazi" className="px-6 py-3 bg-gold text-dark font-bold rounded-lg text-sm btn-glow">
              免費八字速算
            </Link>
            <Link href="/pricing" className="px-6 py-3 glass text-cream font-semibold rounded-lg text-sm hover:bg-surface-hover transition-colors">
              查看完整方案
            </Link>
          </div>
        </div>

        {/* 相關文章 */}
        <div className="mt-12">
          <h3 className="text-lg text-cream mb-4" style={{ fontFamily: 'var(--font-sans)' }}>延伸閱讀</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {BLOG_POSTS.filter(p => p.slug !== post.slug).slice(0, 4).map(p => (
              <Link key={p.slug} href={`/blog/${p.slug}`}
                className="glass rounded-xl p-4 group hover:-translate-y-0.5 transition-all">
                <span className="text-[10px] text-gold/60">{p.category}</span>
                <h4 className="text-sm text-cream group-hover:text-gold transition-colors mt-1 line-clamp-2">{p.title}</h4>
                <span className="text-[10px] text-text-muted mt-2 block">{p.readingTime} 分鐘</span>
              </Link>
            ))}
          </div>
        </div>
      </article>
    </div>
  )
}
