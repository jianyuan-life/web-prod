// v5.6.10 R4:常見問題獨立頁(IA Agent P0、SEO long-tail、補對「鑒源退款」「鑒源跟某某不同」query)
import Link from 'next/link'
import type { Metadata } from 'next'
import { PUBLIC_CLAIMS } from '@/lib/public-claims'

export const metadata: Metadata = {
  title: '常見問題 FAQ',
  description: '鑒源命理平台常見問題解答:報告品質、付款、隱私、技術支援、命理系統說明。',
  alternates: { canonical: 'https://jianyuan.life/faq' },
}

type QA = { q: string; a: React.ReactNode }
type Section = { title: string; questions: QA[] }

const SECTIONS: Section[] = [
  {
    title: '報告品質',
    questions: [
      {
        q: '鑒源的命理分析準確嗎？',
        a: (
          <>
            {PUBLIC_CLAIMS.methodology.summary} {PUBLIC_CLAIMS.methodology.comparison}{' '}
            {PUBLIC_CLAIMS.methodology.limits}
          </>
        ),
      },
      {
        q: '不同方法的看法不一致時怎麼處理？',
        a: (
          <>
            {PUBLIC_CLAIMS.methodology.comparison} 報告會保留差異與資料限制，不把多數意見寫成確定答案。
          </>
        ),
      },
      {
        q: '報告字數多少？',
        a: (
          <ul className="list-disc pl-5 space-y-1">
            <li>人生藍圖 C:主題式深度報告、網頁重點版 + PDF 完整版</li>
            <li>家族藍圖 G15:家族互動與整體能量深度解讀</li>
            <li>月度精選 E3:最多 8 個嚴選吉時 + 主題用神說明 + 行事曆邀約</li>
          </ul>
        ),
      },
      {
        q: '為什麼晚上 23:00 後出生我看到的日期是隔天？(早子時 vs 夜子時)',
        a: (
          <>{PUBLIC_CLAIMS.tools.baziDayBoundaryFaq}</>
        ),
      },
      {
        q: '海外出生(非台灣)的客戶怎麼處理時區?',
        a: (
          <>{PUBLIC_CLAIMS.tools.birthLocationFaq}</>
        ),
      },
      {
        q: '奇門遁甲用的是什麼派別?',
        a: (
          <>
            鑒源奇門遁甲採「<strong className="text-gold">時家奇門 + 月家奇門 + 年家奇門</strong>」三盤合參、
            排盤 100% 對齊 Windada 古籍標準(20/20 局數驗證 + 八門 97.2% 命中)。
            <br />
            出門訣「月度精選」採時家占事派推薦邏輯(主題用神 60% 權重)、依您選定的主題精算吉時與方位。
            <br />
            32 凶格 hard filter + 25 吉格 boost + 真太陽時校正(v5.10.348+)、4 LLM 平均 99.5 分驗證。
          </>
        ),
      },
    ],
  },
  {
    title: '付款 & 服務保證',
    questions: [
      {
        q: '付款安全嗎？',
        a: (
          <>
            付款全程由 <strong className="text-gold">Stripe</strong> 處理(全球 PCI-DSS Level 1 認證)、信用卡資訊不經過鑒源伺服器。
            支援 Visa / MasterCard / Apple Pay / Google Pay，網站以 HTTPS 提供服務。
          </>
        ),
      },
      {
        q: '可以退款嗎？',
        a: (
          <>
            <strong className="text-gold">{PUBLIC_CLAIMS.trust.fulfillmentNotice}</strong>
            為維護所有客戶服務品質、我們提供以下保證:生成失敗自動重試 3 次、若仍失敗 24 小時內客服協助補開;
            內容明顯錯誤(如出生資料解讀錯誤)免費重新生成。詳見<Link href="/terms" className="text-gold underline">使用條款第 5 條</Link>。
          </>
        ),
      },
      {
        q: '生成失敗會發生什麼？',
        a: (
          <>
            系統會自動重試最多 3 次。若仍失敗、24 小時內 email 通知 + 客服協助補開新單(不需主動申請、不會多扣款)。
          </>
        ),
      },
      {
        q: '支援哪些幣別？',
        a: <>主要為美元 USD、Stripe 自動換算當地幣別(TWD / HKD / SGD / CNY 顯示參考價)。實際扣款以信用卡帳單為準。</>,
      },
    ],
  },
  {
    title: '隱私 & 資料',
    questions: [
      {
        q: '我的出生資料會被公開嗎？',
        a: (
          <>
            出生資料會用於排盤、報告、客服及你同意的分析用途，不會放在公開頁面。
            報告連結可供持有連結的人閱讀，請勿轉傳給不信任的人。詳見 <Link href="/privacy" className="text-gold underline">隱私政策</Link>。
          </>
        ),
      },
      {
        q: '可以刪除帳號嗎？',
        a: (
          <>
            {PUBLIC_CLAIMS.privacy.requestScope} 請寄信至 support@jianyuan.life，主旨註明「刪除帳號」。
          </>
        ),
      },
      {
        q: '如何提出 GDPR 或加州隱私要求？',
        a: (
          <>
            {PUBLIC_CLAIMS.privacy.gdprTiming} {PUBLIC_CLAIMS.privacy.ccpaApplicability}{' '}
            詳見 <Link href="/privacy" className="text-gold underline">隱私政策</Link>。
          </>
        ),
      },
    ],
  },
  {
    title: '報告生成 & 交付',
    questions: [
      {
        q: '報告多久可以收到？',
        a: <>{PUBLIC_CLAIMS.methodology.summary} 付費後由系統排盤並以 AI 輔助整理，通常約 30-60 分鐘完成；完成後會寄送 email，也可在 dashboard「我的報告」查看。</>,
      },
      {
        q: '報告生成失敗會怎樣？',
        a: <>系統會自動重試最多 3 次。若仍失敗、24 小時內 email 通知 + 客服協助補開新單、客戶不需主動申請、不會多扣款。</>,
      },
      {
        q: '需要提供什麼資料？',
        a: (
          <ul className="list-disc pl-5 space-y-1">
            <li>姓名(中英皆可)</li>
            <li>性別</li>
            <li>出生日期(國曆 / 農曆皆可)</li>
            <li>出生時辰(知道精確時間最佳、不知道也可分析三柱)</li>
            <li>出生地區(用於真太陽時校正、可選)</li>
          </ul>
        ),
      },
    ],
  },
  {
    title: '出門訣專屬',
    questions: [
      {
        q: '什麼是出門訣？怎麼用？',
        a: (
          <>
            出門訣源自奇門遁甲千年擇吉術、《煙波釣叟歌》記載「吉門吉方即行、凶門凶方即止」。
            鑒源以 25 層評分體系精算每個時辰八方位的能量、再套入您的個人年命宮驗證。
            <strong className="text-gold block mt-2">使用方法:</strong>
            <ol className="list-decimal pl-5 space-y-1 mt-1">
              <li>在報告推薦的吉時準時出門</li>
              <li>朝吉方走 500 公尺以上</li>
              <li>到達後面朝吉方靜坐接氣 40 分鐘</li>
              <li>有重要事(面試 / 簽約 / 談判)、接氣後直接前往、效果最強</li>
            </ol>
          </>
        ),
      },
      {
        q: '月度精選提供什麼？',
        a: (
          <>
            <strong className="text-cream">月度精選($89):</strong>依您選定的 1-3 個主題(事業 / 財運 / 感情 / 健康等)、
            先嚴剔 32 凶煞、再以 25 吉法則加權、嚴選當月最多 8 個高純度吉時 + 吉方。<br />
            因真吉稀缺、若當月不足會自動跨月延伸搜尋補足、寧缺勿濫不以低品質時窗湊數。
          </>
        ),
      },
    ],
  },
  {
    title: '其他',
    questions: [
      {
        q: '報告是繁體還是簡體？',
        a: <>預設繁體中文、可在右上「简」按鈕切換簡體。報告內容自動套用對應字體。</>,
      },
      {
        q: '報告會不會讓我更焦慮？',
        a: (
          <>
            鑒源刻意在每份報告加入「心靈視角」章節(融合榮格原型 / 正向心理學 / VIA 品格優勢)、
            分析後給出具體可執行的療癒路線圖、避免命理變成焦慮源。
          </>
        ),
      },
      {
        q: '可以幫家人朋友算嗎？',
        a: <>可以。需要對方知情同意才能取得他們的出生資料。報告連結為 UUID、可分享給對方共讀。</>,
      },
    ],
  },
]

