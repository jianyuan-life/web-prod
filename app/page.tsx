import Link from 'next/link'
import type { Metadata } from 'next'
import HeroCTAExperiment from '@/components/HeroCTAExperiment'
import HomeGuided from '@/components/HomeGuided'
import PricingCards from '@/components/PricingCards'

export const metadata: Metadata = {
  title: { absolute: '鑒源 JianYuan — 十四大命理系統精準分析｜八字、紫微斗數、奇門遁甲' },
  description: '鑒源整合八字、紫微斗數、奇門遁甲、西洋占星等最多十四大東西方命理系統，以 44,421+ 條古籍規則交叉分析，為您提供性格天賦、事業財運、感情婚姻的完整命格報告。免費體驗，即時出結果。',
  keywords: '命理, 八字, 紫微斗數, 奇門遁甲, 西洋占星, 命盤, 命格分析, 免費算命, 姓名學, 風水, 人類圖, 吠陀占星, 出門訣, 運勢',
  openGraph: {
    title: '鑒源 JianYuan — 十四大命理系統精準分析',
    description: '整合東西方十四大命理系統，一份報告看清性格天賦、事業方向、感情運勢。免費體驗，不需註冊。',
    url: 'https://jianyuan.life',
    siteName: '鑒源 JianYuan',
    type: 'website',
    locale: 'zh_TW',
  },
  twitter: {
    card: 'summary_large_image',
    title: '鑒源 JianYuan — 十四大命理系統精準分析',
    description: '整合東西方十四大命理系統，一份報告看清性格天賦、事業方向、感情運勢。',
  },
  alternates: { canonical: 'https://jianyuan.life' },
}

type SystemTier = 1 | 2 | 3

const SYSTEMS: { name: string; tier: SystemTier; desc: string }[] = [
  { name: '八字命理', tier: 1, desc: '性格底色、大運高低與事業、感情、財運的先天結構' },
  { name: '紫微斗數', tier: 1, desc: '從十二宮位檢視一生發展方向與不同階段的重點' },
  { name: '奇門遁甲', tier: 1, desc: '辨識適合行動的時間與方向，讓重要決策不只靠猜' },
  { name: '風水堪輿', tier: 2, desc: '理解居住環境與個人運勢的互動，以及可執行的調整' },
  { name: '西洋占星', tier: 2, desc: '由太陽、月亮與上升等位置理解外在表現與內在需求' },
  { name: '姓名學', tier: 2, desc: '解讀名字在人際、事業與第一印象上的能量結構' },
  { name: '吠陀占星', tier: 2, desc: '以印度占星的座標系統提供另一個人生軌跡視角' },
  { name: '易經占卜', tier: 2, desc: '聚焦當下的一個問題，從卦象提取可理解的判斷線索' },
  { name: '人類圖', tier: 2, desc: '理解個人的能量運作、決策方式與互動節奏' },
  { name: '數字能量學', tier: 3, desc: '從出生日期補充天賦、空缺與年度成長主題' },
  { name: '古典占星', tier: 3, desc: '以傳統天文觀測體系補充命格特質與流年走向' },
  { name: '塔羅牌', tier: 3, desc: '映照潛意識與當下狀態，補足問題背後的心理視角' },
  { name: '生肖運勢', tier: 3, desc: '整理太歲關係，以及年度中值得留意與把握的月份' },
  { name: '生物節律', tier: 3, desc: '呈現體力、情緒與思維週期，協助安排每月節奏' },
]

const SYSTEM_GROUPS: { tier: SystemTier; label: string; note: string }[] = [
  { tier: 1, label: '核心系統', note: '主要判斷' },
  { tier: 2, label: '交叉系統', note: '補充驗證' },
  { tier: 3, label: '參考系統', note: '擴展視角' },
]

