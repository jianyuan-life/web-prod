import type { MetadataRoute } from 'next'

/**
 * v5.10.324(P0 #3 Bot Defense — robots.txt 強化)
 *
 * 三層 bot policy:
 * ① 一般爬蟲(*) :索引首頁 / 行銷頁、私密路徑全 disallow
 * ② AI 訓練爬蟲:全站 disallow(GPTBot / ClaudeBot / Bytespider / Perplexity 等)
 * ③ Search bot(Google/Bing):跟一般爬蟲同 policy、走 sitemap
 *
 * 注意:robots.txt 是「君子協議」、惡意 bot 不會遵守;
 * 真正阻擋靠 middleware.ts 的 UA classifier(`lib/security/bot-detect.ts`)。
 *
 * 對應 lib/security/bot-detect.ts AI_SCRAPERS 清單。
 */
export default function robots(): MetadataRoute.Robots {
  // 私密路徑(任何爬蟲都不該索引)
  const PRIVATE_PATHS = [
    '/api/',
    '/jamie/',
    '/dashboard/',
    '/auth/',
    '/report/', // 客戶專屬報告(含 access_token、絕不可被索引)
    '/checkout', // 結帳頁可能含 session_id
  ]

  // AI 訓練爬蟲完整清單(對齊 lib/security/bot-detect.ts)
  const AI_SCRAPERS = [
    'GPTBot',
    'ChatGPT-User',
    'OAI-SearchBot',
    'ClaudeBot',
    'anthropic-ai',
    'Claude-Web',
    'PerplexityBot',
    'Perplexity-User',
    'Bytespider',
    'ByteDance',
    'CCBot',
    'Google-Extended',
    'GoogleOther',
    'Diffbot',
    'AwarioBot',
    'cohere-ai',
    'omgilibot',
    'omgili',
    'YouBot',
    'Amazonbot',
    'Applebot-Extended',
  ]

  return {
    rules: [
      // 一般爬蟲規則(*)— 允許首頁等公開路徑、disallow 私密
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS,
        crawlDelay: 5, // 5 秒節流、降低 SEO crawler 負荷
      },
      // AI 訓練 bot — 全站拒絕(不希望被吸去訓練模型 / 影響 SEO)
      ...AI_SCRAPERS.map((bot) => ({
        userAgent: bot,
        disallow: ['/'],
      })),
    ],
    sitemap: 'https://jianyuan.life/sitemap.xml',
    host: 'https://jianyuan.life',
  }
}
