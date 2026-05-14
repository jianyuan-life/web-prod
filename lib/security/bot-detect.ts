// v5.10.324 (P0 #3 Bot Defense)
// 統一 bot UA 偵測 — middleware / robots.ts / API guard 共用
// 依據:Cloudflare Radar 2026 Bot 報告 + Vercel Bot ID best practices(2026-05-14)
// 三類處理:① 良性 SEO bot 放行(Google/Bing/Yandex/DuckDuckGo)
//          ② AI 訓練 bot 預設拒(GPTBot/ClaudeBot/Bytespider/PerplexityBot/ChatGPT-User)
//          ③ 攻擊型 bot 直接 403(Headless Chrome/PhantomJS/Selenium/HTTPie scanners)

export interface BotMatch {
  hit: boolean
  category: 'seo' | 'ai-scraper' | 'attacker' | 'unknown'
  name: string
  /** 是否允許訪問(true = 放行;false = 阻擋) */
  allow: boolean
}

// ① 良性搜尋引擎(允許索引、不阻擋)
const SEO_BOTS = [
  'Googlebot', 'AdsBot-Google', 'Mediapartners-Google',
  'Bingbot', 'YandexBot', 'DuckDuckBot', 'Baiduspider',
  'Slurp', 'facebookexternalhit', 'Twitterbot', 'LinkedInBot',
  'WhatsApp', 'Discordbot', 'Applebot', 'PetalBot',
]

// ② AI 訓練爬蟲(預設阻擋 — 客戶付費生成的命理內容不該被免費訓練)
const AI_SCRAPERS = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot',
  'ClaudeBot', 'anthropic-ai', 'Claude-Web',
  'PerplexityBot', 'Perplexity-User',
  'Bytespider', 'ByteDance',
  'CCBot', 'Common Crawl',
  'Google-Extended', 'GoogleOther',
  'Diffbot', 'AwarioBot',
  'cohere-ai', 'omgilibot', 'omgili',
  'YouBot', 'Amazonbot', 'Applebot-Extended',
]

// ③ 攻擊型 / headless / scanning tool(完全 403)
const ATTACKER_PATTERNS = [
  /HeadlessChrome/i,
  /PhantomJS/i,
  /Selenium/i,
  /python-requests/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bhttpie\b/i,
  /\bGo-http-client\b/i,
  /\bnikto\b/i,
  /\bsqlmap\b/i,
  /\bnmap\b/i,
  /\bmasscan\b/i,
  /\bnuclei\b/i,
  /\bzgrab\b/i,
  /\bAcunetix\b/i,
  /\bNessus\b/i,
  /\bwpscan\b/i,
]

/**
 * 分析 User-Agent、回傳 bot 分類 + 是否允許
 *
 * 預設策略:
 * - SEO bot → 允許(走 robots.txt 規則、僅索引白名單路徑)
 * - AI 訓練 bot → 阻擋(避免被吸走內容、影響 SEO + 商業價值)
 * - 攻擊型 bot → 阻擋(headless / scanner / pen-test tool)
 * - 空 UA / 預設 → 視為 unknown、放行但記錄(後續可加每秒節流)
 */
export function classifyUserAgent(ua: string | null | undefined): BotMatch {
  if (!ua || ua.trim() === '') {
    // 空 UA 多半為攻擊腳本(正常瀏覽器都有)、但留個觀察期、僅標記
    return { hit: false, category: 'unknown', name: 'empty-ua', allow: true }
  }

  // 攻擊型優先檢查(優先級最高)
  for (const pattern of ATTACKER_PATTERNS) {
    if (pattern.test(ua)) {
      return { hit: true, category: 'attacker', name: pattern.source, allow: false }
    }
  }

  // AI scraper(命中即拒)
  for (const name of AI_SCRAPERS) {
    if (ua.toLowerCase().includes(name.toLowerCase())) {
      return { hit: true, category: 'ai-scraper', name, allow: false }
    }
  }

  // SEO bot(放行)
  for (const name of SEO_BOTS) {
    if (ua.toLowerCase().includes(name.toLowerCase())) {
      return { hit: true, category: 'seo', name, allow: true }
    }
  }

  return { hit: false, category: 'unknown', name: 'browser', allow: true }
}

/**
 * 取得 User-Agent classification 的快速 boolean(middleware 用)
 */
export function shouldBlockUserAgent(ua: string | null | undefined): boolean {
  const result = classifyUserAgent(ua)
  return result.hit && !result.allow
}

/**
 * 給 robots.ts 使用的 disallow 模式 generator
 */
export function getRobotsDisallowList(): Array<{ userAgent: string; disallow: string[] }> {
  return AI_SCRAPERS.map((name) => ({
    userAgent: name,
    disallow: ['/'],
  }))
}