const FAQS = [
  {
    q: '鑒源的命理分析準確嗎？',
    a: '排盤計算使用確定性算法，結果可重複驗證，並以數十部經典古籍提煉的規則進行解讀。鑒源的重點不是把單一系統說得更肯定，而是讓最多十四套系統互相核對；多數系統形成共識時，結論才會進入報告的主要判斷。',
  },
  {
    q: '報告多久可以收到？',
    a: '付款後系統會自動開始運算。個人報告通常約 30 分鐘完成；出門訣需排算數百個時辰，通常需要 40 分鐘以上。完成後會立即寄送 Email 通知，也可以在儀表板查看分析進度。',
  },
  {
    q: '需要提供什麼資料？',
    a: '姓名、出生日期、出生時間與性別。出生時間越精確，依賴時辰的分析越完整；若不確定出生時間，可以選擇最接近的時辰，其他不依賴時辰的系統仍可正常分析。',
  },
  {
    q: '十四套系統會不會互相矛盾？',
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
    a: '鑒源以理解自己與找到方向為目標，不使用「命中注定」或製造恐懼的表達。遇到命盤中的挑戰，報告會說明判斷依據、可能影響與可執行的方向，最後的選擇仍由您決定。',
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
    <div className="jy-report-artifact jy-panel" aria-label="人生藍圖報告版面示意">
      <div className="jy-report-artifact__top">
        <div className="jy-report-artifact__seal" aria-hidden="true">鑒源</div>
        <div className="jy-report-artifact__meta">
          LIFE BLUEPRINT<br />版面示意 · 非真實個案
        </div>
      </div>
      <div className="jy-report-artifact__body">
        <div className="jy-report-artifact__label">3 分鐘先看懂</div>
        <h2 className="jy-report-artifact__title">先給你結論，再帶你看見依據</h2>
        <div className="jy-insight-list">
          <div className="jy-insight">
            <span className="jy-insight__number">01</span>
            <span className="jy-insight__text">三個最值得先理解的核心發現，放在完整章節之前。</span>
          </div>
          <div className="jy-insight">
            <span className="jy-insight__number">02</span>
            <span className="jy-insight__text">每個重要判斷標示來自哪些命理系統與規則脈絡。</span>
          </div>
          <div className="jy-insight">
            <span className="jy-insight__number">03</span>
            <span className="jy-insight__text">把詮釋轉成能採取、能避開，也能自行判斷的方向。</span>
          </div>
        </div>
      </div>
      <div className="jy-report-artifact__footer" aria-label="報告資訊層級">
        <span>計算事實</span>
        <span>交叉詮釋</span>
        <span>行動建議</span>
      </div>
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="jy-page">
      <HomeGuided />

      <section className="jy-hero">
        <div className="jy-container jy-hero__grid">
          <div className="jy-hero__copy">
            <div className="jy-eyebrow">十四大系統 · 44,421 條規則庫打底</div>
            <h1 className="jy-display">
              不是多算一次，<br />
              是讓 <strong>14 套系統</strong>互相對照
            </h1>
            <p className="jy-lede">
              把八字、紫微斗數、奇門遁甲與東西方命理放在同一份分析裡。
              先呈現可核對的計算，再說明詮釋，最後給你能自行判斷的方向。
            </p>
            <div className="jy-actions">
              <HeroCTAExperiment />
              <Link href="#report-example" className="jy-button jy-button--secondary">
                先看報告怎麼讀 <ArrowIcon />
              </Link>
            </div>
            <div className="jy-reassurance" aria-label="免費體驗說明">
              <span>30 秒免費速算</span>
              <span>不需註冊</span>
              <span>不需信用卡</span>
              <span>資料加密傳輸</span>
            </div>
          </div>

          <ReportArtifact />
        </div>
      </section>

      <section className="jy-section jy-section--compact" aria-label="服務重點">
        <div className="jy-container">
          <dl className="jy-grid-4">
            <div className="jy-stat">
              <dt className="jy-stat__value">14</dt>
              <dd className="jy-stat__label">套東西方命理系統，依方案交叉分析</dd>
            </div>
            <div className="jy-stat">
              <dt className="jy-stat__value">44,421+</dt>
              <dd className="jy-stat__label">條專業規則，整理自古籍與分析框架</dd>
            </div>
            <div className="jy-stat">
              <dt className="jy-stat__value">30–60 分鐘</dt>
              <dd className="jy-stat__label">多數付費報告的預計生成時間</dd>
            </div>
            <div className="jy-stat">
              <dt className="jy-stat__value">US$29 起</dt>
              <dd className="jy-stat__label">一次性付款，網頁閱讀與 PDF 保存</dd>
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
              <h3 className="jy-subheading">確定性排盤</h3>
              <p className="jy-copy jy-copy--small">出生資料先經排盤與時間校正，生成可重複核對的命盤結果。</p>
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

      <section id="systems" className="jy-section jy-section--ruled">
        <div className="jy-container">
          <div className="jy-section-head">
            <div>
              <div className="jy-eyebrow">十四大系統</div>
              <h2 className="jy-heading">各自回答不同問題，再共同核對</h2>
            </div>
            <p className="jy-lede">
              核心系統負責主要判斷，交叉系統補足不同人生面向，參考系統提供額外視角。
              實際使用數量依方案與問題類型而定。
            </p>
          </div>

          <div className="jy-system-ledger jy-panel">
            {SYSTEM_GROUPS.map((group) => (
              <section className="jy-system-group" key={group.tier} aria-labelledby={`tier-${group.tier}`}>
                <h3 id={`tier-${group.tier}`} className="jy-system-group__title">
                  {group.label}<small>{group.note}</small>
                </h3>
                <ol className="jy-system-list">
                  {SYSTEMS.filter((system) => system.tier === group.tier).map((system, index) => (
                    <li key={system.name}>
                      <b>{String(index + 1).padStart(2, '0')}</b>
                      <span><strong>{system.name}</strong><br />{system.desc}</span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="jy-section">
        <div className="jy-container">
          <div className="jy-section-head">
            <div>
              <div className="jy-eyebrow">常用方案</div>
              <h2 className="jy-heading">先依你要解決的問題選擇</h2>
            </div>
            <div>
              <p className="jy-lede">
                所有價格都是一次性付款。方案卡會說明適合情境、分析範圍、交付內容與預計完成時間。
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
