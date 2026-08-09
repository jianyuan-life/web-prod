import type { ReactNode } from 'react'
import type { LegacyDocumentBlock, ConsultationReaderModel } from './reader-model'
import styles from './ConsultationReportReader.module.css'

const AGE_STAGE_LABELS = {
  toddler: '幼兒階段',
  child: '兒童階段',
  teen: '青少年階段',
  young_adult: '青年階段',
  early_mid: '成年前中期',
  mid: '成年中期',
  pre_senior: '熟齡準備期',
  elder: '熟齡階段',
} as const

const READER_MODE_LABELS = {
  guardian: '由照顧者閱讀',
  'co-read': '共同閱讀',
  self: '本人閱讀',
} as const

const READING_LOAD_LABELS = {
  brief: '短讀',
  focused: '重點讀',
  deep: '深入讀',
} as const

const PARAGRAPH_KIND_LABELS = {
  claim: '觀察',
  scene: '情境',
  timing: '時間脈絡',
  action: '可嘗試的做法',
  evidence: '依據',
  reflection: '自我核對',
} as const

const EVIDENCE_TYPE_LABELS = {
  calculator_direct: '排盤直接資料',
  traditional_interpretation: '傳統規則的解讀',
  action_experiment: '可在生活中核對的練習',
} as const

function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split('-')
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`
}

const EVIDENCE_STATUS_LABELS = {
  convergent: '多系統相互支持',
  mixed: '同時存在支持與分歧',
  single_system: '目前只有單一系統支持',
  insufficient: '目前資料不足，不當作穩定結論',
} as const

function InlineLegacyText({ text }: { text: string }) {
  const tokens = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__)/gu)
  return tokens.map((token, index): ReactNode => {
    if (/^`[^`\n]+`$/u.test(token)) {
      return <code key={index}>{token.slice(1, -1)}</code>
    }
    if (/^\*\*[^*\n]+\*\*$/u.test(token) || /^__[^_\n]+__$/u.test(token)) {
      return <strong key={index}>{token.slice(2, -2)}</strong>
    }
    return token
  })
}

function LegacyBlock({ block }: { block: LegacyDocumentBlock }) {
  if (block.kind === 'heading') {
    if ((block.level ?? 2) <= 2) {
      return <h3 id={block.id} className={styles.legacyHeading}><InlineLegacyText text={block.text} /></h3>
    }
    return <h4 id={block.id} className={styles.legacySubheading}><InlineLegacyText text={block.text} /></h4>
  }
  if (block.kind === 'list') {
    const ListTag = block.ordered ? 'ol' : 'ul'
    return (
      <ListTag className={styles.legacyList}>
        {(block.items ?? []).map((item, index) => (
          <li key={`${block.id}-${index}`}><InlineLegacyText text={item} /></li>
        ))}
      </ListTag>
    )
  }
  if (block.kind === 'quote') {
    return <blockquote className={styles.legacyQuote}><InlineLegacyText text={block.text} /></blockquote>
  }
  if (block.kind === 'code') {
    return <pre className={styles.legacyCode}><code>{block.text}</code></pre>
  }
  if (block.kind === 'rule') return <hr className={styles.legacyRule} />
  return <p className={styles.legacyParagraph}><InlineLegacyText text={block.text} /></p>
}

function LayerHeading({ index, eyebrow, title, description }: {
  index: string
  eyebrow: string
  title: string
  description: string
}) {
  return (
    <header className={styles.layerHeading}>
      <span className={styles.layerIndex}>{index}</span>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>{title}</h2>
        <p className={styles.layerDescription}>{description}</p>
      </div>
    </header>
  )
}