export default function FAQPage() {
  return (
    <div className="jy-page jy-public-page jy-faq-page py-24">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-12">
          <div className="text-xs tracking-[0.3em] text-gold/60 mb-3">FAQ</div>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient-gold mb-3" style={{ fontFamily: 'var(--font-sans)' }}>
            常見問題
          </h1>
          <p className="text-text-muted text-sm">如果這裡找不到答案、歡迎寄信 support@jianyuan.life</p>
        </div>

        {SECTIONS.map((section) => (
          <section key={section.title} className="mb-12">
            <h2 className="text-xl font-bold text-cream mb-5 flex items-center gap-3">
              <span className="w-8 h-px bg-gold/40" aria-hidden="true" />
              {section.title}
            </h2>
            <div className="space-y-3">
              {section.questions.map((qa) => (
                <details key={qa.q} className="glass rounded-xl p-5 border border-gold/10 hover:border-gold/30 transition-colors group">
                  <summary className="cursor-pointer text-cream font-semibold text-sm flex items-center justify-between list-none">
                    <span>{qa.q}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gold transition-transform group-open:rotate-180 shrink-0 ml-4" aria-hidden="true" focusable="false">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </summary>
                  <div className="text-text text-sm leading-relaxed mt-4 pt-4 border-t border-gold/10">
                    {qa.a}
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}

        {/* 底部 CTA */}
        <div className="text-center mt-16 pt-12 border-t border-gold/10">
          <p className="text-text-muted text-sm mb-5">還有其他疑問？</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/pricing" className="px-6 py-2.5 rounded-full bg-gold text-dark font-semibold text-sm hover:bg-gold/90 transition-colors">
              查看方案與定價
            </Link>
            <a href="mailto:support@jianyuan.life" className="px-6 py-2.5 rounded-full border border-gold/40 text-gold hover:bg-gold/10 transition-colors text-sm">
              聯繫客服
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
