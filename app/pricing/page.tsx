import Link from 'next/link'
import PriceTag from '@/components/PriceTag'
import PricingButton from '@/components/PricingButton'
import { PromotionTopBanner, PromotionPrice } from '@/components/PromotionBanner'
import FunnelPageHit from '@/components/FunnelPageHit'
import GoldMark from '@/components/GoldMark'

// v5.10.467:方案陣容收斂(2026-08-01 拍板:只售 C / G15 / E3,其餘隱藏、詳見 lib/plan-names.ts VISIBLE_PLAN_CODES)
const PLANS = {
  personal: [
    { code: 'C', name: '人生藍圖', price: 89, popular: true, systems: 14,
      valueHint: '旗艦完整分析 · 每套系統僅 $6.4',
      desc: '一份報告，看清人生全貌——性格天賦、事業方向、財運走勢、感情歸宿、大運機遇。十四套東西方系統交叉驗證，正文全白話直說結論，每個判斷都可展開核對命理依據',
      suitableFor: '想一次看清自己的全貌，或站在人生十字路口需要方向的人；也是「家族藍圖」的前置基礎',
      features: ['人生速覽——30 秒抓住你的核心定位', '原廠設定與底層邏輯——性格、天賦、行為模式', '核心競爭力與財富路徑', '感情與人際磁場', '精準診斷書——聚焦你當下最大的卡點', '未來五年戰略推演＋關鍵節點', '專屬開運與防禦清單', '刻意練習——具體可執行的改善計劃', '每個結論可展開「查看命理邏輯」核對依據', '網頁重點版＋PDF 完整版'],
    },
  ],
  family: [
    { code: 'G15', name: '家族藍圖', price: 59, systems: 14,
      desc: '在每位家人各自完成「人生藍圖」後，系統調取所有成員的命格數據，深度分析家庭互動關係、溝通模式、共同運勢——讓你看見家人之間看不見的能量流動',
      suitableFor: '前提：每位家庭成員需先購買「人生藍圖」（$89），家族藍圖專做互動分析',
      features: ['需先完成每位成員的「人生藍圖」', '家族能量圖譜（五行互補/衝突分析）', '每對成員互動關係深度解析', '親子教養 / 夫妻相處具體建議', '家運走勢+共同行動指南', '寫給這個家的話'],
    },
  ],
  chumenji: [
    { code: 'E3', name: '月度精選', price: 89, popular: true,
      valueHint: '寧缺勿濫、最多 8 個高純度吉時',
      desc: '月度頂規嚴選——古法奇門遁甲先嚴剔 32 凶煞、再以 25 吉法則加權、為您選定的 1-3 個主題用神尋找最多 8 個高純度吉窗。因真吉稀缺，若當月不足，系統自動跨月延伸搜尋至補足，寧缺勿濫不以低品質時窗湊數',
      suitableFor: '看完人生藍圖知道「該往哪走」之後，需要每月具體「何時動、往哪動」的行動時窗',
      features: ['最多 8 個嚴選吉時（不足跨月補足、不湊數）', '選 1-3 個主題（事業／財運／感情／健康／學業／貴人／化解小人／家庭）', '32 凶硬剔（五黃 / 太歲 / 三煞 / 死門 / 凶格等、凶時不放行）', '25 吉加權（含主題用神對應 60% 權重）', '真太陽時經度校準（港台客戶實測差 ±23 分）', '個人年命宮交叉驗證', '行事曆邀約一鍵加入', '古法占事派正統'],
    },
  ],
}

type Plan = {
  code: string
  name: string
  price: number
  desc: string
  features: string[]
  systems?: number
  popular?: boolean
  locked?: boolean
  seasonal?: boolean
  hasQuestion?: boolean
  addPrice?: number
  suitableFor?: string
  valueHint?: string
}

const PLAN_PRESENTATION: Record<string, { delivery: string; eta: string }> = {
  C: { delivery: '網頁重點版＋PDF 完整版', eta: '通常約 30–60 分鐘' },
  G15: { delivery: '家庭互動報告；成員個別分析＋互動關係解讀', eta: '依家庭成員數量而定' },
  E3: { delivery: '最多 8 個吉時、主題用神與行事曆邀約', eta: '通常需 40 分鐘以上' },
}

