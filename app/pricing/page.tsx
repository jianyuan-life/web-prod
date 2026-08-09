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
      valueHint: '從 30 秒重點到依據附錄，四層閱讀',
      desc: '把反覆出現的選擇、關係與壓力模式整理成一份個人卷宗。計算事實、傳統詮釋、不同訊號與行動建議分開呈現，不用一句吉凶概括你的人生',
      suitableFor: '正在工作、關係、居住或家庭角色轉換期，想先理清自己要處理什麼的人；也是家族藍圖的必要前置',
      features: ['30 秒當前優先題與 3 分鐘決策摘要', '工作、關係、金錢與身心節奏主題章節', '依實際年齡與人生階段調整重點', '共識、相反訊號與資料限制分開標示', '90 天可觀察、可調整的小步驟', '計算事實與依據附錄', '網頁分層閱讀＋PDF 完整版'],
      detailHref: '/life-blueprint',
    },
  ],
  family: [
    { code: 'G15', name: '家族藍圖', price: 59, systems: 14,
      desc: '把 2–8 位成員已完成的人生藍圖放進同一張家庭地圖，整理家人之間的需要、壓力反應、溝通節奏與可修復的互動循環',
      suitableFor: '前提：同一帳戶需有 2–8 份已完成的人生藍圖；適合想理解家庭互動，不想找一個人當戰犯的家庭',
      features: ['每位成員都保留自己的視角', '每對成員的易懂與易誤讀之處', '觸發點、表面行為與未說出需要的循環', '不依性別或排序指定家庭角色', '家庭會議的開場、輪流、暫停與收尾腳本', '90 天共同練習與回顧問題'],
      detailHref: '/family-blueprint',
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
  detailHref?: string
}

const PLAN_PRESENTATION: Record<string, { delivery: string; eta: string }> = {
  C: { delivery: '網頁重點版＋PDF 完整版', eta: '通常約 30–60 分鐘' },
  G15: { delivery: '家庭互動報告；聚焦成員需要、互動循環與修復對話', eta: '依成員數與資料狀況而定' },
  E3: { delivery: '最多 8 個吉時、主題用神與行事曆邀約', eta: '通常需 40 分鐘以上' },
}

const COMPARE_ROWS = [
  { feature: '分析對象', c: '你自己', g: '整個家庭', e3: '你的每月行動時機' },
  { feature: '回答的問題', c: '我是誰、往哪走', g: '家人之間如何互動', e3: '何時動、往哪個方位動' },
  { feature: '分析系統數', c: '14套', g: '14套', e3: '古法奇門遁甲' },
  { feature: '時間與行動', c: '人生階段＋90 天練習', g: '90 天家庭練習', e3: '吉時與方位' },
  { feature: '多人互動分析', c: '--', g: '&#10003;', e3: '--' },
  { feature: '吉時與方位', c: '--', g: '--', e3: '&#10003;' },
  { feature: '前置條件', c: '無', g: '每位成員先完成人生藍圖', e3: '無' },
] as const

const FAQS = [
  {
    q: '命理分析真的準確嗎？',
    a: '排盤能否重播，必須同時固定完整出生資料、分析基準日、地點與引擎版本，不能只說「同一生日就一定相同」。鑒源會把可核對條件與資料限制寫進報告；解讀提供的是跨系統觀察與行動參考，不是對人生結果的保證。',
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
    a: '請直接選「不確定」，不要猜最接近的時辰。凡實作會讀取時或分的系統都會停止用來支撐結論；目前只保留姓名學、數字能量學與不依賴時辰的有限反思內容，並在報告清楚標示限制。',
  },
  {
    q: '出門訣為什麼不提供「隔天」替代方案？',
    a: '古法奇門遁甲「一時一盤」，不同時辰會形成不同盤面。若錯過推薦時窗，需要等待系統下一個符合條件的時窗，而不是直接以隔天同一時間替代。',
  },
]

const GUIDE_ITEMS = [
  { title: '想全面理解自己', body: '選「人生藍圖」C；整理重要模式、人生階段與可執行練習，是所有家庭分析的起點。', href: '#plan-c' },
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
        {plan.detailHref && (
          <Link href={plan.detailHref} className="jy-pricing-plan__detail">
            先看完整交付內容 <span aria-hidden="true">→</span>
          </Link>
        )}
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
              <span>先說清問題，</span>
              <span>再選委託方式</span>
            </h1>
            <p className="jy-lede">
              想整理個人的轉折與反覆模式，先看人生藍圖；想理解家人之間的互動循環，先核對家族藍圖的前置。價格皆為一次性付款，付款前可逐項看完交付與邊界。
            </p>
            <div className="jy-actions">
              <Link href="/life-blueprint" className="jy-button jy-button--primary">看人生藍圖委託書</Link>
              <Link href="/family-blueprint" className="jy-button jy-button--secondary">看家族藍圖前置條件</Link>
            </div>
            <Link href="/tools/bazi" className="jy-pricing-free-link">還在評估？先用免費排盤看呈現方式 <span aria-hidden="true">→</span></Link>
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
        eyebrow="人生諮詢 · PERSONAL"
        title="不把你概括成一句評語"
        description="人生藍圖先整理當前最重要的議題，再逐步展開生活情境、相反訊號、資料限制與可練習的下一步。"
        plans={PLANS.personal}
      />

      <PlanSection
        id="relationship-analysis"
        eyebrow="家庭諮詢 · FAMILY"
        title="看見互動循環，不找一個人當戰犯"
        description="家族藍圖先保留每位成員的獨立視角，再逐對整理家庭互動。開始前，同一帳戶需有 2–8 份已完成的人生藍圖。"
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
