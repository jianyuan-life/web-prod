import PricingCards from '@/components/PricingCards'
import LiveCounter from '@/components/LiveCounter'
import StarField from '@/components/StarField'
import Astrolabe from '@/components/Astrolabe'
import ReportPreview from '@/components/ReportPreview'
import HeroCTAExperiment from '@/components/HeroCTAExperiment'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '鑒源 JianYuan — 十五大命理系統精準分析｜八字、紫微斗數、奇門遁甲',
  description: '鑒源整合八字、紫微斗數、奇門遁甲、西洋占星等最多十五大東西方命理系統，以數萬條古籍規則交叉分析，為您提供性格天賦、事業財運、感情婚姻的完整命格報告。免費體驗，30 秒出結果。',
  keywords: '命理, 八字, 紫微斗數, 奇門遁甲, 西洋占星, 命盤, 命格分析, 免費算命, 姓名學, 風水, 人類圖, 吠陀占星, 出門訣, 運勢',
  openGraph: {
    title: '鑒源 JianYuan — 十五大命理系統精準分析',
    description: '整合東西方十五大命理系統，一份報告看清性格天賦、事業方向、感情運勢。免費體驗，不需註冊。',
    url: 'https://jianyuan.life',
    siteName: '鑒源 JianYuan',
    type: 'website',
    locale: 'zh_TW',
  },
  twitter: {
    card: 'summary_large_image',
    title: '鑒源 JianYuan — 十五大命理系統精準分析',
    description: '整合東西方十五大命理系統，一份報告看清性格天賦、事業方向、感情運勢。',
  },
  alternates: {
    canonical: 'https://jianyuan.life',
  },
}

