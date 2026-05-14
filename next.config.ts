import { withWorkflow } from 'workflow/next'
import bundleAnalyzer from '@next/bundle-analyzer'
import type { NextConfig } from 'next'

// v5.10.327:bundle 分析(用 ANALYZE=true npm run build 觸發、不影響日常 build)
const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
  openAnalyzer: false, // CI 環境不開瀏覽器
})

const nextConfig: NextConfig = {
  // 生產環境不暴露 Source Maps(防止原始碼被查看)
  productionBrowserSourceMaps: false,
  // v5.10.324(P0 perf):啟用 compress + reactStrictMode + 移除 X-Powered-By
  compress: true,
  reactStrictMode: true,
  poweredByHeader: false,
  // v5.10.329 註解保留:Server Taint API(`experimental.taint`)在 Next.js 16.2.6 行為待 Vercel
  // 官方驗證、暫不啟用、Sprint 5 重新測試後再加。Gemini grounding #3 改善項保留 todo。
  // 舊路由 301 重導
  async redirects() {
    return [
      { source: '/free-tools', destination: '/tools/bazi', permanent: true },
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/register', destination: '/auth/signup', permanent: true },
      // v5.6.10 R4 移除:/about → /#about(原導首頁 anchor、現有獨立 /about 頁)
    ]
  },

  // Python API 代理
  async rewrites() {
    return [
      {
        source: '/api/engine/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/:path*`,
      },
    ]
  },

  // v5.10.324 上市櫃等級安全標頭(P0 #4 強化)
  // 改動:
  //   1. 新增 COOP / CORP(防 Spectre 跨來源攻擊 + 防 Tab 共享 process)
  //   2. 新增 Cross-Origin-Resource-Policy(防其他站直接 embed 我方圖片 / JSON)
  //   3. CSP 加 base-uri + form-action + frame-ancestors + upgrade-insecure-requests
  //   4. 新增 Permissions-Policy 完整 ban list(13 個 sensitive API 全關)
  //   5. Cache-Control 對靜態資源優化(無 Service Worker、依賴 CDN cache)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // 抗 clickjacking
          { key: 'X-Frame-Options', value: 'DENY' },
          // 阻止 MIME sniffing
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // 跨來源 referer 政策
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // 完整 Permissions-Policy ban list — 13 個 API 全關、降低瀏覽器指紋面
          {
            key: 'Permissions-Policy',
            value: [
              'camera=()',
              'microphone=()',
              'geolocation=()',
              'payment=(self "https://js.stripe.com")',
              'usb=()',
              'magnetometer=()',
              'gyroscope=()',
              'accelerometer=()',
              'midi=()',
              'sync-xhr=(self)',
              'fullscreen=(self)',
              'picture-in-picture=()',
              'interest-cohort=()',
            ].join(', '),
          },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          // HSTS 2 年 + preload
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          // v5.10.324:Cross-Origin-Opener-Policy(防 Spectre + Tab 共 process 攻擊)
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          // Cross-Origin-Resource-Policy(防別站 hotlink 圖片 / JSON)
          { key: 'Cross-Origin-Resource-Policy', value: 'same-site' },
          // 強化 CSP:
          //   - base-uri 'self':防 <base href> 被注入劫持 relative URL
          //   - form-action:限定表單只能送回自家 + Stripe
          //   - frame-ancestors 'none':等同 X-Frame-Options DENY(雙保險)
          //   - upgrade-insecure-requests:自動把 http:// 升 https://
          //   - object-src 'none':禁 <object>/<embed>(Flash 等舊插件已死)
          //   - script-src 仍含 'unsafe-inline'(FB Pixel + GA4 + DevTools warning)— Sprint 2 改 nonce
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://www.google-analytics.com https://static.cloudflareinsights.com https://va.vercel-scripts.com https://vitals.vercel-insights.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https: blob:",
              "font-src 'self' https://fonts.gstatic.com data:",
              "connect-src 'self' https://*.supabase.co https://api.stripe.com https://*.fly.dev https://www.google-analytics.com https://www.googletagmanager.com https://www.google.com https://www.facebook.com https://static.cloudflareinsights.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://vercel.live",
              "frame-src https://js.stripe.com https://hooks.stripe.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://checkout.stripe.com",
              "object-src 'none'",
              "manifest-src 'self'",
              "worker-src 'self' blob:",
              'upgrade-insecure-requests',
              // v5.10.325(P0 #4 第二步):violation 報告自動 POST 到 /api/csp-report
              "report-uri /api/csp-report",
              "report-to csp-endpoint",
            ].join('; '),
          },
          // v5.10.330(Sprint 5):Content-Security-Policy-Report-Only — 嚴格版 CSP 試跑
          // 這條不會 enforce、只蒐集 violation 進 /api/csp-report
          // 觀察 1-2 週後若無大量真實流量誤報、把這條規則升 enforced + 移現有 unsafe-inline
          {
            key: 'Content-Security-Policy-Report-Only',
            value: [
              "default-src 'self'",
              // 嚴格版:只允許 hash 的 inline + 外部 SRI script、移 unsafe-inline 試跑
              "script-src 'self' 'strict-dynamic' https: https://www.googletagmanager.com https://connect.facebook.net https://va.vercel-scripts.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https: blob:",
              "font-src 'self' https://fonts.gstatic.com data:",
              "connect-src 'self' https://*.supabase.co https://api.stripe.com https://*.fly.dev https://www.google-analytics.com https://www.googletagmanager.com https://www.facebook.com https://va.vercel-scripts.com https://vitals.vercel-insights.com https://vercel.live",
              "frame-src https://js.stripe.com https://hooks.stripe.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://checkout.stripe.com",
              "object-src 'none'",
              "report-uri /api/csp-report",
            ].join('; '),
          },
          // v5.10.325:Reporting-Endpoints(現代瀏覽器、配合 CSP report-to)
          {
            key: 'Reporting-Endpoints',
            value: 'csp-endpoint="/api/csp-report"',
          },
        ],
      },
      // v5.10.324:靜態資源強 CDN cache(font/image/script 一年 immutable)
      {
        source: '/scripts/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/fonts/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ]
  },
}

export default withWorkflow(withBundleAnalyzer(nextConfig))