export function ConsultationReportReader({ model, pdfHref }: {
  model: ConsultationReaderModel
  pdfHref?: string
}) {
  const isLegacy = model.mode === 'legacy_full_text'
  const planDescription = model.plan === 'C'
    ? '把個人的長期模式、當下處境與可核對依據放回同一份生活脈絡。'
    : '把每位成員的節奏並列來看，不用排行、性別或稱謂替任何人預設角色。'

  return (
    <article className={styles.shell} data-plan={model.plan} data-consultation-report>
      <a className={styles.skipLink} href="#deep-reading">跳到完整報告</a>
      <div className={styles.paper}>
        <header className={styles.masthead}>
          <div className={styles.folioLine} aria-hidden="true"><span /></div>
          <div className={styles.mastheadGrid}>
            <div>
              <p className={styles.kicker}>鑑源 · 諮詢卷宗</p>
              <h1>{model.title}</h1>
              <p className={styles.dek}>{planDescription}</p>
            </div>
            <dl className={styles.reportMeta}>
              <div>
                <dt>內容安排</dt>
                <dd>{isLegacy ? '依原文順序閱讀' : '快讀、詳讀與依據'}</dd>
              </div>
              <div>
                <dt>資料基準</dt>
                <dd>{model.asOfDate ? formatCalendarDate(model.asOfDate) : '舊版未另存基準日'}</dd>
              </div>
              <div>
                <dt>閱讀方式</dt>
                <dd>先結論、再脈絡、後依據</dd>
              </div>
            </dl>
          </div>
        </header>

        <div className={styles.dossierGrid}>
          <aside className={styles.rail}>
            <div className={styles.railInner}>
              <p className={styles.railTitle}>閱讀路徑</p>
              <nav aria-label="報告閱讀與下載導覽">
                <ol>
                  <li><a href="#quick-reading"><span>壹</span>30 秒先讀</a></li>
                  <li><a href="#reading-route"><span>貳</span>3 分鐘導讀</a></li>
                  <li><a href="#deep-reading"><span>參</span>完整報告</a></li>
                  <li><a href="#evidence-appendix"><span>肆</span>依據與限制</a></li>
                  {pdfHref && (
                    <li className={styles.downloadTab}>
                      <a href={pdfHref} aria-label="下載 PDF 完整版"><span>伍</span>下載 PDF</a>
                    </li>
                  )}
                  <li className={styles.dashboardTab}>
                    <a href="/dashboard" aria-label="回到我的報告"><span>陸</span>我的報告</a>
                  </li>
                </ol>
              </nav>
              {pdfHref && (
                <a className={styles.downloadLink} href={pdfHref}>
                  下載 PDF 完整版
                </a>
              )}
              <a className={styles.dashboardLink} href="/dashboard">回到我的報告</a>
            </div>
          </aside>

          <article className={styles.contentColumn}>
            {!isLegacy && model.people.length > 0 && (
              <section className={styles.peopleBand} aria-labelledby="reader-context-title">
                <div className={styles.peopleHeading}>
                  <p className={styles.eyebrow}>閱讀對象</p>
                  <h2 id="reader-context-title">報告採用的年齡脈絡</h2>
                </div>
                <div className={styles.peopleGrid}>
                  {model.people.map((person) => (
                    <div className={styles.personRow} key={person.personId}>
                      <div>
                        <span className={styles.relationshipLabel}>{person.relationshipLabel}</span>
                        <strong>{person.displayName}</strong>
                      </div>
                      {person.age ? (
                        <p>
                          {person.age.ageYears} 歲 · {AGE_STAGE_LABELS[person.age.stage]} · {READER_MODE_LABELS[person.age.readerMode]}
                          {person.age.timeHorizonEndAge !== null && ` · 討論範圍至 ${person.age.timeHorizonEndAge} 歲`}
                        </p>
                      ) : (
                        <p>未另存可核對的年齡資料</p>
                      )}
                      <p className={styles.confidenceNote}>
                        {person.birthTime.status === 'unknown'
                          ? `出生時間未知，置信度已下調；${person.birthTime.affectedSystems.join('、')}不用來支撐結論。`
                          : '已提供出生時間；仍請以實際經驗反覆核對。'}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className={styles.layer} id="quick-reading">
              <LayerHeading
                index="壹"
                eyebrow="30 秒先讀"
                title={isLegacy ? '不替舊原文補寫摘要' : '三個先帶走的結論'}
                description={isLegacy
                  ? '舊版報告沒有另存可追溯的摘要。這裡刻意留白，避免把新寫的句子誤認成原報告結論。'
                  : '每一項都來自報告已保存的主張，旁邊附上可以自行核對的問題。'}
              />
              {isLegacy ? (
                <div className={styles.honestyNote}>
                  <strong>這裡沒有濃縮版。</strong>
                  <p>可先沿著下一節的原文標題閱讀；如果原文沒有標題，就直接進入完整報告。</p>
                </div>
              ) : (
                <ol className={styles.quickGrid}>
                  {model.quickItems.map((item, index) => (
                    <li key={item.claimId}>
                      <span className={styles.quickNumber}>{String(index + 1).padStart(2, '0')}</span>
                      <h3>{item.conclusion}</h3>
                      <p><strong>怎麼核對：</strong>{item.selfCheck}</p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className={styles.layer} id="reading-route">
              <LayerHeading
                index="貳"
                eyebrow="3 分鐘導讀"
                title={isLegacy ? '原文目錄' : '先讀每章的結論'}
                description={isLegacy
                  ? '只列原文實際寫出的標題，不把散文改造成新的主張。'
                  : '先確認哪一章最貼近現在的問題，再決定從哪裡深入。'}
              />
              {isLegacy ? (
                model.routeItems.length > 0 ? (
                  <ol className={styles.routeList}>
                    {model.routeItems.map((item, index) => (
                      <li key={item.targetId}>
                        <a href={`#${item.targetId}`}>
                          <span className={styles.routeIndex}>{String(index + 1).padStart(2, '0')}</span>
                          <span className={styles.routeCopy}><strong>{item.title}</strong></span>
                        </a>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.emptyDirection}>原文沒有標題，因此不替它建立目錄。完整內容仍原樣保留在下一節。</p>
                )
              ) : (
                model.routeItems.length > 0 ? (
                  <ol className={styles.routeList}>
                    {model.routeItems.map((item, index) => (
                      <li key={item.chapterId}>
                        <a href={`#${item.targetId}`}>
                          <span className={styles.routeIndex}>{String(index + 1).padStart(2, '0')}</span>
                          <span className={styles.routeCopy}>
                            <strong>{item.title}</strong>
                            <small>{item.conclusionSubtitle}</small>
                          </span>
                          <span className={styles.loadLabel}>{READING_LOAD_LABELS[item.readingLoad]}</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className={styles.emptyDirection}>這份報告沒有可顯示的章節。</p>
                )
              )}
            </section>

            <section className={styles.layer} id="deep-reading">
              <LayerHeading
                index="參"
                eyebrow="完整報告"
                title={isLegacy ? '資料庫保存的原文' : '把結論放回完整脈絡'}
                description={isLegacy
                  ? '以下文字只做安全排版；標題、段落與措辭仍以保存內容為準。'
                  : '每段保留它原本的資訊類型，讓觀察、情境、做法與依據不混在一起。'}
              />
              {isLegacy ? (
                <div className={styles.legacyDocument} aria-label="舊版報告原文">
                  {model.document.blocks.map((block) => <LegacyBlock block={block} key={block.id} />)}
                </div>
              ) : (
                <div className={styles.chapterStack}>
                  {model.chapters.map((chapter, chapterIndex) => (
                    <section className={styles.chapter} id={chapter.targetId} key={chapter.chapterId}>
                      <header className={styles.chapterHeader}>
                        <span>{String(chapterIndex + 1).padStart(2, '0')}</span>
                        <div>
                          <h3>{chapter.title}</h3>
                          <p>{chapter.conclusionSubtitle}</p>
                        </div>
                      </header>
                      <div className={styles.paragraphStack}>
                        {chapter.paragraphs.map((paragraph) => (
                          <div className={styles.reportParagraph} key={paragraph.paragraphId}>
                            <span>{PARAGRAPH_KIND_LABELS[paragraph.kind]}</span>
                            <p>{paragraph.text}</p>
                            {paragraph.factIds.length > 0 && (
                              <small>這段判讀參考了 {paragraph.factIds.length} 項可核對資料</small>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>

            <section className={styles.layer} id="evidence-appendix">
              <LayerHeading
                index="肆"
                eyebrow="依據與限制"
                title={isLegacy ? '舊版內容能說明到哪裡' : '每個結論從哪裡來'}
                description={isLegacy
                  ? '目前只能確認正文來自已保存的報告；沒有另存可反查的 facts、年齡脈絡或逐項依據。'
                  : '同時看支持資料、適用條件與何時不該繼續套用。'}
              />
              {isLegacy ? (
                <div className={styles.provenancePanel}>
                  <dl>
                    <div><dt>可確認</dt><dd>這是資料庫保存的舊版報告原文</dd></div>
                    <div><dt>不能確認</dt><dd>逐段資料來源、生成時的年齡層設定與另行濃縮的結論</dd></div>
                    <div><dt>閱讀原則</dt><dd>把內容當作討論起點；與實際經驗不符時，不必勉強套用</dd></div>
                  </dl>
                </div>
              ) : (
                <>
                  <div className={styles.sourceStrip}>
                    <p className={styles.eyebrow}>本報告使用的資料</p>
                    <ul>
                      {model.sources.map((source) => (
                        <li key={source.sourceId}>
                          <strong>{source.title}</strong>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={styles.evidenceStack}>
                    {model.evidence.map((item, index) => (
                      <article className={styles.evidenceCard} key={item.evidenceId}>
                        <header>
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          <div>
                            <p>{EVIDENCE_TYPE_LABELS[item.type]}</p>
                            <h3>{item.label}</h3>
                          </div>
                        </header>
                        <dl>
                          <div>
                            <dt>目前證據狀態</dt>
                            <dd>{item.evidenceStatuses.map((status) => EVIDENCE_STATUS_LABELS[status]).join('；')}</dd>
                          </div>
                          <div>
                            <dt>相互支持的系統</dt>
                            <dd>{item.supportingSystems.join('、') || '未達到多系統共識'}</dd>
                          </div>
                          <div>
                            <dt>提出分歧的系統</dt>
                            <dd>{item.opposingSystems.join('、') || '目前沒有被標記的相反依據'}</dd>
                          </div>
                          <div>
                            <dt>資料來自</dt>
                            <dd>{item.sourceTitles.join('、') || '報告保存的原始資料'}</dd>
                          </div>
                          <div>
                            <dt>何時適用</dt>
                            <dd>{item.applicability.join('；')}</dd>
                          </div>
                          <div>
                            <dt>何時停止套用</dt>
                            <dd>{item.invalidation.join('；')}</dd>
                          </div>
                          <div>
                            <dt>限制</dt>
                            <dd>{item.limitations.join('；')}</dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                  </div>
                </>
              )}
            </section>
          </article>
        </div>

        <footer className={styles.readerFooter}>
          <p>命理內容用來整理觀察，不替你決定醫療、法律、財務或人生選擇。</p>
          <a href="#quick-reading">回到開頭</a>
        </footer>
      </div>
    </article>
  )
}
