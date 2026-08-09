import type { Metadata } from 'next'
import pkg from '../package.json'
import Link from 'next/link'
import Image from 'next/image'
import Script from 'next/script'
import WebVitalsReporter from '@/components/WebVitalsReporter'
import PrivacySafeVercelTelemetry from '@/components/PrivacySafeVercelTelemetry'
import LocaleContent from '@/components/LocaleContent'
import Tracker from '@/components/Tracker'
import ReferralHandler from '@/components/ReferralHandler'
import RouteChrome from '@/components/RouteChrome'
import EmailLink from '@/components/EmailLink'
import CookieConsent from '@/components/CookieConsent'
import { GlobalToastProvider } from '@/components/report/shared/GlobalToast'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ThemeLanguageSettings } from '@/components/ThemeLanguageSettings'
import { FirstVisitWarmBanner } from '@/components/FirstVisitWarmBanner'
import './globals.css'
import './presentation.css'

// T16 v5.10.363(L4 Gemini Vision mobile 修):viewport export
// 原 audit:layout.tsx 缺 viewport export、iOS Safari notch 區可能渲染錯
// Next.js 14+ 標準 export const viewport
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,  // 允許 zoom in、a11y(WCAG 1.4.4)
  userScalable: true,
  viewportFit: 'cover' as const,  // iPhone notch 區 safe-area-inset 可用
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0a0e1a' },
    { media: '(prefers-color-scheme: light)', color: '#0a0e1a' },  // 鑒源純暗主題
  ],
}

