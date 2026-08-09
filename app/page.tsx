import Link from 'next/link'
import type { Metadata } from 'next'
import HomeGuided from '@/components/HomeGuided'
import PricingCards from '@/components/PricingCards'

export const metadata: Metadata = {
  title: { absolute: '鑒源 JianYuan — 人生諮詢與家庭諮詢｜結論、依據、行動分層閱讀' },
  description: '鑒源將多套命理系統的計算事實、傳統詮釋與可行動建議分層呈現。人生藍圖整理個人議題，家族藍圖整理家庭互動；保留資料限制與不同訊號，不把詮釋包裝成命定。',
  keywords: '命理, 八字, 紫微斗數, 奇門遁甲, 西洋占星, 命盤, 命格分析, 免費算命, 姓名學, 風水, 人類圖, 吠陀占星, 出門訣, 運勢',
  openGraph: {
    title: '鑒源 JianYuan — 人生與家庭的分層諮詢報告',
    description: '先看結論，再追依據；把命理詮釋轉成可觀察的生活問題與下一步。',
    url: 'https://jianyuan.life',
    siteName: '鑒源 JianYuan',
    type: 'website',
    locale: 'zh_TW',
  },
  twitter: {
    card: 'summary_large_image',
    title: '鑒源 JianYuan — 人生與家庭的分層諮詢報告',
    description: '從 30 秒重點到依據附錄，分層讀懂個人議題與家庭互動。',
  },
  alternates: { canonical: 'https://jianyuan.life' },
}

const FAQS = [
  {
    q: '排盤可以驗算，是不是就等於人生預測一定準？',
    a: '不等於。相同的資料、曆法、流派設定與程式版本應能重複得到相同盤面；但命理詮釋不是經實證保證的人生預測。報告會把計算事實、傳統詮釋與行動建議分開，並標示不確定性。',
  },
  {
    q: '報告多久可以收到？',
    a: '付款後系統會自動開始運算。人生藍圖通常約 30–60 分鐘完成；家族藍圖依成員人數與可用資料而定。完成後會寄送 Email 通知，也可以在儀表板查看進度。',
  },
  {
    q: '需要提供什麼資料？',
    a: '姓名、出生日期、出生時間、出生地與必要的方案資料。不確定出生時間時，請如實標示已知範圍，不要猜一個時辰當作事實；受時間影響的部分會降低確定性或不出具。',
  },
  {
    q: '不同系統會不會互相矛盾？',
    a: '不同系統觀察的角度不同，出現差異是正常的。報告會區分共同結論、補充視角與需要自行核對的部分，而不是強行把所有結果寫成一致。',
  },
  {
    q: '付款安全嗎？',
    a: '所有付款透過 Stripe 處理。信用卡資訊不會經過鑒源伺服器；Stripe 已通過 PCI DSS Level 1 認證。付款前會清楚顯示方案與最終金額。',
  },
  {
    q: '可以退款嗎？',
    a: '報告屬於依個人資料即時生成的數位內容，一旦開始生成即消耗運算資源，因此生成後不支援退款。如果報告品質有問題，請聯繫 support@jianyuan.life，我們會協助檢查並在適用情況下重新生成。',
  },
  {
    q: '什麼是出門訣？',
    a: '出門訣源自奇門遁甲的擇吉方法。系統會依事件類型，計算不同時辰與方位的條件，再套入個人年命宮，整理適合行動的時間、方向與使用說明。',
  },
  {
    q: '報告是繁體還是簡體？',
    a: '報告會依您下單時選擇的網站語言生成。網站右上角可以切換繁體與簡體。',
  },
  {
    q: '報告會不會讓我更焦慮？',
    a: '鑒源以理解自己與整理問題為目標，不把挑戰寫成「命中注定」，也不用恐懼迫使你消費。若內容觸及急迫的醫療、法律、財務或心理健康風險，應先尋求合資格的專業協助，不用報告取代。',
  },
]

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function ReportArtifact() {
  return (
    <div className="jy-report-artifact jy-panel" aria-label="諮詢報告四層閱讀示意">
      <div className="jy-report-artifact__top">
        <div className="jy-report-artifact__seal" aria-hidden="true">鑒源</div>
        <div className="jy-report-artifact__meta">
          CONSULTATION DOSSIER<br />閱讀結構示意 · 非真實個案
        </div>
      </div>
      <div className="jy-report-artifact__body">
        <div className="jy-report-artifact__label">四層閱讀 · 各取所需</div>
        <h2 className="jy-report-artifact__title">先知道現在要處理什麼，再決定讀多深</h2>
        <div className="jy-insight-list">
          <div className="jy-insight">
            <span className="jy-insight__number">30 秒</span>
            <span className="jy-insight__text">三個當前優先題，不用先穿過專門術語。</span>
          </div>
          <div className="jy-insight">
            <span className="jy-insight__number">3 分鐘</span>
            <span className="jy-insight__text">把工作、關係、金錢與生活節奏排出順序。</span>
          </div>
          <div className="jy-insight">
            <span className="jy-insight__number">深入閱讀</span>
            <span className="jy-insight__text">用具體情境理解模式、例外與可練習的下一步。</span>
          </div>
          <div className="jy-insight">
            <span className="jy-insight__number">依據附錄</span>
            <span className="jy-insight__text">追回計算事實、系統訊號、相反觀點與資料限制。</span>
          </div>
        </div>
      </div>
      <div className="jy-report-artifact__footer" aria-label="報告資訊層級">
        <span>計算事實</span>
        <span>傳統詮釋</span>
        <span>行動建議</span>
      </div>
    </div>
  )
}