// 15 大命理系統（含 24x24 SVG 圖示 path）
const SYSTEMS: { name: string; tier: 1 | 2 | 3; desc: string; icon: string }[] = [
  { name: '八字命理', tier: 1, desc: '看清你天生的性格底色、一生的高峰低谷期，以及事業、感情、財運的先天優勢與功課',
    icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  { name: '紫微斗數', tier: 1, desc: '從事業、感情、財運、健康等十二個人生面向，看清你一生的發展方向與每個階段的重點',
    icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 8a4 4 0 100 8 4 4 0 000-8zM12 2v4M12 18v4M2 12h4M18 12h4' },
  { name: '奇門遁甲', tier: 1, desc: '找到最適合你行動的時機與方向——什麼時候出手、往哪走，讓決策不再靠猜',
    icon: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18' },
  { name: '風水堪輿', tier: 2, desc: '了解你的居住環境如何影響你的運勢，以及可以做哪些簡單調整來改善',
    icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM9 22V12h6v10' },
  { name: '西洋占星', tier: 2, desc: '透過太陽、月亮、上升星座，看見你的外在表現、內在需求，以及人生不同階段的成長主題',
    icon: 'M12 7a5 5 0 100 10 5 5 0 000-10zM12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42' },
  { name: '姓名學', tier: 2, desc: '解讀你的名字帶給你的能量——它如何影響你的人際、事業，以及別人對你的第一印象',
    icon: 'M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z' },
  { name: '吠陀占星', tier: 2, desc: '來自印度千年智慧的第二視角，用不同的座標系統交叉驗證你的人生軌跡',
    icon: 'M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z' },
  { name: '易經占卜', tier: 2, desc: '用最古老的智慧回答你最當下的困惑——一事一問，直指核心',
    icon: 'M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2zM22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z' },
  { name: '人類圖', tier: 2, desc: '發現你的能量運作方式——什麼時候該主動、什麼時候該等待，怎麼做決定最不後悔',
    icon: 'M18 20V10M12 20V4M6 20v-6' },
  { name: '數字能量學', tier: 3, desc: '從你的出生日期解讀天賦、空缺與今年的成長主題——簡單卻深刻',
    icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM8 12l2 2 4-4' },
  { name: '古典占星', tier: 3, desc: '用中國傳統天文觀測法，從另一個角度驗證你的命格特質與流年走向',
    icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  { name: '塔羅牌', tier: 3, desc: '映照你潛意識的鏡子——看見你內心深處已經知道、但還沒說出口的答案',
    icon: 'M2 2h20v20H2zM7 12h10M12 7v10' },
  { name: '生肖運勢', tier: 3, desc: '今年的太歲關係如何？哪些月份要特別留意、哪些月份適合大展拳腳',
    icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 8c-2 0-3 1-3 2.5S10 13 12 14s3 1.5 3 3-1 2.5-3 2.5M12 6v2m0 10v2' },
  { name: '生物節律', tier: 3, desc: '精算你的體力、情緒、思維三大週期，找到每個月狀態最好的日子',
    icon: 'M22 12h-4l-3 9L9 3l-3 9H2' },
  { name: '南洋術數', tier: 3, desc: '融合東南亞多元文化的命理智慧，提供獨特的跨文化驗證視角',
    icon: 'M12 2a10 10 0 100 20 10 10 0 000-20zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z' },
]

function SystemIcon({ d, tier }: { d: string; tier: 1 | 2 | 3 }) {
  const opacity = tier === 1 ? '1' : tier === 2 ? '0.7' : '0.4'
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={`rgba(201,168,76,${opacity})`} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
      <path d={d} />
    </svg>
  )
}

export default function HomePage() {
  return (
    <div>
      {/* ========== Hero — 星空 + 星盤 + 極光 ========== */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
        <StarField />
        <Astrolabe />

        <div className="relative z-10 text-center max-w-[720px] mx-auto px-6 animate-[fade-up_1s_ease-out]">
          <div className="text-[13px] tracking-[0.3em] text-gold/50 mb-8" style={{ fontFamily: 'var(--font-body)' }}>
            鑒源 &middot; JianYuan
          </div>
          <h1 className="text-4xl md:text-[52px] leading-[1.3] mb-6" style={{ fontFamily: 'var(--font-sans)' }}>
            <span className="text-cream/90 block text-xl md:text-[32px] font-normal mb-2">
              也許你正在尋找一個答案
            </span>
            <span className="text-gradient-gold font-semibold">
              用十五個維度，重新認識你自己
            </span>
          </h1>
          <p className="text-base text-text-muted leading-[2] mb-10 max-w-[520px] mx-auto">
            你來到這裡，不是因為迷信，而是因為你想為自己的人生<br />
            找到一個更清晰的方向。讓我們陪你，看見那個真實的自己。
          </p>
          <div className="flex flex-wrap gap-4 justify-center mb-6">
            {/* A/B 測試：Hero CTA 文案（experimentKey: hero_cta_20260417） */}
            <HeroCTAExperiment />
            <a href="/pricing"
              className="inline-flex items-center gap-2 px-8 py-3.5 glass text-cream font-semibold rounded-[10px] text-[15px] hover:bg-surface-hover transition-colors">
              探索完整方案
            </a>
          </div>
          <p className="text-xs text-text-muted/50 tracking-wide">不需註冊 &middot; 完全免費 &middot; <LiveCounter /> 人已體驗</p>
        </div>

        {/* 向下箭頭 */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 animate-bounce-slow">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(201,168,76,0.3)" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </section>

      {/* ========== 共情段落 — 接住用戶情緒 ========== */}
      <section className="py-24 relative">
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(139, 92, 246, 0.10) 0%, transparent 60%), radial-gradient(ellipse at 80% 80%, rgba(74, 122, 255, 0.06) 0%, transparent 50%)' }} />
        <div className="max-w-[800px] mx-auto px-6">
          <div className="glass rounded-[20px] p-12 md:p-14 text-center border border-gold/[0.06]" style={{ background: 'rgba(15, 22, 40, 0.3)' }}>
            <div className="text-6xl text-gold/15 mb-2" style={{ fontFamily: 'var(--font-sans)' }}>&ldquo;</div>
            <p className="text-[17px] leading-[2.2] text-cream/80 max-w-[560px] mx-auto">
              也許你正在經歷一段不容易的時光。<br />
              也許你對自己的方向感到困惑，<br />
              對未來有些不確定，甚至有些焦慮。
            </p>
            <span className="block w-10 h-px bg-gold/20 mx-auto my-6" />
            <p className="text-[17px] leading-[2.2] text-cream/80 max-w-[560px] mx-auto">
              <strong className="text-cream font-medium">你來到這裡，本身就是一種勇氣。</strong><br />
              命理不是算命，不是迷信——<br />
              它是一面鏡子，幫助你<span className="text-gold">看見自己本來的樣子</span>。<br />
              而鑒源，想做的是<strong className="text-cream font-medium">陪你一起照這面鏡子</strong>。
            </p>
          </div>
        </div>
      </section>

      {/* ========== 免費工具引導 ========== */}
      <section className="py-16 relative">
        <div className="max-w-[720px] mx-auto px-6">
          <div className="glass rounded-[20px] p-10 md:p-12 text-center border border-gold/[0.12]" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.04), rgba(15,22,40,0.4))' }}>
            <h2 className="text-xl md:text-2xl font-bold text-cream mb-3" style={{ fontFamily: 'var(--font-sans)' }}>
              30 秒，免費看見你的命格密碼
            </h2>
            <p className="text-sm text-text-muted leading-relaxed mb-6">
              只需姓名、生日、性別，即刻獲得八字排盤 + AI 深度分析
            </p>
            <a href="/tools/bazi"
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-gold text-dark font-bold rounded-[10px] text-[15px] btn-glow">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
              立即免費體驗
            </a>
            <p className="text-xs text-text-muted/50 mt-4">不需註冊 &middot; 不需付費 &middot; 完全免費</p>
          </div>
        </div>
      </section>

      {/* ========== 信任指標（帶 SVG 圖示） ========== */}
      <section className="py-14 border-y border-gold/[0.06]">
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { num: '15', label: '命理系統', sub: '東西方完整覆蓋',
              icon: <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20" /></> },
            { num: '34,458', label: '條專業規則', sub: '規則源自數十部經典古籍',
              icon: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></> },
            { num: '', label: '隱私保護', sub: '資料加密傳輸與儲存',
              icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /> },
            { num: '$39', label: '起', sub: '6 種方案任你選擇',
              icon: <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /> },
          ].map((s) => (
            <div key={s.label}>
              <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-gold/[0.06] border border-gold/10 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" className="w-6 h-6">
                  {s.icon}
                </svg>
              </div>
              <div className="text-2xl md:text-3xl font-bold text-gradient-gold" style={{ fontFamily: 'var(--font-sans)' }}>{s.num}</div>
              <div className="text-sm text-cream mt-1">{s.label}</div>
              <div className="text-[11px] text-text-muted">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ========== 差異化對比 ========== */}
      <section className="py-24" style={{ background: 'linear-gradient(180deg, rgba(15, 22, 40, 0.3) 0%, rgba(20, 16, 48, 0.25) 50%, rgba(15, 22, 40, 0.3) 100%)' }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="divider-ornament text-gold/30 mb-6 justify-center">
            <span className="text-xs tracking-[0.2em]">差異</span>
          </div>
          <h2 className="text-2xl md:text-3xl text-center mb-12 text-cream" style={{ fontFamily: 'var(--font-sans)' }}>
            市面上的命理服務，和鑒源有什麼不同？
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { title: '傳統命理師', items: ['只用 1-2 套系統', '結論因人而異，難以驗證', '收費 $100-$300 美金', '等待 3-7 天出結果', '人為偏見影響判斷'], highlight: false },
              { title: '鑒源命理', items: ['最多 15 套系統交叉分析', '34,458 條規則客觀運算', '最低 $39 美金起', '報告約 30-60 分鐘完成', '規則驅動，排盤可驗證'], highlight: true },
              { title: '免費算命網站', items: ['套公式的罐頭回覆', '千篇一律的描述', '沒有個人化深度', '無法回答「為什麼」', '沒有行動建議'], highlight: false },
            ].map((col) => (
              <div key={col.title} className={`glass rounded-2xl p-6 relative ${col.highlight ? 'border-gold/25 shadow-[0_0_40px_rgba(201,168,76,0.08)]' : ''}`}>
                {col.highlight && (
                  <span className="absolute -top-3 right-6 bg-gold text-dark text-[11px] font-bold px-3.5 py-1 rounded-full">推薦</span>
                )}
                <h3 className={`text-lg font-bold mb-5 pb-4 border-b border-gold/8 ${col.highlight ? 'text-gold' : 'text-text-muted'}`} style={{ fontFamily: 'var(--font-sans)' }}>
                  {col.title}
                </h3>
                <ul className="space-y-3">
                  {col.items.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-text leading-relaxed">
                      <span className={`mt-0.5 text-[13px] ${col.highlight ? 'text-gold' : 'text-text-muted/40'}`}>
                        {col.highlight ? '\u2713' : '\u2013'}
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== 四大核心優勢 ========== */}
      <section className="py-24 relative">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 20% 50%, rgba(139, 92, 246, 0.06) 0%, transparent 50%), radial-gradient(ellipse at 80% 30%, rgba(74, 122, 255, 0.05) 0%, transparent 45%)' }} />
        <div className="max-w-5xl mx-auto px-6 relative z-[1]">
          <div className="divider-ornament text-gold/30 mb-6 justify-center">
            <span className="text-xs tracking-[0.2em]">核心優勢</span>
          </div>
          <h2 className="text-2xl md:text-3xl text-center mb-4 text-cream" style={{ fontFamily: 'var(--font-sans)' }}>
            四個理由，讓命理真正有用
          </h2>
          <p className="text-center text-text-muted text-sm mb-12">不只是算命，而是一次對自己的深度認識</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: <><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><line x1="2" y1="12" x2="22" y2="12" /></>,
                title: '15 系統交叉驗證',
                desc: '不是「某位老師說」，而是十五套東西方命理系統的共識。三層加權架構確保結論經得起推敲。',
                warmth: false,
              },
              {
                icon: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /><path d="M8 7h8M8 11h5" /></>,
                title: '古籍 + 科技雙引擎',
                desc: '34,458 條規則源自《滴天髓》《紫微斗數全書》等經典，由分析引擎整合成有深度的個人化報告。',
                warmth: false,
              },
              {
                icon: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />,
                title: '不只看命，更能行動',
                desc: '獨家「出門訣」：源自《煙波釣叟歌》的千年擇吉術，25 層評分體系精算吉時方位，涵蓋三吉門、九遁、天地盤干生剋，套入個人年命宮，讓命理從了解走向行動。',
                warmth: false,
              },
              {
                icon: <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />,
                title: '有溫度的陪伴',
                desc: '每份報告不只有數據，更有理解與共情。命理是自我對話的過程，而我們想陪你走這段路。',
                warmth: true,
              },
            ].map((item) => (
              <div key={item.title} className="glass rounded-2xl p-6 text-center relative overflow-hidden group">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[60%] h-0.5 bg-gradient-to-r from-transparent via-gold to-transparent opacity-0 group-hover:opacity-50 transition-opacity" />
                <div className={`w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center border ${
                  item.warmth
                    ? 'bg-gradient-to-br from-purple-500/10 to-teal-500/[0.06] border-purple-500/15'
                    : 'bg-gradient-to-br from-gold/[0.08] to-gold/[0.02] border-gold/12'
                }`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={item.warmth ? 'rgb(139, 92, 246)' : 'var(--color-gold)'} strokeWidth="1.5" className="w-7 h-7">
                    {item.icon}
                  </svg>
                </div>
                <h3 className="font-semibold text-cream text-base mb-3" style={{ fontFamily: 'var(--font-sans)' }}>{item.title}</h3>
                <p className="text-[13px] text-text-muted leading-[1.8]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== 十五大系統（帶圖示） ========== */}
      <section id="systems" className="py-24" style={{ background: 'linear-gradient(180deg, rgba(15, 22, 40, 0.3) 0%, rgba(18, 14, 45, 0.25) 50%, rgba(15, 22, 40, 0.3) 100%)' }}>
        <div className="max-w-6xl mx-auto px-6">
          <div className="divider-ornament text-gold/30 mb-6 justify-center">
            <span className="text-xs tracking-[0.2em]">十五大系統</span>
          </div>
          <h2 className="text-2xl md:text-3xl text-center mb-4 text-cream" style={{ fontFamily: 'var(--font-sans)' }}>
            東方古典智慧 &middot; 西方占星體系
          </h2>
          <p className="text-center text-text-muted text-sm mb-4">每套系統各司其職，交叉驗證給你最完整的答案</p>
          <div className="flex justify-center gap-6 mb-10 text-xs text-text-muted">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gold" /> 核心系統</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gold/50" /> 補充系統</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gold/25" /> 參考系統</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SYSTEMS.map((sys) => (
              <div key={sys.name} className="glass rounded-xl p-5 flex items-start gap-4 transition-all duration-300 hover:-translate-y-1">
                <div className="shrink-0 w-11 h-11 rounded-[10px] bg-gold/[0.06] border border-gold/10 flex items-center justify-center">
                  <SystemIcon d={sys.icon} tier={sys.tier} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-cream text-sm" style={{ fontFamily: 'var(--font-sans)' }}>{sys.name}</h3>
                    {sys.tier === 1 && <span className="text-[9px] px-1.5 py-0.5 bg-gold/15 text-gold rounded">核心</span>}
                    {sys.tier === 2 && <span className="text-[9px] px-1.5 py-0.5 bg-gold/[0.08] text-gold/70 rounded">補充</span>}
                  </div>
                  <p className="text-xs text-text-muted leading-[1.7]">{sys.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== 報告預覽 ========== */}
      <ReportPreview />

      {/* ========== 古籍傳承 ========== */}
      <section className="py-24">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="divider-ornament text-gold/30 mb-6 justify-center">
            <span className="text-xs tracking-[0.2em]">源流</span>
          </div>
          <h2 className="text-2xl md:text-3xl mb-6 text-cream" style={{ fontFamily: 'var(--font-sans)' }}>
            植根經典 &middot; 融合科技
          </h2>
          <p className="text-base text-text-muted leading-[2] max-w-2xl mx-auto mb-10">
            本系統的分析框架建立在數十部命理經典之上——
            八字取法《滴天髓》《窮通寶鑑》《子平真詮》，
            紫微參照《紫微斗數全書》《太微賦》，
            奇門依據《奇門遁甲統宗》《煙波釣叟歌》，
            風水根植《青囊經》《沈氏玄空學》。
            每一條分析規則，皆有典籍出處，絕非憑空推演。
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['《滴天髓》', '《紫微斗數全書》', '《窮通寶鑑》', '《奇門遁甲統宗》',
              '《子平真詮》', '《青囊經》', '《沈氏玄空學》', '《煙波釣叟歌》'
            ].map(book => (
              <div key={book} className="glass rounded-lg py-3 px-4 text-sm text-gold/80" style={{ fontFamily: 'var(--font-sans)' }}>
                {book}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== 分析流程 ========== */}
      <section id="how" className="py-24" style={{ background: 'linear-gradient(180deg, rgba(15, 22, 40, 0.3) 0%, rgba(16, 14, 42, 0.25) 50%, rgba(15, 22, 40, 0.3) 100%)' }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="divider-ornament text-gold/30 mb-6 justify-center">
            <span className="text-xs tracking-[0.2em]">流程</span>
          </div>
          <h2 className="text-2xl md:text-3xl text-center mb-12 text-cream" style={{ fontFamily: 'var(--font-sans)' }}>
            五步完成命格分析
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { step: '壹', title: '免費體驗', desc: '輸入出生資料，即時查看八字排盤與性格分析' },
              { step: '貳', title: '選擇方案', desc: '6種方案，從個人到家庭，從 $39 起' },
              { step: '參', title: '填寫資料', desc: '姓名、出生日期時間、性別，簡單三步' },
              { step: '肆', title: '深度分析', desc: '專業規則逐系統交叉分析' },
              { step: '伍', title: '查看報告', desc: '線上閱讀 + PDF 永久保存，隨時回顧' },
            ].map((item, i) => (
              <div key={item.step} className="relative text-center">
                {i < 4 && <div className="hidden md:block absolute top-6 left-[60%] w-[80%] h-px bg-gradient-to-r from-gold/20 to-transparent" />}
                <div className="text-2xl text-gold/80 mb-2" style={{ fontFamily: 'var(--font-sans)' }}>{item.step}</div>
                <h3 className="font-semibold text-cream text-sm mb-1">{item.title}</h3>
                <p className="text-xs text-text-muted leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== 定價 ========== */}
      <section id="pricing" className="py-24">
        <div className="max-w-5xl mx-auto px-6">
          <div className="divider-ornament text-gold/30 mb-6 justify-center">
            <span className="text-xs tracking-[0.2em]">方案</span>
          </div>
          <h2 className="text-2xl md:text-3xl text-center mb-2 text-cream" style={{ fontFamily: 'var(--font-sans)' }}>
            選擇適合您的方案
          </h2>
          <p className="text-center text-text-muted mb-12 text-sm">從 $39 起，每份報告都包含網頁展示 + PDF 永久保存</p>
          <PricingCards />
          <p className="text-center mt-8 text-sm text-text-muted">
            還有家庭、關係、出門訣方案 &middot; <a href="/pricing" className="text-gold hover:underline">查看全部 6 種方案與詳細介紹</a>
          </p>
        </div>
      </section>

      {/* ========== 出門訣推廣 ========== */}
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-6">
          <div className="glass rounded-2xl p-8 md:p-12 border border-gold/10" style={{ background: 'linear-gradient(135deg, rgba(201,168,76,0.06), rgba(15,22,40,0.4))' }}>
            <div className="flex flex-col md:flex-row gap-8 items-center">
              {/* 羅盤圖示 */}
              <div className="shrink-0 w-24 h-24 flex items-center justify-center">
                <svg viewBox="0 0 64 64" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" className="w-[72px] h-[72px]">
                  <circle cx="32" cy="32" r="24" />
                  <circle cx="32" cy="32" r="18" opacity="0.4" />
                  <circle cx="32" cy="32" r="10" opacity="0.2" />
                  <polygon points="32,12 29,32 32,28 35,32" fill="rgba(201,168,76,0.3)" stroke="var(--color-gold)" strokeWidth="1" />
                  <polygon points="32,52 29,32 32,36 35,32" fill="rgba(201,168,76,0.08)" stroke="var(--color-gold)" strokeWidth="1" opacity="0.5" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-gold text-xs tracking-[0.15em] mb-1">鑒源特色</div>
                <h2 className="text-2xl font-bold text-cream mb-4" style={{ fontFamily: 'var(--font-sans)' }}>
                  奇門遁甲出門訣 — 讓命理真正落地
                </h2>
                <p className="text-sm text-text-muted leading-[1.9] mb-5 max-w-[520px]">
                  命理分析告訴你「你是誰」，出門訣告訴你「怎麼做」。
                  源自《煙波釣叟歌》與《奇門遁甲統宗》的千年擇吉術，
                  系統以 25 層評分體系精算每個時辰八方位的能量——三吉門、三奇、八神、九星旺衰、天地盤干生剋、九遁格局，
                  再套入您的個人年命宮驗證，找出最適合您的吉時、方位與信心指數。
                  在指定時間朝吉方走出 500 公尺，靜坐接氣 40 分鐘，讓天時地利的能量灌注到您身上。
                </p>
                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <a href="/pricing" className="inline-flex items-center gap-2 px-6 py-3 bg-gold text-dark font-bold rounded-lg btn-glow text-sm">
                    探索出門訣
                  </a>
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <span className="text-gold">&#10003;</span> 事件出門訣 $89
                    <span className="mx-1">|</span>
                    <span className="text-gold">&#10003;</span> 月盤出門訣 $99
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== 創辦人的話 ========== */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-6">
          <div className="divider-ornament text-gold/30 mb-6 justify-center">
            <span className="text-xs tracking-[0.2em]">為什麼是鑒源</span>
          </div>

          <div className="glass rounded-2xl p-8 md:p-12">
            <div className="text-gold/60 text-4xl mb-4" style={{ fontFamily: 'var(--font-sans)' }}>&ldquo;</div>

            <div className="space-y-5 text-base text-text leading-[2]">
              <p>
                我是個極度重視邏輯與數據的人。<br />
                身為金融從業者，我做的每一個決定，都需要依據、推理，以及完整的分析。
              </p>
              <p>
                所以，如果有一天我告訴你——命理改變了我的人生軌跡，<br />
                請相信，那不會是一句沒有根據的玄學。
              </p>
              <p>
                30 歲之前，我改過三次名字。<br />
                前兩次，並不是我能選擇的；直到第三次，我決定把人生的方向，握在自己手裡。
              </p>
              <p>
                改名不是一件簡單的事。從證件、銀行到所有資料，每一個細節都必須重新調整。
                也因此，我格外謹慎——找了<strong className="text-cream">六位命理老師</strong>，
                花了將近<strong className="text-cream">三萬多元</strong>，只為了做一件事：<strong className="text-gold">驗證</strong>。
              </p>
              <p>但結果，卻讓我開始動搖。</p>
              <p>
                每一位老師，都能把名字說得頭頭是道。
                上一位說「很好」，下一位卻說「不行」。標準不一致，答案也沒有終點。
                那一刻我才明白——這些建議的核心，從來不是「適不適合你」，
                而是「讓你再花一次錢」。
              </p>
              <p>
                從台幣 3,600 到 8,000，我都試過。<br />
                最終，我沒有採用任何一位老師的方案。<br />
                因為我開始懷疑的，不只是名字，而是——<strong className="text-cream">我是不是把人生的選擇，交給了別人？</strong>
              </p>
              <p>
                於是我花了兩個多月，閱讀了十多本姓名學專著，研究了六大門派的理論體系，
                最後自己為自己改了名。
              </p>

              <div className="glass rounded-xl p-5 border-l-2 border-gold/30">
                <span className="text-text-muted text-sm">改名前：</span><br />
                <span className="text-text">
                  23 歲拿到百萬年薪，26 歲負債兩百萬，收入銳減一半，差點破產。
                  30 歲還在數著銀行餘額過日子。最好的朋友曾對我說——
                </span>
                <em className="text-gold/90">「你不是沒有能力，而是真的比較倒楣而已。」</em>
              </div>

              <div className="glass rounded-xl p-5 border-l-2 border-green-600/30">
                <span className="text-text-muted text-sm">改名後：</span><br />
                <span className="text-text">
                  30 到 35 歲，被挖角到中國、再到香港。遇到了另一半，成了家、生了孩子。
                  從負債兩百多萬，到收入翻了數倍，豐衣足食。
                </span>
              </div>

              <p>
                大概率<strong className="text-cream">八成是因為我夠努力</strong>。
                但總有那關鍵的兩成——運勢、時機、生不逢時——不是努力就能改變的。
              </p>

              <div className="glass rounded-xl p-5 border-l-2 border-gold/30 text-cream">
                在我的認知中，命理是經過數理驗算後找出大概率趨勢的一門學問。
                它的目標從來不是逆天改命，而是一個<strong className="text-gold">自我對話的過程</strong>——
                更了解自己，才能更完善地發揮自己的天賦。
              </div>

              <p className="text-cream font-semibold">
                這就是鑒源的初衷。<br />
                回到源頭，看清本質。把選擇的權力，交還給你自己。
              </p>
            </div>

            <div className="text-gold/60 text-4xl text-right mt-4" style={{ fontFamily: 'var(--font-sans)' }}>&rdquo;</div>

            <div className="mt-8 pt-6 border-t border-gold/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gold/15 flex items-center justify-center text-gold text-lg font-bold shrink-0" style={{ fontFamily: 'var(--font-sans)' }}>J</div>
                <div>
                  <p className="text-sm font-semibold text-cream">Jamie</p>
                  <p className="text-xs text-gold/70">鑒源創辦人</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== 用戶評價 ========== */}
      <section className="py-24" style={{ background: 'linear-gradient(180deg, rgba(15, 22, 40, 0.3) 0%, rgba(20, 16, 48, 0.2) 50%, rgba(15, 22, 40, 0.3) 100%)' }}>
        <div className="max-w-5xl mx-auto px-6">
          <div className="divider-ornament text-gold/30 mb-6 justify-center">
            <span className="text-xs tracking-[0.2em]">用戶心聲</span>
          </div>
          <h2 className="text-2xl md:text-3xl text-center mb-4 text-cream" style={{ fontFamily: 'var(--font-sans)' }}>
            使用情境
          </h2>
          <p className="text-center text-text-muted text-sm mb-12">以下為示範情境，展示鑒源報告可以如何幫助您</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { name: '陳先生', location: '台北', plan: '人生藍圖', color: 'bg-gold/20',
                text: '之前花了三千多找老師看八字，結論就兩頁紙。鑒源的報告十幾頁，十五套系統逐一分析，而且每個結論都說明了依據。最關鍵的是大運分析，直接點出了我 37-42 歲是事業黃金期，我正好在猶豫要不要創業。' },
              { name: '王女士', location: '香港', plan: '家族藍圖', color: 'bg-teal-500/20',
                text: '幫全家四口人做了分析。我跟老公的合婚分析很精準——報告說我們在財務觀念上容易有摩擦，確實如此。更驚喜的是孩子的天賦分析，報告建議的學習方向跟孩子實際的興趣完全吻合。' },
              { name: '李先生', location: '深圳', plan: '心之所惑', color: 'bg-purple-500/20',
                text: '本來半信半疑，先試了免費速算，性格分析準到我懷疑是不是有人偷看我的日記。後來花 $39 買了「心之所惑」問財運，報告不只告訴我運勢走向，還具體建議了投資時機和要避開的月份。' },
              { name: '張小姐', location: '新加坡', plan: '事件出門訣', color: 'bg-blue-500/20',
                text: '面試前買了出門訣，按照建議在吉時出門，當天狀態出奇的好，最後拿到了 offer。但最讓我意外的是報告裡那段「寫給你的話」——它說我一直害怕的不是失敗，而是成功之後不知道怎麼面對。讀到那裡我愣了很久，覺得被完全看透了。' },
              { name: '林先生', location: '台中', plan: '合否？', color: 'bg-red-400/20',
                text: '跟女友交往兩年一直在猶豫要不要結婚。報告不只分析了我們的相容性，還點出我在感情裡總是害怕「不夠好」所以不敢承諾。那段話讓我紅了眼眶——原來我猶豫的不是她對不對，而是我配不配。看完報告那天晚上就決定買戒指了。' },
              { name: '黃女士', location: '溫哥華', plan: '人生藍圖', color: 'bg-green-500/20',
                text: '移民後事業一直不順，看了很多命理都說「再等等」。鑒源的報告不一樣——它沒有叫我等，而是告訴我「你的命格其實更適合自由業，你一直在用不適合的方式生活」。讀完整份報告的感覺像是被一個很懂你的老朋友聊了一整夜。現在已經開始籌備自己的工作室了。' },
            ].map((t) => (
              <div key={t.name} className="glass rounded-2xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i} className="text-gold text-sm">&#9733;</span>
                    ))}
                  </div>
                  <span className="text-[10px] text-gold/60 px-2 py-0.5 bg-gold/5 rounded">{t.plan}</span>
                </div>
                <blockquote className="text-sm text-text leading-[1.9] mb-5 italic">
                  &ldquo;{t.text}&rdquo;
                </blockquote>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${t.color} flex items-center justify-center text-gold text-sm font-semibold`}>
                    {t.name[0]}
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-cream">{t.name}</div>
                    <div className="text-[11px] text-text-muted">{t.location}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FAQ ========== */}
      <section className="py-24">
        <div className="max-w-3xl mx-auto px-6">
          <div className="divider-ornament text-gold/30 mb-6 justify-center">
            <span className="text-xs tracking-[0.2em]">常見問題</span>
          </div>
          <h2 className="text-2xl md:text-3xl text-center mb-12 text-cream" style={{ fontFamily: 'var(--font-sans)' }}>
            您可能想知道
          </h2>
          {[
            { q: '鑒源的命理分析準確嗎？', a: '排盤計算使用確定性算法（如壽星天文曆、Swiss Ephemeris），結果可重複驗證，與專業命理軟體一致。分析解讀基於數十部經典古籍提煉的專業規則，由 AI 引擎整合成個人化報告。鑒源最多用十五套系統交叉分析——當多數系統得出相同結論時，可信度遠高於單一系統的判斷。' },
            { q: '報告多久可以收到？', a: '付款後系統自動開始運算。個人報告（人生藍圖、心之所惑）約 30 分鐘完成；出門訣需排算數百個時辰，約需 40 分鐘以上。完成後會立即寄送 Email 通知，您也可以在儀表板即時查看分析進度。' },
            { q: '需要提供什麼資料？', a: '姓名、出生日期、出生時間（時辰）、性別。出生時間越精確，分析越準確。如果不確定出生時間，可以選擇最接近的時辰，部分不依賴時辰的系統仍可正常分析。' },
            { q: '15套系統會不會互相矛盾？', a: '不同系統觀察的角度不同，偶有差異屬正常。這正是鑒源的核心價值——我們用三層加權架構進行交叉驗證，取各系統共識作為最終結論。單一系統只有一個觀點，十五套系統交叉驗證才能得到更全面、更可靠的結論。' },
            { q: '付款安全嗎？', a: '所有付款透過國際知名的 Stripe 安全系統處理，支援信用卡和各種支付方式。您的信用卡資訊完全由 Stripe 處理，不會經過鑒源伺服器。Stripe 已通過 PCI DSS Level 1 認證，是全球最高等級的支付安全標準。' },
            { q: '可以退款嗎？', a: '報告為虛擬數位內容，一旦開始生成即消耗運算資源，因此生成後不支持退款。如果報告品質有任何問題，請聯繫 support@jianyuan.life，我們會為您免費重新生成，確保您獲得滿意的分析結果。' },
            { q: '什麼是出門訣？怎麼用？', a: '出門訣源自奇門遁甲的千年擇吉術，古籍《煙波釣叟歌》記載：「吉門吉方即行，凶門凶方即止。」我們的系統以 25 層評分體系（三吉門、三奇、八神、九星旺衰、天地盤干生剋、九遁格局等）精算每個時辰八方位的能量，再套入您的個人年命宮驗證。使用方法：在報告推薦的吉時準時出門，朝吉方走 500 公尺以上，到達後面朝吉方靜坐接氣 40 分鐘。如有重要事（面試、簽約、談判），接氣後直接前往，效果最強。支援 15 種事件分類（求財、事業、感情、考試、談判、婚姻等），報告附帶 Google Calendar 一鍵新增。' },
            { q: '報告是繁體還是簡體？', a: '根據您使用網站時的語言設定自動決定。網站右上角可隨時切換繁簡體，報告會以您選擇的語言版本生成。' },
            { q: '報告會不會讓我更焦慮？', a: '不會。鑒源的報告融合正向心理學框架，所有分析都以「理解自己、找到方向」為目標，而非製造恐懼。我們不說「命中注定」「今年大凶」這類話。即使命盤中有挑戰的面向，我們也會用你聽得懂的語言解釋它的意義，並給出具體可行的方向。每份報告的最後都有一段「寫給你的話」，是鑒源團隊用心為你寫的個人化寄語。' },
          ].map((faq) => (
            <details key={faq.q} className="glass rounded-lg mb-3 group">
              <summary className="p-5 cursor-pointer font-semibold text-cream flex justify-between items-center text-sm">
                {faq.q}
                <span className="text-gold group-open:rotate-45 transition-transform text-lg ml-4 shrink-0">+</span>
              </summary>
              <div className="px-5 pb-5 text-sm text-text-muted leading-[1.9] border-t border-gold/5 pt-4">{faq.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* ========== Final CTA ========== */}
      <section className="py-28 relative">
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'radial-gradient(ellipse at 50% 100%, rgba(201,168,76,0.06) 0%, transparent 50%), radial-gradient(ellipse at 30% 50%, rgba(139,92,246,0.10) 0%, transparent 40%), radial-gradient(ellipse at 70% 30%, rgba(74,122,255,0.08) 0%, transparent 45%)',
        }} />
        <div className="relative z-10 max-w-2xl mx-auto px-6 text-center">
          <div className="divider-ornament text-gold/30 mb-6 justify-center">
            <span className="text-xs tracking-[0.2em]">開始</span>
          </div>
          <h2 className="text-3xl md:text-[40px] mb-4 text-cream leading-[1.4]" style={{ fontFamily: 'var(--font-sans)' }}>
            知命者不惑，識運者不憂
          </h2>
          <p className="text-text-muted mb-10 leading-[1.9] text-base">
            用 30 秒做一次免費命理速算，<br />
            看看十五套系統如何解讀你的命格密碼。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-5">
            <a href="/tools/bazi"
              className="inline-block px-10 py-4 bg-gold text-dark font-bold rounded-lg text-lg btn-glow">
              開始認識你自己
            </a>
            <a href="/pricing"
              className="inline-block px-10 py-4 glass text-cream font-semibold rounded-lg text-lg hover:bg-surface-hover transition-colors">
              我已經準備好了
            </a>
          </div>
          <p className="text-xs text-text-muted/50">不需註冊 &middot; 不需信用卡 &middot; 完全免費</p>
        </div>
      </section>
    </div>
  )
}
