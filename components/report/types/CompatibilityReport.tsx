// v5.10.211 Sprint 1 — CompatibilityReport(對齊 schema、用 VerdictBadge + 雙人 hero + 7 系統 + 三年流年)
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Card } from '@/components/ui/Card'
import { GoldDivider } from '@/components/effects/GoldDivider'
import { VerdictBadge } from '@/components/report/shared/VerdictBadge'
import { HeroBlock } from '@/components/report/shared/HeroBlock'
import { ChapterGroup, ChapterSection } from '@/components/report/shared/ChapterSection'
import { KeyTakeaway } from '@/components/report/shared/KeyTakeaway'
import { QuickSummary } from '@/components/report/shared/QuickSummary'
// v5.10.314 editorial(McKinsey + magazine pattern):結論先行
import { ExecutiveSummary } from '@/components/report/shared/DropCap'
import { PracticeCard } from '@/components/report/shared/PracticeCard'
import { ReportSeal } from '@/components/report/shared/ReportSeal'
import { CrisisFooter } from '@/components/report/shared/CrisisFooter'
import { BaziPillars } from '@/components/report/shared/BaziPillars'
import { FeedbackForm } from '@/components/report/shared/FeedbackForm'
import { PDFDownloadButton } from '@/components/report/shared/PDFDownloadButton'
import { ReportToolbar } from '@/components/report/shared/ReportToolbar'
import { ScrollProgress } from '@/components/effects/ScrollProgress'
import { BackToTop } from '@/components/effects/BackToTop'
import type { CompatibilityReport as CompatibilityData } from '@/types/report-schemas'

interface CompatibilityReportProps {
  id: string
  data?: CompatibilityData
}