export const metadata: Metadata = {
  title: {
    default: '鑒源 JianYuan — 十四大命理系統精準分析',
    template: '%s | 鑒源 JianYuan',
  },
  description: '鑒源整合八字、紫微斗數、奇門遁甲、西洋占星等最多十四大命理系統，以 44,421+ 條古籍規則交叉分析，為您提供性格天賦、事業財運、感情婚姻的完整命格報告。',
  keywords: '鑒源, JianYuan, 八字, 紫微斗數, 奇門遁甲, 西洋占星, 命理分析, 命格分析, 命盤, 算命, 姓名學, 風水, 出門訣, 人類圖, 吠陀占星, 運勢',
  metadataBase: new URL('https://jianyuan.life'),
  openGraph: {
    title: '鑒源 JianYuan — 十四大命理系統精準分析',
    description: '整合東西方十四大命理系統，一份報告看清性格天賦、事業方向、感情運勢。免費體驗，不需註冊。',
    url: 'https://jianyuan.life',
    siteName: '鑒源 JianYuan',
    type: 'website',
    locale: 'zh_TW',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: '鑒源 JianYuan — 十四大命理系統精準分析' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '鑒源 JianYuan — 十四大命理系統精準分析',
    description: '整合東西方十四大命理系統，一份報告看清性格天賦、事業方向、感情運勢。',
    images: ['/og-default.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://jianyuan.life',
  },
}

// v5.10.335 註解:CSP nonce stage 2 嘗試 async + headers() 讓全站變 dynamic、SSG 全失
// 已 revert、保留 middleware 端 nonce 生成、Sprint 6 改用 per-page dynamic + edge runtime 方案再上
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" suppressHydrationWarning>
      <head>
        {/* v5.10.395 Warm Light Theme v1.1 — SSR no-flash + R8 localStorage migration
            必須在 ThemeProvider hydrate 前執行、避免閃爍
            規格:tasks/spec_ui_warm_light_theme_2026-05-16_v1.md §4.1 §4.5
            L4 Gemini Round 3 P2:fallback 用 prefers-color-scheme detect、不寫死 dark
            L2 IA Round 1 P0-3:既有 R8 'jy_report_theme_v1' key 一次性遷移 */}
        {/* v5.10.408:/report/* 首繪即鎖 dark(對齊 ThemeProvider forcedTheme、避免 light→dark 閃爍)*/}
        <script
          dangerouslySetInnerHTML={{
            __html: "(function(){try{var O='jy_report_theme_v1',N='theme',o=localStorage.getItem(O);if(o&&!localStorage.getItem(N)){localStorage.setItem(N,o);}if(location.pathname.indexOf('/report/')===0){document.documentElement.setAttribute('data-theme','dark');var vm=localStorage.getItem('jy_report_view_mode_v1');document.documentElement.setAttribute('data-view-mode',vm==='expert'?'expert':'simple');return;}var t=localStorage.getItem(N),pd=window.matchMedia('(prefers-color-scheme: dark)').matches,th=(t==='light'||t==='dark')?t:(pd?'dark':'light');document.documentElement.setAttribute('data-theme',th);}catch(e){if(location.pathname.indexOf('/report/')===0){document.documentElement.setAttribute('data-theme','dark');return;}var fd=window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.setAttribute('data-theme',fd?'dark':'light');}})();",
          }}
        />
        {/* v5.10.326 perf:預連線關鍵第三方來源 — 縮短 TLS handshake / DNS 解析時間
            節省 LCP 100-300ms(尤其 mobile 3G/4G、handshake 高延遲)*/}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Noto+Sans+SC:wght@400;500;700&family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+SC:wght@400;500;600;700&family=Noto+Serif+TC:wght@400;500;600;700&display=swap"
        />
        <link rel="dns-prefetch" href="https://js.stripe.com" />
        {/* v5.10.329 (Sprint 5 Gemini #2):Speculation Rules API — 邊緣預渲染熱門頁
            預期 LCP 改善 200-500ms(/pricing /about /blog /faq 為熱門 entry point)
            參考:https://developer.chrome.com/docs/web-platform/prerender-pages */}
        <script
          type="speculationrules"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              prerender: [
                {
                  source: 'list',
                  urls: ['/pricing', '/about', '/faq', '/blog', '/whitepaper'],
                },
                {
                  source: 'document',
                  where: {
                    and: [
                      { href_matches: '/*' },
                      { not: { href_matches: '/api/*' } },
                      { not: { href_matches: '/jamie/*' } },
                      { not: { href_matches: '/dashboard*' } },
                      { not: { href_matches: '/auth/*' } },
                      { not: { href_matches: '/report/*' } },
                      { not: { href_matches: '/consultation/*' } },
                      { not: { href_matches: '/checkout*' } },
                    ],
                  },
                  eagerness: 'moderate', // hover/touchstart 才預渲染、不浪費 bandwidth
                },
              ],
              // v5.10.341(Codex round 2 P2 #2 修):prefetch 也排除私密路徑、防資源洩露
              prefetch: [
                {
                  source: 'document',
                  where: {
                    and: [
                      { href_matches: '/*' },
                      { not: { href_matches: '/api/*' } },
                      { not: { href_matches: '/jamie/*' } },
                      { not: { href_matches: '/dashboard*' } },
                      { not: { href_matches: '/auth/*' } },
                      { not: { href_matches: '/report/*' } },
                      { not: { href_matches: '/consultation/*' } },
                      { not: { href_matches: '/checkout*' } },
                    ],
                  },
                  eagerness: 'conservative', // 只在 link 進 viewport 才 prefetch
                },
              ],
            }),
          }}
        />
        {/* isPrivateConsultationPath gating and consent checks live in the
            client-only telemetry loader. Server HTML emits no tracking tags. */}
        {/* v5.10.330（Sprint 5 Gemini #1 SRI）：加 sha384 integrity 雜湊 + crossOrigin
            自家 script 安全（不會自動更新）;Stripe.js 因官方禁 SRI、不加（v3 自動更新防詐欺）*/}
        <Script
          src="/scripts/devtools-warning.js"
          strategy="afterInteractive"
          integrity="sha384-hgWUa8k2HeySWRM7yHSOg8IhOXYJL7C+T/qI5j6MI7rkNtBiFb3o2LQId4Cv0fFx"
          crossOrigin="anonymous"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'WebApplication',
                  name: '鑒源 JianYuan',
                  url: 'https://jianyuan.life',
                  description: '整合東西方十四大命理系統精準交叉驗證的命格分析平台',
                  applicationCategory: 'LifestyleApplication',
                  operatingSystem: 'Web',
                  offers: {
                    '@type': 'AggregateOffer',
                    lowPrice: '59',
                    highPrice: '89',
                    priceCurrency: 'USD',
                    offerCount: '3',
                  },
                },
                {
                  '@type': 'Organization',
                  name: '鑒源 JianYuan',
                  url: 'https://jianyuan.life',
                  email: 'support@jianyuan.life',
                  logo: 'https://jianyuan.life/logo-jianyuan.png',
                  sameAs: [],
                },
              ],
            }),
          }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {/* v5.10.423 a11y(skill §1 skip-links):鍵盤用戶 Tab 第一下即可跳過導航直達正文 */}
        <a href="#main-content" className="skip-link">跳至主要內容</a>
        <Tracker />
        <ReferralHandler />
        <CookieConsent />
        {/* v5.10.395 Warm Light Theme v1.1 — ThemeProvider 包整 app(對齊 inline script 同 data-theme attr)
            預設 system + R8 localStorage 已由 inline script 遷移到 'theme' key */}
        <ThemeProvider>
        {/* v5.10.250 wire dead component:GlobalToastProvider 包整 app、開放 useToast() 全域可用 */}
        <GlobalToastProvider>
        <LocaleContent>
        <RouteChrome
          beforeMain={process.env.NEXT_PUBLIC_FF_WARM_LIGHT_THEME === 'true' && <FirstVisitWarmBanner />}
          footer={<footer className="jy-footer">
          {/* 英文/簡體翻譯覆蓋範圍：v5.3.95 起 footer 納入 LocaleContent */}
          <div className="jy-footer__inner">
            {/* 古典分隔裝飾 */}
            <div className="text-center mb-10">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="h-12 w-12 rounded-full overflow-hidden" style={{ background: '#0a0e1a', border: '1px solid rgba(201,168,76,0.3)' }}>
                  <img src="/logo-jianyuan.png?v=14" alt="鑒源" className="h-full w-full" />
                </div>
                <div className="flex flex-col">
                  <span className="text-gold font-serif text-xl font-semibold tracking-[4px]">鑒源</span>
                  <span className="jy-footer__latin">JIANYUAN</span>
                </div>
              </div>
              <p className="text-base text-text-muted font-medium tracking-wider">回到源頭 &middot; 看清本質</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
              <div>
                <h2 className="text-gold/80 font-semibold mb-3">命理服務</h2>
                <div className="space-y-2 text-text-muted">
                  <Link href="/tools/bazi" className="flex items-center min-h-[44px] md:block md:min-h-0 hover:text-gold transition-colors">免費命理速算</Link>
                  <Link href="/pricing" className="flex items-center min-h-[44px] md:block md:min-h-0 hover:text-gold transition-colors">方案與定價</Link>
                </div>
              </div>
              <div>
                <h2 className="text-gold/80 font-semibold mb-3">了解更多</h2>
                <div className="space-y-2 text-text-muted">
                  <Link href="/#systems" className="flex items-center min-h-[44px] md:block md:min-h-0 hover:text-gold transition-colors">十四大系統</Link>
                  <Link href="/#how" className="flex items-center min-h-[44px] md:block md:min-h-0 hover:text-gold transition-colors">分析流程</Link>
                  <Link href="/blog" className="flex items-center min-h-[44px] md:block md:min-h-0 hover:text-gold transition-colors">命理知識</Link>
                  <Link href="/about" className="flex items-center min-h-[44px] md:block md:min-h-0 hover:text-gold transition-colors">關於鑒源</Link>
                  <Link href="/whitepaper" className="flex items-center min-h-[44px] md:block md:min-h-0 hover:text-gold transition-colors">技術白皮書</Link>
                  <Link href="/faq" className="flex items-center min-h-[44px] md:block md:min-h-0 hover:text-gold transition-colors">常見問題</Link>
                </div>
              </div>
              <div>
                <h2 className="text-gold/80 font-semibold mb-3">法律條款</h2>
                <div className="space-y-2 text-text-muted">
                  <Link href="/privacy" className="flex items-center min-h-[44px] md:block md:min-h-0 hover:text-gold transition-colors">隱私政策</Link>
                  <Link href="/terms" className="flex items-center min-h-[44px] md:block md:min-h-0 hover:text-gold transition-colors">使用條款</Link>
                </div>
              </div>
              <div>
                <h2 className="text-gold/80 font-semibold mb-3">聯繫我們</h2>
                <EmailLink className="inline-flex items-center min-h-[44px] md:min-h-0 text-text-muted hover:text-gold transition-colors" />
              </div>
            </div>
            <div className="mt-12 pt-8 border-t border-gold/5 text-center text-xs text-text-muted/60">
              <p>本服務融合傳統命理學與現代科技，分析結果僅供參考，不構成任何醫療、投資或法律建議。</p>
              {/* P0-6（2026-04-17）：year 寫死防 hydration #418（server/client 跨時區年份差異會觸發 React #418 text mismatch，suppressHydrationWarning 只擋 warning 擋不住 error） */}
              <p className="mt-2">&copy; 2026 鑒源 JianYuan. 版權所有 &middot; v{pkg.version}</p>
            </div>

            {/* v5.10.395 Warm Light Theme v1.1 — Footer 完整 theme + language settings(FF 控制)*/}
            {process.env.NEXT_PUBLIC_FF_WARM_LIGHT_THEME === 'true' && <ThemeLanguageSettings />}
          </div>
          </footer>}
        >
          {children}
        </RouteChrome>
        </LocaleContent>
        </GlobalToastProvider>
        </ThemeProvider>
        {/* Google、Meta 與 Vercel telemetry 均由同一 client loader 進行路徑與同意檢查。 */}
        <PrivacySafeVercelTelemetry
          gaMeasurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}
          metaPixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID}
        />
        <WebVitalsReporter />
      </body>
    </html>
  )
}
