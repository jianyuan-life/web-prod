import Link from 'next/link'

import { buildCheckoutRoute } from '@/lib/consultation/routes'
import ConsultationCheckoutTrigger from '../ConsultationCheckoutTrigger'
import type { ConsultationProduct } from './product-data'
import styles from './ConsultationProductPage.module.css'

type ConsultationProductPageProps = {
  product: ConsultationProduct
}

const readingLayers = [
  { time: '重點', label: '先抓主線', detail: '現在較值得處理的事' },
  { time: '主題', label: '依需要閱讀', detail: '工作、關係、資源與生活節奏' },
  { time: '完整', label: '逐章理解', detail: '情境、例外與可練習處' },
  { time: '速覽', label: '回看排盤', detail: '各系統主要結果與資料限制' },
] as const

function buildStructuredData(product: ConsultationProduct, checkoutUrl: string) {
  const productUrl = `https://jianyuan.life/${product.slug}`
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: `鑒源 ${product.eyebrow.replace(`${product.code} · `, '')}`,
      description: product.description,
      url: productUrl,
      brand: { '@type': 'Brand', name: '鑒源 JianYuan' },
      offers: {
        '@type': 'Offer',
        url: `https://jianyuan.life${checkoutUrl}`,
        priceCurrency: product.currency,
        price: String(product.price),
        availability: 'https://schema.org/InStock',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: product.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: '首頁', item: 'https://jianyuan.life' },
        { '@type': 'ListItem', position: 2, name: product.eyebrow, item: productUrl },
      ],
    },
  ]
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  )
}

function CheckMark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m4.5 10.2 3.2 3.1 7.8-7.4" />
    </svg>
  )
}