export function CompatibilityReport({ id, data }: CompatibilityReportProps) {
  if (!data) return <SkeletonView id={id} />

  return (
    <>
      <ScrollProgress />
      <ReportToolbar
        reportTitle={`合否? · ${data.pair.a.name}×${data.pair.b.name}`}
        onDownloadPDF={() => { window.location.href = `/api/r/compatibility/${data.meta.id}/pdf` }}
      />
      <main className="min-h-screen text-[var(--jy-text-primary)] relative overflow-hidden" style={{ background: 'var(--jy-bg-glow)', backgroundColor: 'var(--jy-bg-void)' }}>
        <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8 relative z-10">

        {/* HERO 雙人 × 判定徽章 — v5.10.259 wire HeroBlock 'verdict' variant(DRY refactor) */}
        <HeroBlock
          variant="verdict"
          eyebrow="COMPATIBILITY · 合否?"
          nameA={data.pair.a.name}
          nameB={data.pair.b.name}
          scenario={data.scenario}
          durations={{ short: data.meta.durationShort, full: data.meta.durationFull }}
          verdict={data.verdict}
          verdictSubtitle={data.verdictMeta.subtitle}
        />

        {/* v5.10.314 ExecutiveSummary「一分鐘看懂」(R 報告結論先行) */}
        <ExecutiveSummary
          title="一分鐘看懂"
          bullets={[
            `合盤判定:${data.verdict}`,
            data.verdictMeta?.subtitle ? `關係定位:${data.verdictMeta.subtitle}` : '雙方命格交叉、互動模式已解析',
            data.scenario ? `情境主題:${data.scenario}` : '本次合盤鎖定核心關係議題',
          ]}
        />

        {/* 你們的問題 */}
        <section className="mb-12">
          <Card className="p-8 text-center" interactive="subtle">
            <p className="text-xs uppercase tracking-widest text-[var(--jy-text-muted)] mb-3">
              你們的問題
            </p>
            <p
              className="italic text-[var(--jy-text-primary)]"
              style={{ fontSize: 'clamp(20px, 2vw, 24px)', lineHeight: 1.6 }}
            >
              「{data.question.raw}」
            </p>
          </Card>
        </section>

        <GoldDivider className="my-12" />

        {/* 兩人八字並排 */}
        <section className="mb-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div>
            <h3 className="text-lg font-semibold text-[var(--jy-text-primary)] mb-4">{data.pair.a.name} 的八字</h3>
            <BaziPillars data={data.pair.a.bazi} highlightDayMaster />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--jy-text-primary)] mb-4">{data.pair.b.name} 的八字</h3>
            <BaziPillars data={data.pair.b.bazi} highlightDayMaster />
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* 你們的答案 */}
        <section className="mb-12">
          <Eyebrow align="left">你們的答案</Eyebrow>
          <Card className="mt-8 p-8" interactive="subtle">
            <QuickSummary bullets={[data.answerChapter.quickSummary]} />
            <div className="mt-6 space-y-3 text-[var(--jy-text-secondary)] leading-relaxed">
              {data.answerChapter.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </Card>
        </section>

        <GoldDivider className="my-12" />

        {/* 七大系統合盤(摺疊章節) */}
        <section className="mb-12">
          <Eyebrow align="left">七大系統合盤</Eyebrow>
          <div className="mt-8">
            <ChapterGroup type="multiple">
              <ChapterSection emoji="" title="化學反應(總章)">
                <p className="italic text-[var(--jy-text-gold)] mb-3">{data.chemistry.metaphor}</p>
                <p className="text-[var(--jy-text-secondary)]">{data.chemistry.quickSummary}</p>
              </ChapterSection>

              <ChapterSection emoji="" title={`八字合盤 → ${data.baziSynastry.verdict}`}>
                <SystemCardBody summary={data.baziSynastry.summary} rows={[
                  { label: '日干關係', value: data.baziSynastry.dayMasterRelation },
                  { label: '年支日支', value: data.baziSynastry.yearBranchRelation },
                  { label: '五行互補', value: data.baziSynastry.fiveElementComplement },
                  { label: '大運配合', value: data.baziSynastry.daYunMatch },
                ]} />
              </ChapterSection>

              <ChapterSection emoji="" title={`紫微互參 → ${data.ziweiSynastry.verdict}`}>
                <SystemCardBody summary={data.ziweiSynastry.summary} rows={[
                  { label: `${data.pair.a.name} 命宮`, value: data.ziweiSynastry.aCommandPalace },
                  { label: `${data.pair.b.name} 命宮`, value: data.ziweiSynastry.bCommandPalace },
                  { label: `${data.pair.a.name} 四化`, value: data.ziweiSynastry.fourTransformations.a },
                  { label: `${data.pair.b.name} 四化`, value: data.ziweiSynastry.fourTransformations.b },
                  { label: '飛宮分析', value: data.ziweiSynastry.crossFlightAnalysis },
                ]} />
              </ChapterSection>

              <ChapterSection emoji="" title={`西占 Synastry → ${data.westernSynastry.verdict}`}>
                <p className="text-sm text-[var(--jy-text-tertiary)] mb-3">{data.westernSynastry.selfCheck}</p>
                <p className="text-xs text-[var(--jy-text-muted)] mb-3">盤類:{data.westernSynastry.sectDay}</p>
                <ul className="space-y-2">
                  {data.westernSynastry.aspects.map((a, i) => (
                    <li key={i} className="text-sm">
                      <span className="text-[var(--jy-text-gold)] font-medium">{a.planet}:</span>
                      {' '}{a.relation}
                      <span className="text-[var(--jy-text-tertiary)] text-xs"> ({a.orb}°)</span>
                      <span className="text-[var(--jy-text-secondary)]"> — {a.impact}</span>
                    </li>
                  ))}
                </ul>
              </ChapterSection>

              <ChapterSection emoji="" title={`吠陀 Kuta → ${data.vedicKuta.verdict}`}>
                <SystemCardBody summary="" rows={[
                  { label: 'Graha Maitri', value: data.vedicKuta.grahaMaitri },
                  { label: 'Tara', value: data.vedicKuta.tara },
                  { label: '共有 Yoga', value: data.vedicKuta.yogasShared.join(', ') },
                ]} />
              </ChapterSection>

              <ChapterSection emoji="" title={`人類圖配對 → ${data.hdPair.verdict}`}>
                <SystemCardBody summary="" rows={[
                  { label: '類型', value: data.hdPair.typeMatch },
                  { label: 'Profile', value: data.hdPair.profileMatch },
                  { label: '中心互補', value: data.hdPair.centersComplement },
                ]} />
              </ChapterSection>

              <ChapterSection emoji="" title={`數字命理 → ${data.numerologyPair.verdict}`}>
                <SystemCardBody summary={`配對:${data.numerologyPair.pair}`} rows={[
                  { label: '雙方都缺', value: data.numerologyPair.missingShared.join(', ') },
                ]} />
              </ChapterSection>

              <ChapterSection emoji="" title={`易經 → ${data.ichingPair.verdict}`}>
                <p className="text-[var(--jy-text-gold)] font-medium">{data.ichingPair.hexagram}</p>
                <p className="mt-2 text-[var(--jy-text-secondary)]">{data.ichingPair.interpretation}</p>
                <p className="mt-2 text-[var(--jy-semantic-balance)] text-sm">⚠ {data.ichingPair.warning}</p>
              </ChapterSection>

              <ChapterSection emoji="" title={`生肖 → ${data.zodiacPair.verdict}`}>
                <p className="text-[var(--jy-text-secondary)]">
                  {data.pair.a.name}({data.zodiacPair.a}) × {data.pair.b.name}({data.zodiacPair.b})
                  {' = '}
                  <span className="text-[var(--jy-text-gold)]">{data.zodiacPair.relation}</span>
                </p>
                {data.zodiacPair.taiSuiNote && (
                  <p className="mt-2 text-sm text-[var(--jy-text-tertiary)]">{data.zodiacPair.taiSuiNote}</p>
                )}
              </ChapterSection>
            </ChapterGroup>
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* 綜合判定 */}
        <section className="mb-12">
          <Eyebrow align="left">★ 綜合判定</Eyebrow>
          <Card className="mt-8 p-8" interactive="subtle">
            <p className="text-[var(--jy-text-secondary)] leading-relaxed mb-6">{data.finalJudge.summary}</p>

            <div className="grid grid-cols-3 gap-4 mb-6">
              <Stat label="合" value={data.finalJudge.countCompat} color="var(--jy-semantic-flow)" />
              <Stat label="需磨合" value={data.finalJudge.countNeed} color="var(--jy-semantic-balance)" />
              <Stat label="不合" value={data.finalJudge.countNot} color="var(--jy-semantic-danger)" />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <h4 className="font-medium text-[var(--jy-semantic-flow)] mb-2">好的地方</h4>
                <ul className="space-y-1.5 text-sm text-[var(--jy-text-secondary)]">
                  {data.finalJudge.pros.map((p, i) => <li key={i}>· {p}</li>)}
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-[var(--jy-semantic-balance)] mb-2">需要注意</h4>
                <ul className="space-y-2 text-sm">
                  {data.finalJudge.cautions.map((c, i) => (
                    <li key={i} className="text-[var(--jy-text-secondary)]">
                      <strong>· {c.point}</strong>
                      <p className="text-xs text-[var(--jy-text-tertiary)] ml-3">→ {c.remedy}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-[var(--jy-text-gold)] mb-2">改善建議</h4>
                <ul className="space-y-1.5 text-sm text-[var(--jy-text-secondary)]">
                  {data.finalJudge.suggestions.map((s, i) => <li key={i}>· {s}</li>)}
                </ul>
              </div>
            </div>
          </Card>
        </section>

        {/* 三年流年 */}
        <section className="mb-12">
          <Eyebrow align="left">三年流年</Eyebrow>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            {data.yearly.map((y) => (
              <Card key={y.year} className="p-5" interactive="subtle">
                <h4 className="text-2xl font-bold text-[var(--jy-text-gold)]" style={{ fontFamily: 'var(--jy-font-display)' }}>
                  {y.year} <span className="text-base text-[var(--jy-text-tertiary)]">{y.ganzhi}</span>
                </h4>
                <p className="mt-3 text-sm text-[var(--jy-text-secondary)]">{y.relationEnergy}</p>
                <div className="mt-4 text-xs space-y-1.5">
                  <p className="text-[var(--jy-semantic-flow)]">✓ 適合:{y.whatToDo}</p>
                  <p className="text-[var(--jy-semantic-danger)]">✗ 不宜:{y.whatNotToDo}</p>
                  <p className="text-[var(--jy-text-tertiary)]">甜蜜月:{y.sweetMonths.join('、')} 月</p>
                  <p className="text-[var(--jy-text-tertiary)]">地雷月:{y.mineMonths.join('、')} 月</p>
                </div>
              </Card>
            ))}
          </div>
          <Card className="mt-6 p-6" interactive="subtle">
            <h4 className="font-medium text-[var(--jy-text-gold)] mb-2">三年總覽</h4>
            <ul className="text-sm text-[var(--jy-text-secondary)] space-y-1.5">
              <li>最佳年:{data.threeYearOverview.best}</li>
              <li>⚠ 最艱難:{data.threeYearOverview.toughest}</li>
              <li>重大決策窗口:{data.threeYearOverview.decisionWindows.join(' / ')}</li>
            </ul>
          </Card>
        </section>

        <GoldDivider className="my-12" />

        {/* 轉篇:bestPoints + cautions + relationFlow(Codex P1 修、v5.10.218) */}
        {data.bestPoints.length > 0 && (
          <section className="mb-12">
            <Eyebrow align="left">你們最好的地方({data.bestPoints.length} 條)</Eyebrow>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.bestPoints.map((bp, i) => (
                <Card key={i} className="p-5" interactive="subtle">
                  <h4 className="font-semibold text-[var(--jy-semantic-flow)]">{bp.title}</h4>
                  <p className="mt-2 text-xs text-[var(--jy-text-tertiary)]">支持:{bp.support.join(' / ')}</p>
                  <p className="mt-2 text-sm text-[var(--jy-text-secondary)]">{bp.guide}</p>
                </Card>
              ))}
            </div>
          </section>
        )}

        {data.cautions.length > 0 && (
          <section className="mb-12">
            <Eyebrow align="left">⚠ 你們需要注意的地方({data.cautions.length} 條)</Eyebrow>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.cautions.map((c, i) => (
                <Card key={i} className="p-5 border-l-4" style={{ borderLeftColor: 'var(--jy-semantic-balance)' }} interactive="subtle">
                  <h4 className="font-semibold text-[var(--jy-semantic-balance)]">⚠ {c.title}</h4>
                  <p className="mt-2 text-xs text-[var(--jy-text-tertiary)]">支持:{c.support.join(' / ')}</p>
                  <p className="mt-2 text-sm text-[var(--jy-text-secondary)]">觸發:{c.trigger}</p>
                  <p className="mt-1 text-xs text-[var(--jy-text-gold)]">補救:{c.remedy}</p>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="mb-12">
          <Card className="p-8" interactive="subtle">
            <h3 className="text-xl font-semibold text-[var(--jy-text-primary)] mb-3" style={{ fontFamily: 'var(--jy-font-display)' }}>
              你們的關係流年總覽
            </h3>
            <p className="text-[var(--jy-text-secondary)] leading-relaxed">{data.relationFlow.summary}</p>
          </Card>
        </section>

        {/* 起篇 questionChapter + practices(本 session 漏) */}
        <section className="mb-12">
          <Eyebrow align="left">你們的問題(深度解析)</Eyebrow>
          <Card className="mt-8 p-8" interactive="subtle">
            <QuickSummary bullets={[data.questionChapter.quickSummary]} />
          </Card>
        </section>

        {data.practices.length > 0 && (
          <section className="mb-12">
            <Eyebrow align="left">刻意練習({data.practices.length} 條)</Eyebrow>
            <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
              {data.practices.map((p, i) => (
                <PracticeCard
                  key={i}
                  title={p.title}
                  purpose={p.purpose}
                  duration={p.duration}
                  steps={p.steps}
                />
              ))}
            </div>
          </section>
        )}

        <GoldDivider className="my-12" />

        {/* 處方箋 */}
        <section className="mb-12">
          <Eyebrow align="left">改善建議——關係處方箋</Eyebrow>
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {data.prescriptions.map((p, i) => (
              <PracticeCard
                key={i}
                title={p.title}
                purpose={p.importance}
                bond={p.psychBasis}
                steps={p.steps}
                obstacle={p.expected}
              />
            ))}
          </div>
        </section>

        {/* 雙人 letter */}
        <section className="mb-12">
          <Eyebrow align="left">寫給你們的話</Eyebrow>
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card className="p-8" interactive="subtle">
              <h4 className="font-medium text-[var(--jy-text-gold)] mb-4">給 {data.pair.a.name}</h4>
              <p className="text-[var(--jy-text-secondary)] leading-relaxed">{data.letter.a}</p>
            </Card>
            <Card className="p-8" interactive="subtle">
              <h4 className="font-medium text-[var(--jy-text-gold)] mb-4">給 {data.pair.b.name}</h4>
              <p className="text-[var(--jy-text-secondary)] leading-relaxed">{data.letter.b}</p>
            </Card>
            <Card className="p-8" interactive="subtle">
              <h4 className="font-medium text-[var(--jy-text-gold)] mb-4">給你們倆</h4>
              <p className="text-[var(--jy-text-secondary)] leading-relaxed italic">{data.letter.together}</p>
            </Card>
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* FeedbackForm — Sprint 1 wire(v5.10.224) */}
        <section className="mb-12">
          <FeedbackForm reportId={data.meta.id} reportType="compatibility" />
        </section>

        <GoldDivider className="my-12" />

        {/* PDF download — v5.10.235 wire */}
        <section className="mb-12 flex justify-center">
          <PDFDownloadButton reportType="compatibility" reportId={data.meta.id} />
        </section>

        {/* Footer */}
        <section className="space-y-6">
          <ReportSeal
            reportId={data.meta.id}
            hash={data.meta.hash}
            engineVersion={data.meta.engineVersion}
            reportDate={data.meta.reportDate}
          />
          <CrisisFooter />
        </section>
        </div>
        <BackToTop />
      </main>
    </>
  )
}

function SystemCardBody({ summary, rows }: { summary: string; rows: { label: string; value: string }[] }) {
  return (
    <>
      {summary && <p className="text-[var(--jy-text-secondary)] leading-relaxed mb-3">{summary}</p>}
      <dl className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {rows.map((r, i) => (
          <div key={i} className="text-sm">
            <dt className="text-[var(--jy-text-muted)] text-xs uppercase tracking-wider">{r.label}</dt>
            <dd className="text-[var(--jy-text-secondary)] mt-0.5">{r.value}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-xs text-[var(--jy-text-tertiary)] mt-1">{label}</div>
    </div>
  )
}

function SkeletonView({ id }: { id: string }) {
  return (
    <main className="min-h-screen text-[var(--jy-text-primary)]" style={{ background: 'var(--jy-bg-glow)', backgroundColor: 'var(--jy-bg-void)' }}>
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">
        <Eyebrow>COMPATIBILITY · 合否?</Eyebrow>
        <h1 className="mt-8 font-bold" style={{ fontFamily: 'var(--jy-font-display)', fontSize: 'clamp(48px, 6vw, 88px)', lineHeight: 1.05 }}>合否?</h1>
        <p className="mt-4 text-[var(--jy-text-tertiary)]">報告 ID:<span className="font-mono">{id}</span></p>
        <GoldDivider className="my-8" />
        <Card className="p-8">
          <p className="text-[var(--jy-text-secondary)]">找不到此 ID 對應的 demo 資料</p>
          <p className="mt-3 text-sm text-[var(--jy-text-tertiary)]">Sprint 1 demo 路徑:<code>/r/compatibility/lin-yuan-lin-x-he-xuan-yi</code></p>
        </Card>
      </div>
    </main>
  )
}
