// v5.6.10 R4:常見問題獨立頁(IA Agent P0、SEO long-tail、補對「鑒源退款」「鑒源跟某某不同」query)
import Link from 'next/link'
import type { Metadata } from 'next'

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
            排盤計算使用確定性算法(壽星天文曆 / Swiss Ephemeris / Lahiri Ayanamsa)、結果可重複驗證。
            分析解讀基於 44,421+ 條源自《滴天髓》《紫微斗數全書》《窮通寶鑑》《奇門遁甲統宗》等經典古籍提煉的專業規則、
            由 Claude Opus AI 整合成個人化報告。鑒源最多用 14 套系統交叉分析——當多數系統得出相同結論時、可信度遠高於單一系統的判斷。
          </>
        ),
      },
      {
        q: '14 套系統會不會互相矛盾？',
        a: (
          <>
            不同系統觀察的角度不同、偶有差異屬正常。這正是鑒源的核心價值——三層加權架構進行交叉驗證、取各系統共識作為最終結論。
            單一系統只有一個觀點、14 套系統交叉驗證才能得到更全面、更可靠的結論。
          </>
        ),
      },
      {
        q: '報告字數多少？',
        a: (
          <ul className="list-disc pl-5 space-y-1">
            <li>人生藍圖 C:11 章主題式深度報告、約 30,000 字+</li>
            <li>家族藍圖 G15:每位成員 8,000 字+ 互動分析</li>
            <li>合否? R:約 8,000 字+ 雙人合盤</li>
            <li>心之所惑 D:約 5,000 字+ 主題聚焦</li>
            <li>事件擇吉 E1:約 4,000 字 + Top3 吉時 + 行事曆邀約</li>
            <li>月度單盤 E2 / 月度精選 E3 / 年度全運 E4:依方案規格</li>
          </ul>
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
            支援 Visa / MasterCard / Apple Pay / Google Pay。網站使用 SSL/TLS 1.3 + AES-256 加密。
          </>
        ),
      },
      {
        q: '可以退款嗎？',
        a: (
          <>
            <strong className="text-gold">鑒源報告為個人化數位商品、付款後即開始精密計算、依國際電子商品慣例不支援退款。</strong>
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
            不會。出生資料(姓名 / 生日 / 出生地)僅用於生成您的報告、加密儲存於 Supabase AWS 新加坡區、不對外公開。
            報告連結為 UUID token、僅持有 token 的人可閱讀。詳見 <Link href="/privacy" className="text-gold underline">隱私政策</Link>。
          </>
        ),
      },
      {
        q: '可以刪除帳號嗎？',
        a: (
          <>
            可以。寄信至 support@jianyuan.life 標題「刪除帳號」、我們在 7 個工作日內確認、30 天內完成刪除。
            符合 GDPR Art.17(被遺忘權)與 CCPA 規範。
          </>
        ),
      },
      {
        q: 'GDPR / CCPA 規範如何符合？',
        a: (
          <>
            鑒源依 GDPR / CCPA 標準處理個人資料、Cookie 使用 Google Consent Mode v2 預設拒絕分析與行銷。
            詳見 <Link href="/privacy" className="text-gold underline">隱私政策第 7-9 條</Link>。
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
        a: <>付費後系統會自動排盤 + 14 套命理系統運算 + AI 整合、約 30-60 分鐘完成。完成後 email 通知 + 可在 dashboard「我的報告」查看。</>,
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
        q: 'E2 月度單盤、E3 月度精選 — 差別在哪？',
        a: (
          <>
            <strong className="text-cream">E2 月度單盤($29):</strong>當月 1 個吉時 + 主吉方、入門首選、預算精打細算者。<br />
            <strong className="text-cream">E3 月度精選($89):</strong>當月 8 個吉時(4 週 ×Top2)、主題用神(事業 / 財運等)、密集補運進階版。<br />
            兩者都是「整月適用」、但 E3 提供 8 倍密度 + 主題聚焦。
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
    <div className="py-24">
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
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-gold transition-transform group-open:rotate-180 shrink-0 ml-4">
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
