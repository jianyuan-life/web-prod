import Link from 'next/link'
import PriceTag from '@/components/PriceTag'
import PricingButton from '@/components/PricingButton'
import { PromotionTopBanner, PromotionPrice } from '@/components/PromotionBanner'
import FunnelPageHit from '@/components/FunnelPageHit'
import GoldMark from '@/components/GoldMark'

const PLANS = {
  personal: [
    { code: 'C', name: '人生藍圖', price: 89, popular: true, systems: 14,
      valueHint: '每套系統僅 $6.4',
      desc: '一份報告，看清人生全貌——性格天賦、事業方向、財運走勢、感情歸宿、大運機遇，十四套系統交叉驗證，給你最完整的答案',
      suitableFor: '如果你想一次看清自己的全貌，或者站在人生十字路口需要方向',
      features: ['命格名片——一眼看清你是誰', '性格天賦+行為模式深度解析', '事業方向+財運走向+投資風格', '感情婚姻+人際貴人分析', '健康養生+大運走勢', '2026 流年重點月份提醒', '刻意練習——具體可執行的改善計劃', '網頁重點版+PDF 完整版（30,000字+）'],
    },
    { code: 'D', name: '心之所惑', price: 39,
      desc: '心裡有一個放不下的問題？選一個面向，依問題類別精選 3–5 套相關系統聚焦深度剖析',
      suitableFor: '如果你有一個具體的困惑——該不該換工作？這段感情有未來嗎？財運何時好轉？',
      features: ['可選：財運/事業/感情/健康/學業/搬家', '用 200 字描述你的困惑', '依問題類別精選 3–5 套系統（八字 + 紫微 + 占星，視主題加入易經 / 奇門 / 人類圖等）', '具體可行的建議與行動方向', 'PDF 完整報告'],
      hasQuestion: true,
    },
  ],
  family: [
    { code: 'G15', name: '家族藍圖', price: 59, systems: 14,
      desc: '在每位家人各自完成「人生藍圖」後，系統調取所有成員的命格數據，深度分析家庭互動關係、溝通模式、共同運勢——讓你看見家人之間看不見的能量流動',
      suitableFor: '前提：每位家庭成員需先購買「人生藍圖」（$89），家族藍圖專做互動分析',
      features: ['需先完成每位成員的「人生藍圖」', '家族能量圖譜（五行互補/衝突分析）', '每對成員互動關係深度解析', '親子教養 / 夫妻相處具體建議', '家運走勢+共同行動指南', '寫給這個家的話'],
    },
    { code: 'R', name: '合否？', price: 59,
      desc: '感情交往、結婚、合夥創業——你們在命理上到底合不合？精選 4–6 套關係系統（八字合婚 + 紫微夫妻宮 + 占星 Synastry + 易經 + 人類圖）交叉分析，找出契合與衝突的關鍵',
      suitableFor: '如果你正在考慮結婚、合夥，或者想知道跟某個人為什麼老是合不來',
      features: ['含兩人分析（每加1人+$19）', '4–6 套關係系統合盤分析+互動建議', '對方可只提供年月日', '描述你的關係問題（200字）', '好的/注意/改善 三大建議'],
      addPrice: 19, hasQuestion: true,
    },
  ],
  chumenji: [
    { code: 'E1', name: '事件擇吉', price: 59, popular: true,
      valueHint: '單一重要事件、1-3 個嚴選吉時',
      desc: '婚禮、面試、簽約、重大決策——古法奇門遁甲先嚴剔 32 凶煞（五黃 / 太歲 / 死門 / 凶格等），再用 25 吉法則加權、結合您的年命宮 + 真太陽時校準，精選 1-3 個最佳吉時',
      suitableFor: '即將進行的具體重要事件、寧缺勿濫不湊數',
      features: ['描述事件背景＋期望結果（200 字）', '15 類事件智能匹配（14 類精準匹配＋自由描述 AI 分類）', '32 凶硬剔（五黃 / 太歲 / 三煞 / 死門 / 凶格 9 種 / 截路空亡等）', '25 吉加權（真詐 / 玉女守門 / 青龍返首 / 十遁等）', '真太陽時經度校準（港台客戶實測差 ±23 分）', '個人年命宮交叉驗證', '1-3 個最佳吉時 + 方位度數 + 信心等級', '行事曆邀約一鍵加入'],
      hasQuestion: true,
    },
    { code: 'E2', name: '月度單盤', price: 29,
      valueHint: '當月 1 個吉時、入門首選',
      desc: '當月一次補運首選——農曆晦日 22:20-23:00 月家奇門古法、9 宮中先剔 32 凶（五黃 / 太歲 / 月家五黃 / 月破等）、再精選最佳吉方位',
      suitableFor: '每月補運、入門首選、不需密集補運的客戶',
      features: ['當月 1 個吉時 + 主吉方（嚴格剔凶）', '農曆月份精算（立春／節氣換月）', '32 凶硬剔（含月家五黃 / 月破 / 戊己都天）', '《沈氏玄空學》《地理辨正》《紫白訣》古籍背書', '個人年命宮交叉驗證', '行事曆邀約一鍵加入', '晦日 21:00 前購買即算當月'],
    },
    { code: 'E3', name: '月度精選', price: 89,
      valueHint: '寧缺勿濫、最多 8 個高純度吉時',
      desc: '月度頂規嚴選——先嚴剔 32 凶煞、再以 25 吉法則加權、為您選定的 1-3 個主題用神尋找最多 8 個高純度吉窗。因真吉稀缺，若當月不足，系統自動跨月延伸搜尋至補足，寧缺勿濫不以低品質時窗湊數',
      suitableFor: '希望「品質至上、不湊數」的進階客戶、嚴格擇日寧少不濫',
      features: ['最多 8 個嚴選吉時（不足跨月補足、不湊數）', '選 1-3 個主題（事業／財運／感情／健康／學業／貴人／化解小人／家庭）', '32 凶硬剔（無 escape clause、凶時不放行）', '25 吉加權（含主題用神對應 60% 權重）', '真太陽時經度校準', '個人年命宮交叉驗證', '行事曆邀約一鍵加入', '古法占事派正統'],
    },
    { code: 'E4', name: '年度全運', price: 279, seasonal: true,
      valueHint: '年盤＋12 月盤、立春前 30 天限時販售',
      desc: '年度完整方案——年盤 + 12 個月盤趨勢分析、含 2026 丙午→2027 丁未 跨年立春節氣切換、太歲 / 五黃動態追蹤、每年立春前 30 天限時開放',
      suitableFor: '希望全年重要決策都有奇門擇日依據、年度規劃一次到位',
      features: ['年盤古法排盤（全陰遁、立春換年）', '12 個月盤（每月主吉方＋吉時）', '32 凶 + 25 吉法則動態套用每月', '跨年立春切換（年命 / 太歲 / 五黃自動調整）', '個人年命宮交叉驗證', '全年主吉方／忌方總覽', '行事曆邀約（全年吉時一次匯入）', '立春前 30 天限時販售、錯過等明年'],
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
  C: { delivery: '網頁重點版＋30,000 字以上 PDF 完整版', eta: '通常約 30–60 分鐘' },
  D: { delivery: '約 5,000 字以上 PDF 專題報告', eta: '通常約 30 分鐘' },
  G15: { delivery: '家庭互動報告；每位成員約 8,000 字以上', eta: '依家庭成員數量而定' },
  R: { delivery: '兩人合盤；約 8,000 字以上 PDF 報告', eta: '依分析人數而定' },
  E1: { delivery: '1–3 個吉時、方位度數、信心等級與行事曆邀約', eta: '通常需 40 分鐘以上' },
  E2: { delivery: '當月 1 個吉時、主吉方與行事曆邀約', eta: '通常需 40 分鐘以上' },
  E3: { delivery: '最多 8 個吉時、主題用神與行事曆邀約', eta: '通常需 40 分鐘以上' },
  E4: { delivery: '年盤、12 個月盤與全年行事曆邀約', eta: '依年度排算範圍而定' },
}

const COMPARE_ROWS = [
  { feature: '分析系統數', d: '3–5 套（依問題類別）', c: '14套', r: '4–6 套（關係系統）', g: '14套' },
  { feature: '大運流年走勢', d: '--', c: '&#10003;', r: '--', g: '&#10003;' },
  { feature: '專項問題深度剖析', d: '&#10003;', c: '--', r: '&#10003;', g: '--' },
  { feature: '多人互動分析', d: '--', c: '--', r: '&#10003;', g: '&#10003;' },
  { feature: '家庭動力學', d: '--', c: '--', r: '--', g: '&#10003;' },
  { feature: '報告字數', d: '5,000字+', c: '30,000字+', r: '8,000字+', g: '每人8,000字+' },
] as const

const CHUMENJI_ROWS = [
  { feature: '對象', e1: '單一事件', e2: '當月入門', e3: '當月密集', e4: '整年佈局' },
  { feature: '吉時數', e1: 'Top3', e2: '當月 1 個', e3: '當月 8 個（4 週×Top2）', e4: '年盤＋12 月盤' },
  { feature: '主題用神', e1: '自由描述', e2: '無', e3: '可選 1-3 個', e4: '無' },
  { feature: '時間單位', e1: '時盤（兩小時）', e2: '月盤', e3: '時盤（8 個）', e4: '年盤＋月盤' },
  { feature: '販售限制', e1: '隨時', e2: '晦日 21:00 前當月', e3: '隨時', e4: '立春前 30 天限時' },
] as const

const FAQS = [
  {
    q: '命理分析真的準確嗎？',
    a: '鑒源的排盤使用確定性算法（壽星天文曆、Swiss Ephemeris），相同資料可得到相同盤面。解讀則以古籍規則與多套系統交叉分析；它提供的是可核對的觀察與行動參考，不是對人生結果的保證。',
  },
  {
    q: '報告多久生成？',
    a: '個人報告通常約 30 分鐘；家族藍圖與合否會依分析人數增加；出門訣需排算大量時辰，通常需要 40 分鐘以上。付款後系統自動運算，完成後可在網頁查看。',
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
    q: '人生藍圖和心之所惑有什麼差別？',
    a: '「人生藍圖」涵蓋性格、事業、財運、感情、健康與大運等人生面向；「心之所惑」只聚焦你最在意的一個問題，精選最相關的系統深入剖析。',
  },
  {
    q: '四個出門訣方案怎麼選？',
    a: 'E1 針對單一重要事件；E2 提供當月一個吉時；E3 依 1–3 個主題提供最多八個吉時；E4 提供年盤與十二個月盤，並只在每年立春前 30 天開放。',
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
  { title: '想先試一個具體問題', body: '選「心之所惑」D；以一個主題進行 3–5 套系統分析。', href: '#plan-d' },
  { title: '想全面理解自己', body: '選「人生藍圖」C；涵蓋主要人生面向與大運流年。', href: '#plan-c' },
  { title: '分析兩人關係', body: '選「合否？」R；含兩人分析，每增加一人 USD $19。', href: '#plan-r' },
  { title: '理解整個家庭', body: '先為每位成員完成人生藍圖，再選「家族藍圖」G15。', href: '#plan-g15' },
  { title: '處理單一重要事件', body: '選「事件擇吉」E1；精選 1–3 個吉時與方位。', href: '#plan-e1' },
  { title: '規劃一個月', body: 'E2 提供一個月度吉時；E3 提供最多八個高純度時窗。', href: '#plan-e2' },
  { title: '規劃整個年度', body: '選「年度全運」E4；固定於每年立春前 30 天開放。', href: '#plan-e4' },
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
    { label: '關係分析', plans: PLANS.family },
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
              八個方案對應八種不同問題。價格皆為一次性付款；每張方案卡清楚列出適合情境、交付內容、完成時間與分析範圍。
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
        title="從一個問題，到完整人生全貌"
        description="如果你只想處理眼前的一個困惑，選專題分析；如果希望一次理解性格、事業、財運、感情與大運，選完整人生分析。"
        plans={PLANS.personal}
      />

      <PlanSection
        id="relationship-analysis"
        eyebrow="關係 · RELATIONSHIPS"
        title="看兩個人如何互動，而不是只判斷好壞"
        description="合否聚焦兩人關係；家族藍圖分析整個家庭的溝通與互動。家族方案有明確前置條件，請先核對方案卡。"
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
              <h3 className="jy-heading">從單一事件，到全年擇吉佈局</h3>
            </div>
            <p className="jy-copy">四個方案皆保留各自原有的排算範圍、開放條件與交付方式；年度全運固定只在立春前 30 天開放。</p>
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
            caption="個人、關係與家庭方案比較"
            columns={[
              { key: 'd', name: '心之所惑', code: 'D', price: 39 },
              { key: 'c', name: '人生藍圖', code: 'C', price: 89 },
              { key: 'r', name: '合否？', code: 'R', price: 59 },
              { key: 'g', name: '家族藍圖', code: 'G15', price: 59 },
            ]}
            rows={COMPARE_ROWS}
            note="四個方案皆提供完整數位報告；差異在分析對象、深度與聚焦範圍。"
          />

          <div className="jy-pricing-table-separator" />

          <ComparisonTable
            caption="出門訣方案比較"
            columns={[
              { key: 'e1', name: '事件擇吉', code: 'E1', price: 59 },
              { key: 'e2', name: '月度單盤', code: 'E2', price: 29 },
              { key: 'e3', name: '月度精選', code: 'E3', price: 89 },
              { key: 'e4', name: '年度全運', code: 'E4', price: 279 },
            ]}
            rows={CHUMENJI_ROWS}
            note="四個方案皆含個人年命宮交叉驗證與行事曆邀約；差異在排算時間單位與吉時數量。"
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