export default function ConsultationProductPage({ product }: ConsultationProductPageProps) {
  const checkoutUrl = buildCheckoutRoute(product.code)
  const structuredData = buildStructuredData(product, checkoutUrl)
  const themeClass = product.code === 'C' ? styles.life : styles.family

  return (
    <div className={`${styles.root} ${themeClass}`}>
      <article id="consultation-main" className={styles.main}>
        <nav className={styles.breadcrumbs} aria-label="麵包屑導覽">
          <Link href="/">鑒源</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{product.eyebrow}</span>
        </nav>

        <section className={styles.hero} aria-labelledby={`${product.slug}-title`}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{product.eyebrow}</p>
            <h1 id={`${product.slug}-title`}>{product.title}</h1>
            <p className={styles.lead}>{product.lead}</p>
            <p className={styles.description}>{product.description}</p>

            <ul className={styles.heroNotes} aria-label="方案重點">
              {product.heroNotes.map((note) => (
                <li key={note}>
                  <CheckMark />
                  <span>{note}</span>
                </li>
              ))}
            </ul>

            <div className={styles.heroActions}>
              <ConsultationCheckoutTrigger planCode={product.code} className={styles.primaryButton}>
                <span>{product.ctaLabel}</span>
                <ArrowIcon />
              </ConsultationCheckoutTrigger>
              <a className={styles.textLink} href="#how-it-works">
                先看怎麼進行
              </a>
            </div>
          </div>

          <aside className={styles.dossier} aria-label="報告閱讀方式與價格">
            <div className={styles.dossierHeader}>
              <span>報告閱讀導覽</span>
              <span>方案 {product.code}</span>
            </div>
            <div className={styles.dossierTitle}>
              <span className={styles.folio}>{product.code === 'C' ? '個人報告' : '家庭報告'} / {product.code}</span>
              <h2>先得到方向，再決定要讀多深。</h2>
            </div>
            <ol className={styles.readingList}>
              {readingLayers.map((layer) => (
                <li key={layer.time}>
                  <span className={styles.readingTime}>{layer.time}</span>
                  <span>
                    <strong>{layer.label}</strong>
                    <small>{layer.detail}</small>
                  </span>
                </li>
              ))}
            </ol>
            <div className={styles.priceBlock}>
              <div>
                <span className={styles.priceLabel}>一次性費用</span>
                <p className={styles.price}>
                  <small>US$</small>
                  {product.price}
                </p>
              </div>
              <span className={styles.priceRule}>{product.priceNote}</span>
            </div>
            {product.prerequisite ? (
              <p className={styles.prerequisite}>
                <strong>開始條件</strong>
                {product.prerequisite}
              </p>
            ) : null}
          </aside>
        </section>

        <section className={styles.signalBand} aria-label="分析原則">
          <p>14 套命理系統交叉參照</p>
          <span aria-hidden="true" />
          <p>共識與矛盾分開呈現</p>
          <span aria-hidden="true" />
          <p>選擇權保留在你手上</p>
        </section>

        <section className={styles.section} aria-labelledby={`${product.slug}-fit`}>
          <div className={styles.sectionHeading}>
            <p className={styles.sectionIndex}>01 / 適合誰</p>
            <h2 id={`${product.slug}-fit`}>你缺的不是更多說法，而是一個能把問題攤開、排出優先順序的方法。</h2>
            <p>不需要先相信任何結論。你只需要願意對照自己的經驗，留下符合與不符合之處。</p>
          </div>
          <div className={styles.fitGrid}>
            {product.forWhom.map((item, index) => (
              <article className={styles.fitCard} key={item.title}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={`${styles.section} ${styles.deliverableSection}`} aria-labelledby={`${product.slug}-inside`}>
          <div className={styles.sectionHeading}>
            <p className={styles.sectionIndex}>02 / 你會得到什麼</p>
            <h2 id={`${product.slug}-inside`}>一份可以先掃讀、再深入、最後帶走行動的報告。</h2>
            <p>每一層都回答不同問題，避免你必須從第一頁一路讀到最後，才知道重點在哪裡。</p>
          </div>
          <div className={styles.deliverableList}>
            {product.deliverables.map((item) => (
              <article key={item.marker}>
                <span className={styles.deliverableMarker}>{item.marker}</span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how-it-works" className={styles.section} aria-labelledby={`${product.slug}-process`}>
          <div className={styles.sectionHeading}>
            <p className={styles.sectionIndex}>03 / 怎麼進行</p>
            <h2 id={`${product.slug}-process`}>從可核對的資料開始，不從漂亮的故事開始。</h2>
            <p>資料、推論與建議各自有位置。遇到缺口就標示，不用肯定語氣掩蓋不確定。</p>
          </div>
          <ol className={styles.processList}>
            {product.process.map((step) => (
              <li key={step.number}>
                <span className={styles.processNumber}>{step.number}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className={`${styles.section} ${styles.boundarySection}`} aria-labelledby={`${product.slug}-boundaries`}>
          <div className={styles.boundaryIntro}>
            <p className={styles.sectionIndex}>04 / 例外與邊界</p>
            <h2 id={`${product.slug}-boundaries`}>好的諮詢，不會把不確定說成命中注定。</h2>
            <p>我們把不能承諾的事寫在購買之前。它們不是小字備註，而是這份服務的使用方式。</p>
          </div>
          <ul className={styles.boundaryList}>
            {product.boundaries.map((boundary) => (
              <li key={boundary}>
                <span aria-hidden="true">—</span>
                <p>{boundary}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className={styles.section} aria-labelledby={`${product.slug}-faq`}>
          <div className={styles.sectionHeading}>
            <p className={styles.sectionIndex}>05 / 購買前常見問題</p>
            <h2 id={`${product.slug}-faq`}>先把條件問清楚，再決定是否適合你。</h2>
          </div>
          <div className={styles.faqList}>
            {product.faqs.map((faq, index) => (
              <details key={faq.question}>
                <summary>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{faq.question}</strong>
                  <span className={styles.disclosure} aria-hidden="true" />
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.finalCta} aria-labelledby={`${product.slug}-cta`}>
          <div>
            <p className={styles.sectionIndex}>準備好，再開始</p>
            <h2 id={`${product.slug}-cta`}>{product.lead}</h2>
            <p>{product.priceNote}</p>
            {product.prerequisite ? <p className={styles.finalPrerequisite}>{product.prerequisite}</p> : null}
          </div>
          <div className={styles.finalPrice}>
            <p>
              <small>US$</small>
              {product.price}
            </p>
            <ConsultationCheckoutTrigger planCode={product.code} className={styles.primaryButton} ariaLabel={`${product.checkoutLabel}，價格 US$${product.price}；先查看購買須知`}>
              <span>{product.checkoutLabel}</span>
              <ArrowIcon />
            </ConsultationCheckoutTrigger>
          </div>
        </section>
      </article>

      {structuredData.map((entry, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry).replace(/</g, '\\u003c') }}
        />
      ))}
    </div>
  )
}