const COMPARE_ROWS = [
  { feature: '分析對象', c: '你自己', g: '整個家庭', e3: '你的每月行動時機' },
  { feature: '回答的問題', c: '我是誰、往哪走', g: '家人之間如何互動', e3: '何時動、往哪個方位動' },
  { feature: '分析系統數', c: '14套', g: '14套', e3: '古法奇門遁甲' },
  { feature: '大運流年走勢', c: '&#10003;', g: '&#10003;', e3: '--' },
  { feature: '多人互動分析', c: '--', g: '&#10003;', e3: '--' },
  { feature: '吉時與方位', c: '--', g: '--', e3: '&#10003;' },
  { feature: '前置條件', c: '無', g: '每位成員先完成人生藍圖', e3: '無' },
] as const

const FAQS = [
  {
    q: '命理分析真的準確嗎？',
    a: '鑒源的排盤使用確定性算法（壽星天文曆、Swiss Ephemeris），相同資料可得到相同盤面。解讀則以古籍規則與多套系統交叉分析；它提供的是可核對的觀察與行動參考，不是對人生結果的保證。',
  },
  {
    q: '報告多久生成？',
    a: '人生藍圖通常約 30–60 分鐘；家族藍圖依家庭成員人數增加；月度精選需排算大量時辰，通常需要 40 分鐘以上。付款後系統自動運算，完成後可在網頁查看。',
  },
  {
    q: '可以退款嗎？',
    a: '報告為依個人資料即時生成的數位內容，一旦開始生成即消耗運算資源，因此生成後不支援退款。如果報告品質有問題，請聯繫 support@jianyuan.life，我們會協助檢查並在適用情況下重新生成。',
  },
  {
    q: '付款方式有哪些？安全嗎？',
    a: '付款透過 Stripe（PCI DSS Level 1 認證）處理，支援 Visa、Mastercard、AMEX 等主流信用卡。卡號不會經過鑒源伺服器，全程加密。',
  },
  {
    q: '三個方案怎麼選？',
    a: '「人生藍圖」回答「我是誰、往哪走」，是所有分析的基礎；「家族藍圖」在每位家人完成人生藍圖後，分析家庭互動；「月度精選」則是拿到方向之後的行動工具——每月依你的主題提供吉時與方位。多數人從人生藍圖開始。',
  },
  {
    q: '人生藍圖和月度精選是什麼關係？',
    a: '人生藍圖是「診斷」：看清你的性格、路徑與時機窗口；月度精選是「行動」：把窗口落實成每月具體的吉時與方位。先有藍圖再擇時，行動才有方向。',
  },
  {
    q: '不確定出生時間怎麼辦？',
    a: '可以選擇最接近的時辰。出生時間越精確，依賴時辰的分析越完整；姓名學、數字能量學、生肖運勢等不依賴精確時辰的系統仍可提供補充觀察。',
  },
  {
    q: '出門訣為什麼不提供「隔天」替代方案？',
    a: '古法奇門遁甲「一時一盤」，不同時辰會形成不同盤面。若錯過推薦時窗，需要等待系統下一個符合條件的時窗，而不是直接以隔天同一時間替代。',
  },
]

const GUIDE_ITEMS = [
  { title: '想全面理解自己', body: '選「人生藍圖」C；涵蓋主要人生面向與大運流年，是所有分析的起點。', href: '#plan-c' },
  { title: '理解整個家庭', body: '先為每位成員完成人生藍圖，再選「家族藍圖」G15 分析互動。', href: '#plan-g15' },
  { title: '規劃每月行動時機', body: '選「月度精選」E3；依你的主題提供最多八個高純度吉時與方位。', href: '#plan-e3' },
]

function CellValue({ value }: { value: string }) {
  if (value === '&#10003;') {
    return (
      <span className="jy-pricing-table__included">
        <GoldMark className="h-3.5 w-3.5" />
        <span className="sr-only">包含</span>
      </span>
    )
  }
  if (value === '--') return <span className="jy-pricing-table__empty">—</span>
  return <>{value}</>
}

