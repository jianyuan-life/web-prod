import { withWorkflow } from 'workflow/next'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // 生產環境不暴露 Source Maps（防止原始碼被查看）
  productionBrowserSourceMaps: false,
  // 舊路由 301 重導
  async redirects() {
    return [
      { source: '/free-tools', destination: '/tools/bazi', permanent: true },
      { source: '/login', destination: '/auth/login', permanent: true },
      { source: '/register', destination: '/auth/signup', permanent: true },
      { source: '/about', destination: '/#about', permanent: false },
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

  // 上市櫃等級安全標頭
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://www.google-analytics.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https: blob:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co https://api.stripe.com https://*.fly.dev https://www.google-analytics.com https://www.googletagmanager.com https://www.google.com https://www.facebook.com https://static.cloudflareinsights.com; frame-src https://js.stripe.com https://hooks.stripe.com;" },
        ],
      },
    ]
  },
}

export default withWorkflow(nextConfig)
