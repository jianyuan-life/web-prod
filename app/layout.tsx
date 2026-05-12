import type { Metadata } from 'next'
import pkg from '../package.json'
import { Noto_Serif_TC, Noto_Sans_TC, Noto_Serif_SC, Noto_Sans_SC, Cinzel } from 'next/font/google'
import Link from 'next/link'
import Image from 'next/image'
import Navbar from '@/components/Navbar'
import LocaleContent from '@/components/LocaleContent'
import Tracker from '@/components/Tracker'
import ReferralHandler from '@/components/ReferralHandler'
import GlobalBackToTop from '@/components/GlobalBackToTop'
import EmailLink from '@/components/EmailLink'
import CookieConsent from '@/components/CookieConsent'
import './globals.css'

// v5.3.44 字型 variable 保留歷史命名（QA 稽核發現動了會破壞 200+ 處品牌標題視覺）
// --font-sans = Noto Serif TC（品牌 Serif，Logo/封面/大標題用）
// --font-body = Noto Sans TC（真 Sans，正文用；報告頁 CSS 顯式用 var(--font-body)）
// 命名違反直覺但不動，未來統一改名另開 Wave。
const notoSerif = Noto_Serif_TC({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans', display: 'swap' })
const notoSans = Noto_Sans_TC({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-body', display: 'swap' })
// 簡體中文字體（簡體模式時由 LocaleContent 切換 class）
const notoSerifSC = Noto_Serif_SC({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans-sc', display: 'swap' })
const notoSansSC = Noto_Sans_SC({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-body-sc', display: 'swap' })
// v5.10.198 UI redesign Phase 2:Cinzel for display(英文 logo / Chapter numbers、Jamie 規格書 2.2 --font-display)
const cinzel = Cinzel({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-display-google', display: 'swap' })

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW" className={`${notoSerif.variable} ${notoSans.variable} ${notoSerifSC.variable} ${notoSansSC.variable} ${cinzel.variable}`} suppressHydrationWarning>
      <head>
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
        {/* 原始碼保護：DevTools 版權警告 + 禁止右鍵 */}
        {/* 修正（2026-04-19）：原本 var w='...','...' 是非法 JS 語法（SyntaxError: Unexpected string），
            會導致全站每頁 console 報錯、後續 contextmenu 監聽根本沒註冊。改為 var w=..., css=..., m=...; 三個變數 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                // DevTools 開啟時顯示版權警告
                var w='%c⚠️ 鑒源 JianYuan — 版權所有';
                var css='color:#c9a84c;font-size:16px;font-weight:bold';
                var m='本網站所有原始碼、演算法、命理規則引擎均受智慧財產權保護。\\n未經授權複製、修改或散佈將依法追究。\\n\\n© 2026 鑒源 JianYuan. All rights reserved.\\nhttps://jianyuan.life';
                console.log(w,css,m);
                // 禁止右鍵選單（報告頁）
                document.addEventListener('contextmenu',function(e){
                  if(e.target&&e.target.closest&&e.target.closest('main')){e.preventDefault()}
                });
              })();
            `,
          }}
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
        <Tracker />
        <ReferralHandler />
        <CookieConsent />
        <LocaleContent>
        <Navbar />
        <main className="pt-16">{children}</main>
        <GlobalBackToTop />
        <footer className="border-t border-gold/10 mt-20">
          {/* 英文/簡體翻譯覆蓋範圍：v5.3.95 起 footer 納入 LocaleContent */}
          <div className="max-w-6xl mx-auto px-6 py-16">
            {/* 古典分隔裝飾 */}
            <div className="text-center mb-10">
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className="h-12 w-12 rounded-full overflow-hidden" style={{ background: '#0a0e1a', border: '1px solid rgba(201,168,76,0.3)' }}>
                  <img src="/logo-jianyuan.svg?v=11" alt="鑒源" className="h-full w-full" />
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
          </div>
        </footer>
        </LocaleContent>
      </body>
    </html>
  )
}
