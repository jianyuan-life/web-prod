import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // P0 隱私：報告頁 / API / 後台 / 儀表板 / 認證路徑全部 disallow
      disallow: [
        '/api/',
        '/jamie/',
        '/dashboard/',
        '/auth/',
        '/report/',          // 客戶專屬報告（含 access_token，絕不可被索引）
        '/checkout',         // 結帳頁可能含 session_id
      ],
    },
    sitemap: 'https://jianyuan.life/sitemap.xml',
  }
}
