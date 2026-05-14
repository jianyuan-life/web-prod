// v5.10.203 Sprint 1 step 5 — LifeBlueprintReport(接 data prop、real render)
// Schema 對應:types/report-schemas.ts LifeBlueprintReport
// Sprint 1:render hero + actions2026 + card5(其餘 sections 待 Sprint 2+ 加)
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Card } from '@/components/ui/Card'
import { GoldDivider } from '@/components/effects/GoldDivider'
import { KeyTakeaway } from '@/components/report/shared/KeyTakeaway'
import { QuickSummary } from '@/components/report/shared/QuickSummary'
import { CrisisFooter } from '@/components/report/shared/CrisisFooter'
import { ReportSeal } from '@/components/report/shared/ReportSeal'
import { TopList5 } from '@/components/report/shared/TopList5'
import { PracticeCard } from '@/components/report/shared/PracticeCard'
import { LuckyParams } from '@/components/report/shared/LuckyParams'
import { BaziPillars } from '@/components/report/shared/BaziPillars'
import { RadarTriad } from '@/components/report/shared/RadarTriad'
import { ActionPlanStages } from '@/components/report/shared/ActionPlanStages'
import { ChapterGroup, ChapterSection } from '@/components/report/shared/ChapterSection'
import { YearEnergyMonths } from '@/components/report/shared/YearEnergyMonths'
import { ZiweiNatalChart } from '@/components/report/shared/ZiweiNatalChart'
import { FeedbackForm } from '@/components/report/shared/FeedbackForm'
import { PDFDownloadButton } from '@/components/report/shared/PDFDownloadButton'
import { ReportToolbar } from '@/components/report/shared/ReportToolbar'
import { TermTooltip } from '@/components/report/shared/TermTooltip'
import { TermAuto } from '@/components/report/shared/TermAuto'
import { getTerm } from '@/lib/term-dictionary'
import { ScrollProgress } from '@/components/effects/ScrollProgress'
import { BackToTop } from '@/components/effects/BackToTop'
import { Stagger, StaggerItem } from '@/components/effects/Stagger'
// v5.10.310 sticky TOC scrollspy(QA P0 #1 + Gemini Substack pattern)
import { StickyTOC, type TOCItem } from '@/components/report/shared/StickyTOC'
// v5.10.312 editorial 3 component(Gemini market research finding):DropCap / PullQuote / ExecutiveSummary
import { PullQuote, ExecutiveSummary } from '@/components/report/shared/DropCap'
import type { LifeBlueprintReport as LifeBlueprintData } from '@/types/report-schemas'

// v5.10.310 C 報告 12 章節 TOC items
const C_TOC_ITEMS: TOCItem[] = [
  { id: 'sec-hero', label: '人生藍圖 · 序章', level: 1 },
  { id: 'sec-actions-2026', label: '2026 行動建議', level: 1 },
  { id: 'sec-card5', label: '命格名片 5 件套', level: 1 },
  { id: 'sec-insight3', label: '核心洞察 3 段', level: 1 },
  { id: 'sec-insight5', label: '5 大切片視角', level: 1 },
  { id: 'sec-natal', label: '命盤總覽 · 紫微 12 宮', level: 1 },
  { id: 'sec-yearenergy', label: '12 月份能量', level: 1 },
  { id: 'sec-dayun', label: '大運走勢', level: 1 },
  { id: 'sec-consensus', label: '14 系統共識矩陣', level: 1 },
  { id: 'sec-talents', label: 'TOP 5 天賦', level: 1 },
  { id: 'sec-actionplan', label: '三階段行動計畫', level: 1 },
  { id: 'sec-lucky', label: '幸運參數', level: 1 },
  { id: 'sec-practice', label: '命格處方箋', level: 1 },
  { id: 'sec-appendix', label: '14 系統交叉發現', level: 1 },
]

interface LifeBlueprintReportProps {
  id: string
  data?: LifeBlueprintData
}

