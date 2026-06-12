import type { Metadata } from 'next'
import pkg from '../package.json'
import { Noto_Serif_TC, Noto_Sans_TC, Noto_Serif_SC, Noto_Sans_SC, Cinzel } from 'next/font/google'
import Link from 'next/link'
import Image from 'next/image'
import Script from 'next/script'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import WebVitalsReporter from '@/components/WebVitalsReporter'
import Navbar from '@/components/Navbar'
import LocaleContent from '@/components/LocaleContent'
import Tracker from '@/components/Tracker'
import ReferralHandler from '@/components/ReferralHandler'
import GlobalBackToTop from '@/components/GlobalBackToTop'
import EmailLink from '@/components/EmailLink'
import CookieConsent from '@/components/CookieConsent'
import { GlobalToastProvider } from '@/components/report/shared/GlobalToast'
import { ThemeProvider } from '@/components/ThemeProvider'
import { ThemeLanguageSettings } from '@/components/ThemeLanguageSettings'
import { FirstVisitWarmBanner } from '@/components/FirstVisitWarmBanner'
import './globals.css'

// v5.3.44 字型 variable 保留歷史命名（QA 稽核發現動了會破壞 200+ 處品牌標題視覺）
// --font-sans = Noto Serif TC（品牌 Serif，Logo/封面/大標題用）
// --font-body = Noto Sans TC（真 Sans，正文用；報告頁 CSS 顯式用 var(--font-body)）
// 命名違反直覺但不動，未來統一改名另開 Wave。
const notoSerif = Noto_Serif_TC({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' })
const notoSans = Noto_Sans_TC({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-body', display: 'swap' })
// 簡體中文字體（簡體模式時由 LocaleContent 切換 class）
// v5.10.253 P1 perf 修(本 session 補做):
//   - preload: false 防 server-side 強行 preload SC font(只 zh-TW 用戶不會看到簡體、白白下載 ~1MB)
//   - SC 字體只在 .lang-sc class 存在時才實際載入(瀏覽器懶載)
//   - 對應 home FCP 3964ms 改善目標(transfer 4239→3200 KiB 預期)
const notoSerifSC = Noto_Serif_SC({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans-sc', display: 'swap', preload: false })
const notoSansSC = Noto_Sans_SC({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-body-sc', display: 'swap', preload: false })
// v5.10.198 UI redesign Phase 2:Cinzel for display(英文 logo / Chapter numbers、Jamie 規格書 2.2 --font-display)
// v5.10.253 perf 修:weight 從 4 個減為 2 個(只用 500/700、其他 weight 0 引用)、節省 ~200 KiB
const cinzel = Cinzel({ subsets: ['latin'], weight: ['500', '700'], variable: '--font-display-google', display: 'swap' })

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
    <html lang="zh-TW" className={`${notoSerif.variable} ${notoSans.variable} ${notoSerifSC.variable} ${notoSansSC.variable} ${cinzel.variable}`} suppressHydrationWarning>
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
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.google-analytics.com" />
        <link rel="dns-prefetch" href="https://connect.facebook.net" />
        <link rel="dns-prefetch" href="https://js.stripe.com" />
        <link rel="dns-prefetch" href="https://va.vercel-scripts.com" />
        <link rel="dns-prefetch" href="https://vitals.vercel-insights.com" />
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
                      { not: { href_matches: '/checkout*' } },
                    ],
                  },
                  eagerness: 'conservative', // 只在 link 進 viewport 才 prefetch
                },
              ],
            }),
          }}
        />
        {/* Meta Pixel (Facebook Pixel) — 只在設定環境變數時載入 */}
        {process.env.NEXT_PUBLIC_META_PIXEL_ID && (
          <>
            <script
                  dangerouslySetInnerHTML={{
                __html: `
                  !function(f,b,e,v,n,t,s)
                  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                  n.queue=[];t=b.createElement(e);t.async=!0;
                  t.src=v;s=b.getElementsByTagName(e)[0];
                  s.parentNode.insertBefore(t,s)}(window, document,'script',
                  'https://connect.facebook.net/en_US/fbevents.js');
                  // v5.6.10 (Codex L3 fix):預設拒絕 Meta Pixel 收集(GDPR 對齊)
                  // 從 localStorage 讀已儲存偏好、若 marketing=true 則 grant、否則 revoke
                  try {
                    var stored = localStorage.getItem('jy_cookie_consent_v1');
                    var prefs = stored ? JSON.parse(stored) : null;
                    if (prefs && prefs.marketing) {
                      fbq('consent', 'grant');
                    } else {
                      fbq('consent', 'revoke');
                    }
                  } catch(e) { fbq('consent', 'revoke'); }
                  fbq('init', '${process.env.NEXT_PUBLIC_META_PIXEL_ID}');
                  fbq('track', 'PageView');
                `,
              }}
            />
            <noscript>
              <img
                height="1"
                width="1"
                style={{ display: 'none' }}
                src={`https://www.facebook.com/tr?id=${process.env.NEXT_PUBLIC_META_PIXEL_ID}&ev=PageView&noscript=1`}
                alt=""
              />
            </noscript>
          </>
        )}
        {/* Google Analytics 4 + Consent Mode v2 (v5.6.10 Round D:GDPR/ePrivacy 合規) */}
        {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && (
          <>
            {/* Consent Mode v2 預設 denied、等用戶點 banner 才升級為 granted */}
            <script
                  dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  // v5.6.10: GDPR / ePrivacy default consent state(歐盟訪客預設拒絕、需主動同意)
                  gtag('consent', 'default', {
                    'ad_storage': 'denied',
                    'ad_user_data': 'denied',
                    'ad_personalization': 'denied',
                    'analytics_storage': 'denied',
                    'functionality_storage': 'granted',
                    'security_storage': 'granted',
                    'wait_for_update': 500
                  });
                  // 若用戶已透過 banner 同意、從 localStorage 讀取偏好
                  try {
                    var stored = localStorage.getItem('jy_cookie_consent_v1');
                    if (stored) {
                      var prefs = JSON.parse(stored);
                      if (prefs.analytics) {
                        gtag('consent', 'update', { 'analytics_storage': 'granted' });
                      }
                      if (prefs.marketing) {
                        gtag('consent', 'update', {
                          'ad_storage': 'granted',
                          'ad_user_data': 'granted',
                          'ad_personalization': 'granted'
                        });
                      }
                    }
                  } catch(e) {}
                  gtag('js', new Date());
                  gtag('config', '${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}', {
                    page_path: window.location.pathname,
                  });
                `,
              }}
            />
            <script
              async
                  src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}`}
            />
          </>
        )}
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
                    lowPrice: '29',
                    highPrice: '279',
                    priceCurrency: 'USD',
                    offerCount: '8',
                  },
                },
                {
                  '@type': 'Organization',
                  name: '鑒源 JianYuan',
                  url: 'https://jianyuan.life',
                  email: 'support@jianyuan.life',
                  logo: 'https://jianyuan.life/logo-jianyuan.svg',
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
        <Navbar />
        {process.env.NEXT_PUBLIC_FF_WARM_LIGHT_THEME === 'true' && <FirstVisitWarmBanner />}
        <main id="main-content" className="pt-16">{children}</main>
        <GlobalBackToTop />
        <footer className="border-t border-gold/10 mt-20">
          {/* 英文/簡體翻譯覆蓋範圍：v5.3.95 起 footer 納入 LocaleContent */}
          <div className="max-w-6xl mx-auto px-6 py-16">
            {/* 古典分隔裝飾 */}
            <div className="text-center mb-10">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="h-12 w-12 rounded-full overflow-hidden" style={{ background: '#0a0e1a', border: '1px solid rgba(201,168,76,0.3)' }}>
                  <img src="/logo-jianyuan.svg?v=12" alt="鑒源" className="h-full w-full" />
                </div>
                <div className="flex flex-col">
                  <span className="text-gold font-serif text-xl font-semibold tracking-[4px]">鑒源</span>
                  <span className="text-gold/40 text-[9px] tracking-[3px]">JIANYUAN</span>
                </div>
              </div>
              <p className="text-base text-text-muted font-medium tracking-wider">回到源頭 &middot; 看清本質</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
              <div>
                <h4 className="text-gold/80 font-semibold mb-3">命理服務</h4>
                <div className="space-y-2 text-text-muted">
                  <Link href="/tools/bazi" className="block hover:text-gold transition-colors">免費命理速算</Link>
                  <Link href="/pricing" className="block hover:text-gold transition-colors">方案與定價</Link>
                </div>
              </div>
              <div>
                <h4 className="text-gold/80 font-semibold mb-3">了解更多</h4>
                <div className="space-y-2 text-text-muted">
                  <Link href="/#systems" className="block hover:text-gold transition-colors">十四大系統</Link>
                  <Link href="/#how" className="block hover:text-gold transition-colors">分析流程</Link>
                  <Link href="/blog" className="block hover:text-gold transition-colors">命理知識</Link>
                  <Link href="/about" className="block hover:text-gold transition-colors">關於鑒源</Link>
                  <Link href="/whitepaper" className="block hover:text-gold transition-colors">技術白皮書</Link>
                  <Link href="/faq" className="block hover:text-gold transition-colors">常見問題</Link>
                </div>
              </div>
              <div>
                <h4 className="text-gold/80 font-semibold mb-3">法律條款</h4>
                <div className="space-y-2 text-text-muted">
                  <Link href="/privacy" className="block hover:text-gold transition-colors">隱私政策</Link>
                  <Link href="/terms" className="block hover:text-gold transition-colors">使用條款</Link>
                </div>
              </div>
              <div>
                <h4 className="text-gold/80 font-semibold mb-3">聯繫我們</h4>
                <EmailLink className="text-text-muted hover:text-gold transition-colors" />
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
        </footer>
        </LocaleContent>
        </GlobalToastProvider>
        </ThemeProvider>
        {/* v5.10.324:Vercel Analytics + Speed Insights(P0 #1 監控對齊)
            - Analytics:即時 page-view + traffic source、不需 cookie consent(IP 匿名化)
            - SpeedInsights:RUM Web Vitals(LCP/FID/CLS/INP/TTFB)
            註:免費 tier 月 25K 事件、jianyuan.life 月流量遠低於此額度 */}
        <Analytics />
        <SpeedInsights />
        <WebVitalsReporter />
      </body>
    </html>
  )
}