function PlanCard({ plan, promotionAware }: { plan: Plan; promotionAware: boolean }) {
  const presentation = PLAN_PRESENTATION[plan.code]
  const price = <PriceTag usd={plan.price} size="md" />

  return (
    <article id={`plan-${plan.code.toLowerCase()}`} className="jy-pricing-plan jy-card" aria-labelledby={`plan-title-${plan.code}`}>
      <header className="jy-pricing-plan__header">
        <div>
          <div className="jy-pricing-plan__code">方案 {plan.code}</div>
          <h3 id={`plan-title-${plan.code}`} className="jy-subheading">{plan.name}</h3>
        </div>
        {plan.seasonal && <span className="jy-pricing-plan__status">固定開放期 · 立春前 30 天</span>}
      </header>

      <p className="jy-pricing-plan__description">{plan.desc}</p>

      <dl className="jy-pricing-plan__facts">
        <div>
          <dt>適合誰</dt>
          <dd>{plan.suitableFor}</dd>
        </div>
        <div>
          <dt>交付內容</dt>
          <dd>{presentation.delivery}</dd>
        </div>
        <div>
          <dt>預計完成</dt>
          <dd>{presentation.eta}</dd>
        </div>
      </dl>

      <div className="jy-pricing-plan__price">
        <div>
          {promotionAware ? (
            <PromotionPrice planCode={plan.code} originalPrice={plan.price}>{price}</PromotionPrice>
          ) : price}
          {plan.addPrice && <span className="jy-pricing-plan__add-on">加人 +${plan.addPrice}/人</span>}
        </div>
        <span>一次性付款 · 以 USD 為基準</span>
      </div>

      {plan.valueHint && <p className="jy-pricing-plan__scope">{plan.valueHint}</p>}

      <div className="jy-pricing-plan__contents">
        <h4>方案包括</h4>
        <ul>
          {plan.features.map((feature) => (
            <li key={feature}>
              <GoldMark className="mt-1 h-3.5 w-3.5" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="jy-pricing-plan__action">
        <PricingButton
          code={plan.code}
          popular={plan.popular}
          seasonal={plan.seasonal}
          locked={plan.locked}
        />
      </div>
    </article>
  )
}

function PlanSection({
  id,
  eyebrow,
  title,
  description,
  plans,
}: {
  id: string
  eyebrow: string
  title: string
  description: string
  plans: Plan[]
}) {
  return (
    <section id={id} className="jy-section jy-pricing-catalog-section">
      <div className="jy-container">
        <div className="jy-section-head">
          <div>
            <div className="jy-eyebrow">{eyebrow}</div>
            <h2 className="jy-heading">{title}</h2>
          </div>
          <p className="jy-copy">{description}</p>
        </div>
        <div className="jy-pricing-plan-grid">
          {plans.map((plan) => <PlanCard key={plan.code} plan={plan} promotionAware />)}
        </div>
      </div>
    </section>
  )
}

function ComparisonTable({
  caption,
  columns,
  rows,
  note,
}: {
  caption: string
  columns: Array<{ key: string; name: string; code: string; price: number }>
  rows: ReadonlyArray<Record<string, string>>
  note: string
}) {
  return (
    <>
      <div className="jy-pricing-table-wrap" role="region" aria-label={caption} tabIndex={0}>
        <table className="jy-pricing-table">
          <caption>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">比較項目</th>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  <span>{column.name}</span>
                  <small>{column.code} · USD ${column.price}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.feature}>
                <th scope="row">{row.feature}</th>
                {columns.map((column) => (
                  <td key={column.key}><CellValue value={row[column.key]} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="jy-pricing-table-note">{note}</p>
    </>
  )
}

export default function PricingPage() {
  const indexGroups = [
    { label: '個人分析', plans: PLANS.personal },
    { label: '家庭分析', plans: PLANS.family },
    { label: '奇門擇吉', plans: PLANS.chumenji },
  ]

  return (
    <div className="jy-page jy-pricing-page">
      <FunnelPageHit step="visit_pricing" />

      <header className="jy-pricing-hero">
        <div className="jy-container jy-pricing-hero__grid">
          <div className="jy-pricing-hero__copy">
            <div className="jy-eyebrow">方案目錄 · PRICING</div>
            <h1 className="jy-display jy-pricing-display">
              <span>先看交付範圍，</span>
              <span>再決定是否委託</span>
            </h1>
            <p className="jy-lede">
              三個方案對應三種需求：看清自己、看懂家庭、抓準時機。價格皆為一次性付款；每張方案卡清楚列出適合情境、交付內容、完成時間與分析範圍。
            </p>
            <div className="jy-actions">
              <Link href="#personal-analysis" className="jy-button jy-button--primary">查看分析方案</Link>
              <Link href="/tools/bazi" className="jy-button jy-button--secondary">先免費速算</Link>
            </div>
            <p className="jy-pricing-auth-note">
              購買前需先<Link href="/auth/signup" className="jy-link">免費註冊</Link>或<Link href="/auth/login" className="jy-link">登入</Link>；方案完成後保存在帳號中。
            </p>
          </div>

          <nav className="jy-pricing-index jy-panel" aria-label="定價方案索引">
            <div className="jy-pricing-index__head">
              <span>委託索引</span>
              <span>一次性 USD</span>
            </div>
            {indexGroups.map((group) => (
              <div key={group.label} className="jy-pricing-index__group">
                <div className="jy-pricing-index__label">{group.label}</div>
                {group.plans.map((plan) => (
                  <Link key={plan.code} href={`#plan-${plan.code.toLowerCase()}`} className="jy-pricing-index__row">
                    <span className="jy-pricing-index__code">{plan.code}</span>
                    <span>{plan.name}</span>
                    <strong>${plan.price}</strong>
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </header>

      <div className="jy-container jy-pricing-promotion" aria-live="polite">
        <PromotionTopBanner />
      </div>

      <section className="jy-section jy-section--compact jy-section--ruled" aria-label="購買與交付說明">
        <div className="jy-container">
          <dl className="jy-pricing-assurances">
            <div><dt>定價</dt><dd>所有方案一次性付款，非訂閱制</dd></div>
            <div><dt>幣別</dt><dd>以 USD 為基準，可顯示所在地參考幣值</dd></div>
            <div><dt>付款</dt><dd>由 Stripe 加密處理信用卡資料</dd></div>
            <div><dt>交付</dt><dd>網頁查看；適用方案另附 PDF 或行事曆</dd></div>
          </dl>
        </div>
      </section>

      <PlanSection
        id="personal-analysis"
        eyebrow="個人 · PERSONAL"
        title="一次看清完整人生全貌"
        description="性格天賦、事業方向、財運走勢、感情歸宿、大運機遇——十四套東西方系統交叉驗證，正文白話直說結論，每個判斷都可核對命理依據。"
        plans={PLANS.personal}
      />

      <PlanSection
        id="relationship-analysis"
        eyebrow="家庭 · FAMILY"
        title="看見家人之間看不見的能量流動"
        description="家族藍圖分析整個家庭的溝通與互動。方案有明確前置條件——每位成員需先完成人生藍圖，請先核對方案卡。"
        plans={PLANS.family}
      />

      <section id="qimen-selection" className="jy-section jy-section--paper">
        <div className="jy-container">
          <div className="jy-pricing-method jy-panel">
            <div>
              <div className="jy-eyebrow">奇門擇吉 · QIMEN</div>
              <h2 className="jy-heading">出門訣把時間、方位與個人年命放在同一張盤上</h2>
              <p className="jy-copy">
                古法奇門遁甲記載：「吉門吉方即行，凶門凶方即止。」鑒源依事件類型計算時辰與方位，先剔除凶煞，再以吉法則、真太陽時與個人年命宮交叉核對。
              </p>
              <p className="jy-copy jy-copy--small">
                方案差異不在「準不準」的宣稱，而在要處理一個事件、一個月，還是一整年的規劃範圍。
              </p>
            </div>
            <ol className="jy-pricing-method__steps">
              <li><span>01</span><p><strong>選定時窗</strong>依報告列出的日期與時辰準時出門。</p></li>
              <li><span>02</span><p><strong>朝向吉方</strong>往指定方位行走 500 公尺以上。</p></li>
              <li><span>03</span><p><strong>靜坐接氣</strong>到達後面朝吉方靜坐 40 分鐘。</p></li>
              <li><span>04</span><p><strong>安排重要行動</strong>完成後再前往處理預定事項。</p></li>
            </ol>
          </div>

          <div className="jy-pricing-section-intro">
            <div>
              <div className="jy-eyebrow">出門訣方案</div>
              <h3 className="jy-heading">把方向變成每月具體的行動時窗</h3>
            </div>
            <p className="jy-copy">人生藍圖告訴你「往哪走」，月度精選告訴你「何時動、往哪個方位動」——每月依你選定的主題，嚴選最多八個高純度吉時。</p>
          </div>

          <div className="jy-pricing-plan-grid">
            {PLANS.chumenji.map((plan) => <PlanCard key={plan.code} plan={plan} promotionAware={false} />)}
          </div>
        </div>
      </section>

      <section id="plan-comparison" className="jy-section">
        <div className="jy-container">
          <div className="jy-section-head">
            <div>
              <div className="jy-eyebrow">比較 · COMPARE</div>
              <h2 className="jy-heading">只比較真正不同的交付範圍</h2>
            </div>
            <p className="jy-copy">先依問題類型選方案，再核對系統數、聚焦程度、多人分析與報告篇幅。表格可在小螢幕內左右滑動，不會推寬整個頁面。</p>
          </div>

          <ComparisonTable
            caption="三方案比較"
            columns={[
              { key: 'c', name: '人生藍圖', code: 'C', price: 89 },
              { key: 'g', name: '家族藍圖', code: 'G15', price: 59 },
              { key: 'e3', name: '月度精選', code: 'E3', price: 89 },
            ]}
            rows={COMPARE_ROWS}
            note="三個方案各司其職：人生藍圖看清自己、家族藍圖看懂家庭、月度精選抓準時機；皆提供完整數位交付。"
          />
        </div>
      </section>

      <section className="jy-section jy-section--ruled">
        <div className="jy-container">
          <div className="jy-section-head">
            <div>
              <div className="jy-eyebrow">選擇指南 · GUIDE</div>
              <h2 className="jy-heading">由你要處理的問題開始選</h2>
            </div>
            <p className="jy-copy">不以「最熱門」替你做決定。先確認分析對象與時間範圍，再回到方案卡核對前置條件與完整交付清單。</p>
          </div>
          <div className="jy-pricing-guide">
            {GUIDE_ITEMS.map((item) => (
              <Link key={item.title} href={item.href} className="jy-pricing-guide__item">
                <strong>{item.title}</strong>
                <span>{item.body}</span>
                <b aria-hidden="true">→</b>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="jy-section">
        <div className="jy-container">
          <div className="jy-pricing-policy jy-panel">
            <div>
              <div className="jy-eyebrow">購買前確認</div>
              <h2 className="jy-subheading">付款前，請先核對三件事</h2>
            </div>
            <dl>
              <div><dt>資料</dt><dd>出生時間越精確，依賴時辰的分析越完整。</dd></div>
              <div><dt>數位內容</dt><dd>報告開始生成後不支援退款；品質問題可聯繫客服檢查。</dd></div>
              <div><dt>最終金額</dt><dd>促銷如適用，折扣會在方案與結帳流程中顯示。</dd></div>
            </dl>
          </div>
        </div>
      </section>

      <section className="jy-section jy-section--paper">
        <div className="jy-container jy-container--reading">
          <div className="jy-section-head">
            <div>
              <div className="jy-eyebrow">常見問題 · FAQ</div>
              <h2 className="jy-heading">購買前常見問題</h2>
            </div>
            <p className="jy-copy">仍有未涵蓋的付款或報告問題，可聯繫 support@jianyuan.life。</p>
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
    </div>
  )
}