const CONSULTATION_PATHS = [
  {
    code: 'C',
    className: 'jy-home-consultation--life',
    eyebrow: '人生諮詢',
    title: '先把「我現在為什麼卡住」說清楚',
    body: '整理你的天賦、壓力反應、關係模式與人生階段。重點不是貼標籤，而是找到現在能觀察、能調整的入口。',
    notes: ['適合個人轉折與長期規劃', '依實際年齡調整閱讀重點', '包含 90 天行動與回顧頁'],
    href: '/life-blueprint',
    linkLabel: '看人生藍圖完整交付內容',
  },
  {
    code: 'G15',
    className: 'jy-home-consultation--family',
    eyebrow: '家庭諮詢',
    title: '再把「我們為什麼總在重複同一場衝突」攤開',
    body: '把每個人的需要、防衛與溝通節奏放在同一張家庭地圖，不根據性別或長幼指定角色，也不找一個人負責所有問題。',
    notes: ['需先有 2–8 份已完成的人生藍圖', '逐對整理互動而非只給總評', '含家庭會議腳本與共同練習'],
    href: '/family-blueprint',
    linkLabel: '看家族藍圖完整前置與交付',
  },
] as const

export default function HomePage() {
  return (
    <div className="jy-page jy-home-page">
      <HomeGuided />

      <section className="jy-hero">
        <div className="jy-container jy-hero__grid">
          <div className="jy-hero__copy">
            <div className="jy-eyebrow">人生諮詢 · 家庭諮詢 · 可追回依據</div>
            <h1 className="jy-display">
              先看清你的<strong>人生</strong>，<br />
              再理解<strong>一家人</strong>
            </h1>
            <p className="jy-lede">
              鑒源把排盤事實、傳統詮釋、不同訊號與行動建議分開整理。
              先告訴你現在最值得處理的問題，再讓你自己決定要相信多少、採取什麼。
            </p>
            <div className="jy-actions" aria-label="主要諮詢入口">
              <Link href="/life-blueprint" className="jy-button jy-button--primary">
                了解人生藍圖 <ArrowIcon />
              </Link>
              <Link href="/family-blueprint" className="jy-button jy-button--secondary">
                了解家族藍圖 <ArrowIcon />
              </Link>
            </div>
            <Link href="/tools/bazi" className="jy-home-free-link">
              還沒準備委託？先用免費排盤看呈現方式 <ArrowIcon />
            </Link>
            <div className="jy-reassurance" aria-label="諮詢原則">
              <span>不把未知寫成確定</span>
              <span>依人生階段調整</span>
              <span>保留分歧與例外</span>
              <span>重大決定仍由你做</span>
            </div>
          </div>

          <ReportArtifact />
        </div>
      </section>

      <section className="jy-section jy-section--compact jy-home-briefing" aria-labelledby="home-briefing-title">
        <div className="jy-container">
          <h2 id="home-briefing-title" className="sr-only">委託前先知道的三件事</h2>
          <dl className="jy-home-briefing__grid">
            <div>
              <dt>你會先看到</dt>
              <dd>當前最重要的議題、可使用的資源，以及現在不必急著處理的事。</dd>
            </div>
            <div>
              <dt>會標示的限制</dt>
              <dd>出生資料缺口、影響計算的設定、不同系統的相反訊號與無法推論的部分。</dd>
            </div>
            <div>
              <dt>完成後怎麼用</dt>
              <dd>先讀摘要，再依當下問題深入章節；把有感與不符合的部分都帶回生活驗證。</dd>
            </div>
          </dl>
        </div>
      </section>

      <section id="report-example" className="jy-section jy-section--paper">
        <div className="jy-container">
          <div className="jy-section-head">
            <div>
              <div className="jy-eyebrow">報告閱讀體驗</div>
              <h2 className="jy-heading">一份長報告，不該先讓你迷路</h2>
            </div>
            <p className="jy-lede">
              首頁先給結論，章節再展開依據。計算結果、傳統詮釋與行動建議各自有清楚的位置，
              讓你知道哪些是可核對的事實，哪些需要保留自己的判斷。
            </p>
          </div>

          <div className="jy-grid-3">
            <article className="jy-card jy-feature">
              <div className="jy-feature__number">01 · SUMMARY</div>
              <h3 className="jy-subheading">先讀三分鐘摘要</h3>
              <p className="jy-copy jy-copy--small">
                核心發現、近期主題與可行動方向先出現；不必先穿過十幾章術語，才找到最重要的答案。
              </p>
            </article>
            <article className="jy-card jy-feature">
              <div className="jy-feature__number">02 · EVIDENCE</div>
              <h3 className="jy-subheading">知道結論從哪裡來</h3>
              <p className="jy-copy jy-copy--small">
                排盤結果、使用規則與跨系統共識分層呈現；遇到資料不足或系統分歧，也會清楚標示。
              </p>
            </article>
            <article className="jy-card jy-feature">
              <div className="jy-feature__number">03 · ACTION</div>
              <h3 className="jy-subheading">把理解變成下一步</h3>
              <p className="jy-copy jy-copy--small">
                每章不只描述性格與趨勢，也整理可以採取、應該避免，以及需要自行核對的事項。
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="jy-section">
        <div className="jy-container">
          <div className="jy-section-head">
            <div>
              <div className="jy-eyebrow">分析方法</div>
              <h2 className="jy-heading">權威感，來自可解釋，不是更神祕</h2>
            </div>
            <p className="jy-lede">
              鑒源把分析拆成三層：先排盤與計算，再由多套系統互相印證，最後才形成白話解讀與建議。
              報告不是把每個結果都說得很肯定，而是保留限制與差異。
            </p>
          </div>

          <div className="jy-grid-3">
            <article className="jy-card jy-card--quiet jy-feature">
              <div className="jy-feature__number">CALCULATE</div>
              <h3 className="jy-subheading">可重播的計算</h3>
              <p className="jy-copy jy-copy--small">保留輸入資料、曆法、流派設定與程式版本，讓同一次排盤可重新核對。</p>
            </article>
            <article className="jy-card jy-card--accent jy-feature">
              <div className="jy-feature__number">CROSS-CHECK</div>
              <h3 className="jy-subheading">多系統交叉</h3>
              <p className="jy-copy jy-copy--small">不是單一老師的一句判斷；不同系統的共識、補充與衝突分開處理。</p>
            </article>
            <article className="jy-card jy-card--quiet jy-feature">
              <div className="jy-feature__number">INTERPRET</div>
              <h3 className="jy-subheading">白話與行動</h3>
              <p className="jy-copy jy-copy--small">把術語轉為生活情境與行動方向，同時說明資料限制與判斷邊界。</p>
            </article>
          </div>
        </div>
      </section>

      <section id="systems" className="jy-section jy-section--ruled jy-home-consultation" aria-labelledby="consultation-paths-title">
        <div className="jy-container">
          <div className="jy-section-head">
            <div>
              <div className="jy-eyebrow">兩份相連的卷宗</div>
              <h2 id="consultation-paths-title" className="jy-heading">先整理個人，才能在家庭裡保留每個人</h2>
            </div>
            <p className="jy-lede">
              人生藍圖是每位成員的個人底稿；家族藍圖再把已完成的個人底稿放在一起，看互動而不是把某一個人定義成問題。
            </p>
          </div>

          <div className="jy-home-consultation__grid">
            {CONSULTATION_PATHS.map((path, index) => (
              <article className={`jy-home-consultation__card ${path.className}`} key={path.code}>
                <header>
                  <span className="jy-home-consultation__index" aria-hidden="true">0{index + 1}</span>
                  <div>
                    <div className="jy-home-consultation__code">{path.code} · {path.eyebrow}</div>
                    <h3>{path.title}</h3>
                  </div>
                </header>
                <p>{path.body}</p>
                <ul>
                  {path.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
                <Link href={path.href} className="jy-home-consultation__link">
                  {path.linkLabel} <ArrowIcon />
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="jy-section">
        <div className="jy-container">
          <div className="jy-section-head">
            <div>
              <div className="jy-eyebrow">完整方案</div>
              <h2 className="jy-heading">看完內容邊界，再決定是否委託</h2>
            </div>
            <div>
              <p className="jy-lede">
                所有價格都是一次性付款。方案卡列出適合情境、分析範圍、交付內容與預計完成時間；付款前仍可回到 C 或 G15 的完整說明逐項核對。
              </p>
              <Link href="/pricing" className="jy-link inline-flex min-h-11 items-center gap-2 mt-4">
                查看三個方案的完整說明 <ArrowIcon />
              </Link>
            </div>
          </div>
          <PricingCards />
        </div>
      </section>

      <section id="how" className="jy-section jy-section--paper">
        <div className="jy-container">
          <div className="jy-section-head">
            <div>
              <div className="jy-eyebrow">從資料到報告</div>
              <h2 className="jy-heading">每一步都知道接下來會發生什麼</h2>
            </div>
            <p className="jy-lede">
              選方案、確認出生資料、付款、生成、閱讀。過程中會保留已填資料，完成後以 Email 通知，
              也能在儀表板查看狀態。
            </p>
          </div>

          <ol className="jy-steps">
            {[
              ['免費體驗', '先用八字速算理解分析方式，不需註冊。'],
              ['選擇方案', '依人生、關係、家庭或行動時機選擇。'],
              ['確認資料', '逐項核對姓名、日期、時間、地點與方案。'],
              ['安全付款', '由 Stripe 處理付款並顯示最終金額。'],
              ['閱讀報告', 'Email 通知完成，線上閱讀並保存 PDF。'],
            ].map(([title, desc]) => (
              <li className="jy-step" key={title}>
                <h3 className="jy-subheading">{title}</h3>
                <p className="jy-copy jy-copy--small mt-3">{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="jy-section">
        <div className="jy-container">
          <div className="jy-section-head">
            <div>
              <div className="jy-eyebrow">適合什麼時候使用</div>
              <h2 className="jy-heading">不是替你決定，而是把問題看完整</h2>
            </div>
            <p className="jy-lede">
              命理可以是一種整理資訊與自我對話的方法。以下是常見的使用情境，不是效果保證，也不取代專業的醫療、法律或財務建議。
            </p>
          </div>
          <div className="jy-grid-3">
            <article className="jy-card jy-feature">
              <div className="jy-feature__number">CAREER</div>
              <h3 className="jy-subheading">人生與事業轉折</h3>
              <p className="jy-copy jy-copy--small">想理解自己的長處、工作方式、階段性重點，以及現在的選擇是否符合長期方向。</p>
            </article>
            <article className="jy-card jy-feature">
              <div className="jy-feature__number">RELATIONSHIP</div>
              <h3 className="jy-subheading">關係與家庭互動</h3>
              <p className="jy-copy jy-copy--small">想看見兩人互動模式、價值差異與溝通盲點，為重要關係建立更好的對話起點。</p>
            </article>
            <article className="jy-card jy-feature">
              <div className="jy-feature__number">TIMING</div>
              <h3 className="jy-subheading">重要行動的時機</h3>
              <p className="jy-copy jy-copy--small">面對面試、簽約、談判或搬遷等事件，希望多一組時間與方位的參考資訊。</p>
            </article>
          </div>
        </div>
      </section>

      <section className="jy-section jy-section--ruled">
        <div className="jy-container">
          <div className="jy-panel jy-quote">
            <div className="jy-eyebrow">為什麼是鑒源</div>
            <blockquote>
              「命理的目標從來不是逆天改命，而是一個自我對話的過程——更了解自己，才能更完整地發揮自己的天賦。」
            </blockquote>
            <footer>
              Jamie · 鑒源創辦人<br />
              回到源頭，看清本質。把選擇的權力，交還給你自己。
            </footer>
            <Link href="/about" className="jy-link inline-flex min-h-11 items-center gap-2 mt-6">
              閱讀創辦人完整故事 <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>

      <section className="jy-section">
        <div className="jy-container jy-container--reading">
          <div className="text-center mb-12">
            <div className="jy-eyebrow">常見問題</div>
            <h2 className="jy-heading mx-auto mt-5">付款前，先把重要的事說清楚</h2>
          </div>
          <div className="jy-faq">
            {FAQS.map((faq) => (
              <details key={faq.q}>
                <summary>{faq.q}</summary>
                <div className="jy-faq__answer">{faq.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="jy-section jy-section--paper jy-final-cta">
        <div className="jy-container jy-container--reading relative">
          <div className="jy-eyebrow">從免費速算開始</div>
          <h2 className="jy-heading mt-5">先看見自己的命盤，再決定要不要走得更深</h2>
          <p className="jy-lede mt-5">
            30 秒完成八字速算，不需註冊、不需信用卡。先體驗鑒源如何呈現計算、解讀與方向。
          </p>
          <div className="jy-actions justify-center">
            <Link href="/tools/bazi" className="jy-button jy-button--primary">
              開始免費速算 <ArrowIcon />
            </Link>
            <Link href="/pricing" className="jy-button jy-button--quiet">
              直接比較方案
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