export function LifeBlueprintReport({ id, data }: LifeBlueprintReportProps) {
  // Sprint 1:無 data → skeleton fallback
  if (!data) {
    return <SkeletonView id={id} />
  }

  return (
    <>
      <ScrollProgress />
      <ReportToolbar
        reportTitle={`${data.hero.title} · ${data.meta.name}`}
        onShare={() => {
          if (typeof navigator !== 'undefined' && navigator.share) {
            void navigator.share({ title: `${data.hero.title} · ${data.meta.name}`, url: window.location.href })
          }
        }}
        onDownloadPDF={() => {
          window.location.href = `/api/r/life-blueprint/${data.meta.id}/pdf`
        }}
      />
      <main
        className="min-h-screen text-[var(--jy-text-primary)] relative overflow-hidden"
        style={{ background: 'var(--jy-bg-glow)', backgroundColor: 'var(--jy-bg-void)' }}
      >
        {/* v5.10.310 grid:xl 1440+ 加 240px sticky TOC 左欄、editorial magazine 慣例 */}
        <div className="mx-auto max-w-[1440px] px-4 py-20 sm:px-6 lg:px-8 relative z-10 xl:grid xl:grid-cols-[240px_1fr] xl:gap-12">
        <StickyTOC items={C_TOC_ITEMS} />
        <div>
        {/* HERO */}
        <Stagger>
        <StaggerItem>
        {/* HERO — v5.10.294 editorial redesign:砍 shimmer gradient、改 solid serif、加 issue date / subtitle 分層
            v5.10.310 加 id="sec-hero" for sticky TOC scrollspy */}
        <section id="sec-hero" className="mb-20 text-center">
          {/* Eyebrow:砍英文混排、純中文 + 系列分類 */}
          <p className="text-[10px] tracking-[0.3em] text-[var(--jy-text-muted)] mb-2">
            鑒  源  個  人  命  理  分  析
          </p>
          <p className="text-[12px] tracking-[0.18em] text-[var(--jy-text-gold)]">
            人 生 藍 圖 · Vol. I
          </p>

          {/* Title:solid gold serif、不再 shimmer / gradient */}
          <h1
            className="mt-10 font-normal"
            style={{
              fontFamily: 'var(--jy-font-serif, "Noto Serif TC", Georgia), serif',
              fontSize: 'clamp(40px, 5vw, 72px)',
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              color: 'var(--jy-text-gold)',
            }}
          >
            {data.hero.title}
          </h1>

          {/* Subtitle:editorial italic、generous line-height */}
          <p
            className="mt-8 mx-auto max-w-2xl italic text-[var(--jy-text-secondary)]"
            style={{
              fontFamily: 'var(--jy-font-serif, "Noto Serif TC", Georgia), serif',
              fontSize: 'clamp(17px, 1.6vw, 21px)',
              lineHeight: 1.7,
            }}
          >
            {data.hero.subtitle}
          </p>

          {/* Issue line:像 magazine「Issue No. / 委託人 / 簽發日」 */}
          <div className="mt-10 inline-flex items-center gap-6 text-[10px] tracking-[0.18em] text-[var(--jy-text-muted)]">
            <span>委 託 人  ·  {data.meta.name}</span>
            <span className="h-2 w-px bg-[var(--jy-text-muted)]/30" aria-hidden />
            <span>系 列  ·  人 生 藍 圖</span>
            <span className="h-2 w-px bg-[var(--jy-text-muted)]/30" aria-hidden />
            <span>{new Date(data.meta.reportDate || Date.now()).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' })}</span>
          </div>

          {/* Keywords:hairline tag、不再 pill / rounded full */}
          <div className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2">
            {data.hero.keyword.map((kw, i) => (
              <span key={kw} className="inline-flex items-center gap-3">
                {i > 0 && <span className="h-1 w-1 rounded-full bg-[var(--jy-text-gold)]/40" aria-hidden />}
                <span
                  className="text-[14px] tracking-[0.1em] text-[var(--jy-text-gold)]/85"
                  style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif' }}
                >
                  {kw}
                </span>
              </span>
            ))}
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* v5.10.312 ExecutiveSummary「一分鐘看懂」box(McKinsey pattern、結論先行、Gemini market research) */}
        <ExecutiveSummary
          title="一分鐘看懂"
          bullets={[
            data.hero.title ? `命格定位:${data.hero.title}` : '14 套命理系統交叉、東西方並列驗證',
            data.actions2026?.q1q2?.text
              ? `2026 上半年:${data.actions2026.q1q2.text.slice(0, 60)}${data.actions2026.q1q2.text.length > 60 ? '…' : ''}`
              : '2026 行動方向:啟動 → 留意 → 整合三階段',
            data.actions2026?.fullYear?.text
              ? `全年主軸:${data.actions2026.fullYear.text.slice(0, 60)}${data.actions2026.fullYear.text.length > 60 ? '…' : ''}`
              : '全年主軸:14 系統共識指向核心方向',
          ]}
        />

        {/* v5.10.312 PullQuote 引言(報告核心一句、editorial magazine pattern) */}
        {data.hero.subtitle && (
          <PullQuote attribution="鑒 源 命 理 整 合 分 析">
            {data.hero.subtitle}
          </PullQuote>
        )}

        {/* 2026 行動建議 */}
        <section id="sec-actions-2026" className="mb-16">
          <Eyebrow align="left">2026 行動建議</Eyebrow>
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ActionCard label={data.actions2026.q1q2.label} text={data.actions2026.q1q2.text} accent="green" icon="" />
            <ActionCard label={data.actions2026.fullYear.label} text={data.actions2026.fullYear.text} accent="amber" icon="" />
            <ActionCard label={data.actions2026.q3q4.label} text={data.actions2026.q3q4.text} accent="violet" icon="" />
          </div>
        </section>

        {/* 命格名片 5 件套 */}
        <section id="sec-card5" className="mb-16">
          <Eyebrow align="left">命格名片 5 件套</Eyebrow>
          <Card className="mt-8 p-8">
            <h2
              className="font-semibold text-[var(--jy-text-primary)]"
              style={{ fontFamily: 'var(--jy-font-display)', fontSize: 'clamp(22px, 2vw, 28px)' }}
            >
              {data.card5.title}
            </h2>
            <p className="mt-3 text-[var(--jy-text-secondary)]">{data.card5.subtitle}</p>

            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <BaziPillar label="年" value={data.card5.bazi.year} />
              <BaziPillar label="月" value={data.card5.bazi.month} />
              <BaziPillar label="日" value={data.card5.bazi.day} highlight />
              <BaziPillar label="時" value={data.card5.bazi.hour} />
            </div>

            <p className="mt-4 text-sm text-[var(--jy-text-tertiary)]">
              紫微命宮:<span className="text-[var(--jy-text-gold)]">{data.card5.ziwei.palaceStar}</span>(
              {data.card5.ziwei.palace})
            </p>

            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <h3 className="font-medium text-[var(--jy-semantic-flow)]">天賦 Top 3</h3>
                <ul className="mt-3 space-y-2 text-[var(--jy-text-secondary)]">
                  {data.card5.talentsTop3.map((t, i) => <li key={i}>· {t}</li>)}
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-[var(--jy-semantic-adjust)]">課題 Top 3</h3>
                <ul className="mt-3 space-y-2 text-[var(--jy-text-secondary)]">
                  {data.card5.challengesTop3.map((c, i) => <li key={i}>· {c}</li>)}
                </ul>
              </div>
            </div>
          </Card>
        </section>

        {/* 命格 3 層洞察 — Step 2 dashboard 三軸 */}
        <section className="mb-16">
          <Eyebrow align="left">命格 3 層洞察</Eyebrow>

          <div className="mt-8 space-y-8">
            {/* Step 1:核心性格 */}
            <Card className="p-8" interactive="subtle">
              <h3
                className="text-2xl font-semibold text-[var(--jy-text-primary)] mb-3"
                style={{ fontFamily: 'var(--jy-font-display)' }}
              >
                {data.insight3steps.step1.title}
              </h3>
              <p className="text-[var(--jy-text-secondary)] leading-relaxed">
                {data.insight3steps.step1.content}
              </p>
            </Card>

            {/* Step 2:三軸 KPI Dashboard */}
            <div className="space-y-6">
              <RadarTriad
                data={data.insight3steps.step2.dashboard}
                tags={data.insight3steps.step2.tags}
              />
              {data.insight3steps.step2.trapWarning && (
                <KeyTakeaway title="陷阱預警">
                  {data.insight3steps.step2.trapWarning}
                </KeyTakeaway>
              )}
            </div>

            {/* Step 3:行動時間軸 */}
            <Card className="p-8" interactive="subtle">
              <h3 className="text-xl font-semibold text-[var(--jy-text-primary)] mb-4">
                優先行動清單
              </h3>
              <ol className="space-y-3">
                {data.insight3steps.step3.priorityActions.map((action, i) => (
                  <li key={i} className="flex items-start gap-4">
                    {/* v5.10.299 editorial:date pill → mono date label hairline */}
                    <span
                      className="flex-shrink-0 inline-flex items-center text-[11px] tracking-[0.1em] border-l pl-2 pt-0.5"
                      style={{
                        borderLeftColor: 'var(--jy-text-gold)',
                        color: 'var(--jy-text-gold)',
                        fontFamily: 'var(--jy-font-mono), monospace',
                      }}
                    >
                      {action.date}
                    </span>
                    <div className="flex-1">
                      <span className="text-[var(--jy-text-tertiary)] text-sm mr-2">[{action.type}]</span>
                      <span className="text-[var(--jy-text-secondary)]">{action.text}</span>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-6 pt-6 border-t border-[var(--jy-border-hairline)]">
                <h4 className="text-sm font-medium text-[var(--jy-semantic-flow)] mb-2">成功指標</h4>
                <ul className="space-y-1.5">
                  {data.insight3steps.step3.successMetrics.map((m, i) => (
                    <li key={i} className="text-sm text-[var(--jy-text-secondary)]">{m}</li>
                  ))}
                </ul>
              </div>
            </Card>
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* 命格 5 大核心洞察 */}
        {data.insight5cards.length > 0 && (
          <section className="mb-16">
            <Eyebrow align="left">命格 5 大核心洞察</Eyebrow>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.insight5cards.map((card, i) => (
                <Card key={i} className="p-6">
                  <div className="text-3xl mb-3" aria-hidden>{card.icon}</div>
                  <h3 className="font-semibold text-[var(--jy-text-primary)]">{card.title}</h3>
                  <p className="mt-1 text-sm text-[var(--jy-text-gold)]">{card.subtitle}</p>
                  <p className="mt-3 text-sm text-[var(--jy-text-secondary)] leading-relaxed">{card.detail}</p>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* 八字四柱(從 card5.bazi 重新展示、加十神)*/}
        <section className="mb-16">
          <Eyebrow align="left">八字四柱詳細</Eyebrow>
          <div className="mt-8">
            <BaziPillars data={data.card5.bazi} highlightDayMaster />
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* Top 5 天賦 + 風險 */}
        <section id="sec-talents" className="mb-16 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <TopList5
            items={data.talentsTop5.map((t) => ({
              title: t.title,
              supportSystems: t.supportSystems,
              confidence: t.confidence,
              detail: t.manifestation,
              action: t.howToAmplify,
            }))}
            variant="talent"
          />
          <TopList5
            items={data.risksTop5.map((r) => ({
              title: r.title,
              supportSystems: r.supportSystems,
              confidence: r.confidence,
              detail: r.triggerTime,
              action: r.prevention,
            }))}
            variant="risk"
          />
        </section>

        <GoldDivider className="my-12" />

        {/* 大運時間軸(daYun)— Codex P1 修(v5.10.216) */}
        {data.daYun.length > 0 && (
          <section className="mb-16">
            <Eyebrow align="left">大運起伏時間軸</Eyebrow>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.daYun.map((dy) => {
                const energyColor = dy.energy >= 75 ? 'var(--jy-text-gold)' : dy.energy >= 50 ? 'var(--jy-semantic-balance)' : 'var(--jy-semantic-adjust)'
                return (
                  <Card key={dy.seq} className="p-5" interactive="subtle">
                    <div className="flex items-baseline justify-between mb-3">
                      <h4 className="text-2xl font-bold" style={{ fontFamily: 'var(--jy-font-display)', color: energyColor }}>
                        {dy.ganZhi}
                      </h4>
                      <span className="text-xs text-[var(--jy-text-tertiary)]">{dy.ageRange} 歲 · {dy.years}</span>
                    </div>
                    <p className="text-sm text-[var(--jy-text-secondary)] mb-2">
                      <span className="text-[var(--jy-text-muted)]">十神:</span> {dy.tenGod}
                      <span className="ml-3 text-[var(--jy-text-muted)]">能量:</span> <span style={{ color: energyColor }}>{dy.energy}</span>
                    </p>
                    <p className="text-sm font-medium text-[var(--jy-text-primary)]">{dy.theme}</p>
                    <p className="mt-2 text-xs text-[var(--jy-text-secondary)] leading-relaxed">{dy.strategy}</p>
                    {dy.keyYears.length > 0 && (
                      <ul className="mt-3 space-y-1 text-xs text-[var(--jy-text-tertiary)]">
                        {dy.keyYears.map((ky, i) => (
                          <li key={i}>· {ky.year}({ky.ganZhi}):{ky.note}</li>
                        ))}
                      </ul>
                    )}
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        <GoldDivider className="my-12" />

        {/* 命盤一覽(natalOverview)— Codex P1 修(v5.10.216) */}
        {data.natalOverview && (
          <section className="mb-16">
            <Eyebrow align="left">命盤一覽</Eyebrow>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card className="p-6 flex justify-center" interactive="subtle">
                <ZiweiNatalChart
                  palaces={data.natalOverview.ziwei12palaces}
                  centerInfo={{
                    yearGanzhi: '2026 丙午',
                    mainStar: data.card5.ziwei.palaceStar,
                  }}
                  size={500}
                />
              </Card>
              <Card className="p-6" interactive="subtle">
                <h3 className="font-semibold text-[var(--jy-text-primary)] mb-3">今日指引</h3>
                <p className="text-sm text-[var(--jy-text-tertiary)] mb-2">日期:{data.natalOverview.daily.date}</p>
                <p className="text-sm text-[var(--jy-text-tertiary)] mb-3">五行:{data.natalOverview.daily.element}</p>
                <KeyTakeaway title="本日宜">
                  {data.natalOverview.daily.tip}
                </KeyTakeaway>
              </Card>
            </div>
          </section>
        )}

        <GoldDivider className="my-12" />

        {/* 14 系統共識矩陣 — v5.10.313 editorial Heatmap(QA agent P0 #2、dataviz 65→82)
            ★★★☆☆ BBS 字符 → bg-alpha 漸變 + 數字、editorial dataviz like FT/Bloomberg infographic */}
        {data.consensusMatrix.dimensions.length > 0 && (
          <section id="sec-consensus" className="mb-16">
            <Eyebrow align="left">14 系統共識矩陣</Eyebrow>
            <p className="mt-2 text-xs text-[var(--jy-text-tertiary)] italic" style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif' }}>
              色塊深淺 = 該命理系統對該面向的共識強度(0-5 分)。深金 = 高共識、淺灰 = 低共識
            </p>
            <Card className="mt-6 p-0 overflow-x-auto" interactive="subtle">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[var(--jy-border-soft)]">
                    <th className="text-left py-3 px-4 sticky left-0 bg-[var(--jy-bg-card)] text-[10px] tracking-[0.18em] text-[var(--jy-text-muted)]" style={{ fontFamily: 'var(--jy-font-mono), monospace' }}>
                      面 向  /  系 統
                    </th>
                    {data.consensusMatrix.systems.map((sys) => (
                      <th
                        key={sys}
                        className="text-center py-3 px-2 text-[var(--jy-text-gold)] whitespace-nowrap text-[11px]"
                        style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif', fontWeight: 500 }}
                      >
                        {sys}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.consensusMatrix.dimensions.map((dim, di) => (
                    <tr key={dim} className="border-b border-[var(--jy-border-hairline)]">
                      <td
                        className="py-2.5 px-4 sticky left-0 bg-[var(--jy-bg-card)] text-[var(--jy-text-secondary)] whitespace-nowrap text-[12px]"
                        style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif' }}
                      >
                        {dim}
                      </td>
                      {data.consensusMatrix.grid[di]?.map((stars, si) => {
                        // editorial heatmap:0-5 對應 alpha 0/0.08/0.16/0.28/0.42/0.6
                        const ALPHA_MAP = [0, 0.08, 0.16, 0.28, 0.42, 0.6]
                        const alpha = ALPHA_MAP[stars] ?? 0
                        return (
                          <td
                            key={si}
                            className="text-center py-2.5 px-2 tabular-nums relative"
                            style={{
                              backgroundColor: `rgba(201, 168, 76, ${alpha})`,
                              color: stars >= 4 ? 'var(--jy-text-primary)' : stars >= 2 ? 'var(--jy-text-secondary)' : 'var(--jy-text-muted)',
                              fontWeight: stars >= 4 ? 600 : 400,
                              fontFamily: 'var(--jy-font-mono), monospace',
                              fontSize: '12px',
                            }}
                            aria-label={`${dim} × ${data.consensusMatrix.systems[si]}:${stars}/5 分`}
                          >
                            {stars > 0 ? stars : '·'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            {/* 共識度 footer — editorial summary chart */}
            <div className="mt-4 flex items-center gap-x-6 gap-y-2 flex-wrap text-xs text-[var(--jy-text-tertiary)] px-1">
              <span className="text-[10px] tracking-[0.18em] text-[var(--jy-text-muted)]" style={{ fontFamily: 'var(--jy-font-mono), monospace' }}>
                整 體 共 識 度
              </span>
              {data.consensusMatrix.consensus.map((c, i) => {
                const COLOR = { high: 'var(--jy-semantic-flow)', mid: 'var(--jy-semantic-balance)', low: 'var(--jy-semantic-adjust)' }
                return (
                  <span key={i} className="inline-flex items-center gap-2">
                    <span className="inline-block w-2 h-2" style={{ backgroundColor: COLOR[c.level] }} aria-hidden />
                    <span style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif' }}>
                      {c.level === 'high' ? '高' : c.level === 'mid' ? '中' : '低'} {c.pct}%
                    </span>
                  </span>
                )
              })}
            </div>
          </section>
        )}

        <GoldDivider className="my-12" />

        {/* 12 月份能量(YearEnergyMonths)— v5.10.214 */}
        {data.yearEnergy12.length > 0 && (
          <section className="mb-16">
            <Eyebrow align="left">2026 12 月份能量</Eyebrow>
            <Card className="mt-8 p-6" interactive="subtle">
              <YearEnergyMonths data={data.yearEnergy12} title="" />
            </Card>
          </section>
        )}

        <GoldDivider className="my-12" />

        {/* 三階段行動計畫 */}
        <section id="sec-actionplan" className="mb-16">
          <Eyebrow align="left">三階段行動計畫</Eyebrow>
          <div className="mt-8">
            <ActionPlanStages
              immediate={data.planStages.immediate}
              short={data.planStages.short}
              long={data.planStages.long}
            />
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* 幸運參數 */}
        <section id="sec-lucky" className="mb-16">
          <Eyebrow align="left">幸運參數</Eyebrow>
          <div className="mt-8">
            <LuckyParams data={data.luckyParams} />
          </div>
        </section>

        {/* 命格處方箋 — practices5 */}
        {data.practices5.length > 0 && (
          <>
            <GoldDivider className="my-12" />
            <section className="mb-16">
              <Eyebrow align="left">命格處方箋</Eyebrow>
              <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
                {data.practices5.map((p, i) => (
                  <PracticeCard
                    key={i}
                    title={p.title}
                    purpose={p.commandRecipe}
                    bond={p.painPoint}
                    steps={p.steps}
                    obstacle={p.obstacle}
                  />
                ))}
              </div>
            </section>
          </>
        )}

        {/* 起承轉合附錄系統列(若 appendix14Systems 有資料)*/}
        {data.appendix14Systems.length > 0 && (
          <>
            <GoldDivider className="my-12" />
            <section className="mb-16">
              <Eyebrow align="left">14 系統交叉發現</Eyebrow>
              <div className="mt-8">
                <ChapterGroup type="multiple">
                  {data.appendix14Systems.map((sys, i) => {
                    // v5.10.251 wire dead component:TermAuto auto-wrap 已知系統名(若 term-dictionary 有定義)
                    const systemDef = getTerm(sys.system)
                    return (
                      <ChapterSection
                        key={i}
                        number={i + 1}
                        emoji=""
                        title={sys.system}
                      >
                        {systemDef ? (
                          <p className="text-[var(--jy-text-muted)] text-xs mb-2">
                            <TermAuto>{sys.system}</TermAuto>
                            <span className="ml-1.5">·{systemDef.system}</span>
                          </p>
                        ) : null}
                        <p className="text-[var(--jy-text-secondary)] leading-relaxed">
                          {sys.finding}
                        </p>
                      </ChapterSection>
                    )
                  })}
                </ChapterGroup>
              </div>
            </section>
          </>
        )}

        <GoldDivider className="my-12" />

        {/* 一句話總結 */}
        <section className="mb-16 text-center">
          <p
            style={{
              fontFamily: 'var(--jy-font-display)',
              fontSize: 'clamp(22px, 2vw, 32px)',
              lineHeight: 1.5,
              color: 'var(--jy-text-gold)',
              fontStyle: 'italic',
            }}
          >
            「{data.oneLiner}」
          </p>
        </section>

        {/* 寫給您的話(letterFinal) */}
        <section className="mb-16">
          <Card className="p-10" interactive="subtle">
            <h3
              className="text-2xl font-semibold text-[var(--jy-text-gold)] mb-6 text-center"
              style={{ fontFamily: 'var(--jy-font-display)' }}
            >
              寫給{data.meta.name}的話
            </h3>
            <div className="space-y-4 text-[var(--jy-text-secondary)] leading-relaxed">
              <QuickSummary
                title="回顧 / 此刻 / 未來"
                bullets={[
                  data.letterFinal.retrospect,
                  data.letterFinal.present,
                  data.letterFinal.future,
                ]}
              />
              <p className="text-center text-lg pt-4 italic" style={{ color: 'var(--jy-text-gold)' }}>
                「{data.letterFinal.declaration}」
              </p>
            </div>
          </Card>
        </section>

        <GoldDivider className="my-12" />

        {/* FeedbackForm — Sprint 1 wire(v5.10.224) */}
        <section className="mb-12">
          <FeedbackForm reportId={data.meta.id} reportType="life-blueprint" />
        </section>

        <GoldDivider className="my-12" />

        {/* PDF download — v5.10.235 wire */}
        <section className="mb-12 flex justify-center">
          <PDFDownloadButton reportType="life-blueprint" reportId={data.meta.id} />
        </section>

        </StaggerItem>
        </Stagger>

        {/* 報告印章 + 危機求助 Footer */}
        <section className="space-y-6">
          <ReportSeal
            reportId={data.meta.id}
            hash={data.meta.hash}
            engineVersion={data.meta.engineVersion}
            reportDate={data.meta.reportDate}
          />
          <CrisisFooter />
        </section>
        </div>{/* /content column */}
        </div>{/* /xl grid */}
        <BackToTop />
      </main>
    </>
  )
}

function SkeletonView({ id }: { id: string }) {
  return (
    <main
      className="min-h-screen text-[var(--jy-text-primary)]"
      style={{ background: 'var(--jy-bg-glow)', backgroundColor: 'var(--jy-bg-void)' }}
    >
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">
        <Eyebrow>LIFE BLUEPRINT · 人生藍圖</Eyebrow>
        <h1
          className="mt-8 font-bold"
          style={{
            fontFamily: 'var(--jy-font-display)',
            fontSize: 'clamp(48px, 6vw, 88px)',
            lineHeight: 1.05,
          }}
        >
          人生藍圖
        </h1>
        <p className="mt-4 text-[var(--jy-text-tertiary)]">
          報告 ID:<span className="font-mono">{id}</span>
        </p>
        <GoldDivider className="my-8" />
        <Card className="p-8">
          <p className="text-[var(--jy-text-secondary)]">找不到此 ID 對應的 demo 資料</p>
          <p className="mt-3 text-sm text-[var(--jy-text-tertiary)]">
            Sprint 1 demo 路徑:<code>/r/life-blueprint/he-yu-zhun</code>
          </p>
        </Card>
      </div>
    </main>
  )
}

function ActionCard({ label, text, accent, icon }: { label: string; text: string; accent: 'green' | 'amber' | 'violet'; icon: string }) {
  const ACCENT_COLOR = {
    green: 'var(--jy-semantic-flow)',
    amber: 'var(--jy-semantic-balance)',
    violet: '#A78BFA',
  }[accent]
  return (
    <Card className="p-6">
      <div className="text-3xl">{icon}</div>
      <p className="mt-4 text-sm font-medium" style={{ color: ACCENT_COLOR }}>
        {label}
      </p>
      <p className="mt-2 text-[var(--jy-text-secondary)]">{text}</p>
    </Card>
  )
}

function BaziPillar({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--jy-border-soft)] p-4 text-center">
      <p className="text-xs text-[var(--jy-text-tertiary)]">{label}柱</p>
      <p
        className={`mt-2 font-bold ${highlight ? 'text-[var(--jy-text-gold)]' : 'text-[var(--jy-text-primary)]'}`}
        style={{ fontFamily: 'var(--jy-font-display)', fontSize: 'clamp(28px, 3vw, 40px)', lineHeight: 1 }}
      >
        {value}
      </p>
    </div>
  )
}
