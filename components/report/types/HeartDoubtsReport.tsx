// v5.10.210 Sprint 1 — HeartDoubtsReport(對齊 schema、用 ScoreCircle / EvidenceList / 整合 wave 1+2 元件)
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Card } from '@/components/ui/Card'
import { GoldDivider } from '@/components/effects/GoldDivider'
import { ScoreCircle } from '@/components/report/shared/ScoreCircle'
import { HeroBlock } from '@/components/report/shared/HeroBlock'
import { BaziPillars } from '@/components/report/shared/BaziPillars'
import { EvidenceList } from '@/components/report/shared/EvidenceList'
import { KeyTakeaway } from '@/components/report/shared/KeyTakeaway'
import { QuickSummary } from '@/components/report/shared/QuickSummary'
import { ChapterGroup, ChapterSection } from '@/components/report/shared/ChapterSection'
import { MonthlyDecisionTable } from '@/components/report/shared/MonthlyDecisionTable'
import { PracticeCard } from '@/components/report/shared/PracticeCard'
import { ReportSeal } from '@/components/report/shared/ReportSeal'
import { CrisisFooter } from '@/components/report/shared/CrisisFooter'
import { FeedbackForm } from '@/components/report/shared/FeedbackForm'
import { PDFDownloadButton } from '@/components/report/shared/PDFDownloadButton'
import { ReportToolbar } from '@/components/report/shared/ReportToolbar'
import { ScrollProgress } from '@/components/effects/ScrollProgress'
import { BackToTop } from '@/components/effects/BackToTop'
import type { HeartDoubtsReport as HeartDoubtsData } from '@/types/report-schemas'

interface HeartDoubtsReportProps {
  id: string
  data?: HeartDoubtsData
}

export function HeartDoubtsReport({ id, data }: HeartDoubtsReportProps) {
  if (!data) return <SkeletonView id={id} />

  return (
    <>
      <ScrollProgress />
      <ReportToolbar
        reportTitle={`心之所惑 · ${data.meta.name}`}
        onDownloadPDF={() => { window.location.href = `/api/r/heart-doubts/${data.meta.id}/pdf` }}
      />
      <main
        className="min-h-screen text-[var(--jy-text-primary)] relative overflow-hidden"
        style={{ background: 'var(--jy-bg-glow)', backgroundColor: 'var(--jy-bg-void)' }}
      >
        <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8 relative z-10">

        {/* HERO 評分卡 — v5.10.259 wire HeroBlock 'score' variant(DRY refactor、跟原 inline 邏輯一致) */}
        <HeroBlock
          variant="score"
          eyebrow="HEART DOUBTS · 心之所惑"
          name={data.meta.name}
          birthDate={data.meta.birthDate}
          durations={{ short: data.meta.durationShort, full: data.meta.durationFull }}
          grade={data.score.grade}
          value={data.score.value}
          percentile={data.score.percentile}
          challengeLevel={data.score.challengeLevel}
          systemsCount={data.score.systemsCount}
        />

        <GoldDivider className="my-12" />

        {/* 你的問題 */}
        <section className="mb-12">
          <Card
            className="p-8 border-l-4"
            style={{ borderLeftColor: 'var(--jy-text-gold)' }}
            interactive={false}
          >
            <p className="text-xs uppercase tracking-widest text-[var(--jy-text-muted)] mb-3">
              你的問題
            </p>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl" aria-hidden>{data.question.icon}</span>
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-sm"
                style={{
                  backgroundColor: 'rgba(229, 185, 92, 0.12)',
                  color: 'var(--jy-text-gold)',
                  border: '1px solid var(--jy-border-hairline)',
                }}
              >
                {data.question.topic}
              </span>
            </div>
            <p
              className="italic text-[var(--jy-text-primary)]"
              style={{ fontSize: 'clamp(18px, 2vw, 22px)', lineHeight: 1.6 }}
            >
              「{data.question.raw}」
            </p>
          </Card>
        </section>

        {/* 八字 + 命盤佐證 */}
        <section className="mb-12 space-y-6">
          <Eyebrow align="left">命盤一覽</Eyebrow>
          <BaziPillars data={{ year: data.bazi.year, month: data.bazi.month, day: data.bazi.day, hour: data.bazi.hour, dayMaster: data.bazi.dayMaster }} highlightDayMaster />
          <Card className="p-5" interactive={false}>
            <p className="text-sm text-[var(--jy-text-secondary)] leading-relaxed">
              <span className="text-[var(--jy-text-gold)] font-medium">五行解讀:</span>{data.bazi.insight}
            </p>
          </Card>
          <EvidenceList items={data.evidence} />
        </section>

        <GoldDivider className="my-12" />

        {/* 你的答案 */}
        <section className="mb-12">
          <Eyebrow align="left">你的答案</Eyebrow>
          <div className="mt-8 space-y-6">
            <Card className="p-8" interactive={false}>
              <h3
                className="text-2xl font-semibold text-[var(--jy-text-primary)] mb-4"
                style={{ fontFamily: 'var(--jy-font-display)' }}
              >
                結論
              </h3>
              <p className="text-lg text-[var(--jy-text-secondary)] leading-relaxed mb-4">
                {data.answer.conclusion}
              </p>
              <KeyTakeaway title="前提條件">
                {data.answer.condition}
              </KeyTakeaway>
            </Card>

            <Card className="p-8" interactive={false}>
              <h4 className="text-sm uppercase tracking-wider text-[var(--jy-text-muted)] mb-4">
                論述展開
              </h4>
              <div className="space-y-3">
                {data.answer.paragraphs.map((p, i) => (
                  <p key={i} className="text-[var(--jy-text-secondary)] leading-relaxed">{p}</p>
                ))}
              </div>
            </Card>
          </div>
        </section>

        {/* 起承轉合 */}
        <section className="mb-12">
          <Eyebrow align="left">起承轉合</Eyebrow>
          <div className="mt-8">
            <ChapterGroup type="multiple">
              <ChapterSection emoji="" title="深入解析:命格怎麼看這件事">
                <QuickSummary bullets={[data.chapters.one_deep.quickSummary]} />
                {data.chapters.one_deep.body.map((p, i) => (
                  <p key={i} className="text-[var(--jy-text-secondary)] leading-relaxed">{p}</p>
                ))}
              </ChapterSection>

              <ChapterSection emoji="" title="命格與此事的直接關聯">
                <QuickSummary bullets={[data.chapters.bond.quickSummary]} />
                {data.chapters.bond.body.map((p, i) => (
                  <p key={i} className="text-[var(--jy-text-secondary)] leading-relaxed">{p}</p>
                ))}
              </ChapterSection>

              <ChapterSection emoji="" title="今年的流年能量">
                <QuickSummary bullets={[data.chapters.flowYear.quickSummary]} />
                {data.chapters.flowYear.body.map((p, i) => (
                  <p key={i} className="text-[var(--jy-text-secondary)] leading-relaxed">{p}</p>
                ))}
              </ChapterSection>

              <ChapterSection emoji="" title="最佳行動方案(短/中/長)">
                <div className="space-y-4">
                  {[data.chapters.bestPlan.short, data.chapters.bestPlan.mid, data.chapters.bestPlan.long].map((stage, i) => (
                    <Card key={i} className="p-4" interactive={false}>
                      <h5 className="font-semibold text-[var(--jy-text-gold)] mb-2">{stage.title}</h5>
                      <ul className="space-y-1.5">
                        {stage.actions.map((a, j) => (
                          <li key={j} className="text-sm text-[var(--jy-text-secondary)]">→ {a}</li>
                        ))}
                      </ul>
                    </Card>
                  ))}
                </div>
              </ChapterSection>

              <ChapterSection emoji="" title="最佳時機表">
                <MonthlyDecisionTable rows={data.chapters.timing.map(t => ({
                  period: t.period,
                  action: t.action,
                  reason: t.reason,
                  note: t.note,
                  highlight: t.action.includes('行動') || t.action.includes('簽約'),
                }))} title="" />
              </ChapterSection>

              <ChapterSection emoji="" title={`最大風險(${data.chapters.risks.length} 條)`}>
                <ul className="space-y-3">
                  {data.chapters.risks.map((r, i) => (
                    <li key={i}>
                      <h5 className="font-medium text-[var(--jy-semantic-danger)]">⚠ {r.title}</h5>
                      <p className="mt-1 text-sm text-[var(--jy-text-secondary)]">{r.detail}</p>
                    </li>
                  ))}
                </ul>
              </ChapterSection>

              <ChapterSection emoji="" title="刻意練習">
                <div className="space-y-4">
                  {data.chapters.practice.map((p, i) => (
                    <PracticeCard
                      key={i}
                      title={p.title}
                      purpose={p.purpose}
                      bond={p.bond}
                      duration={p.duration}
                      steps={[p.scene, p.content, p.milestone]}
                      obstacle={p.recovery}
                      difficulty={p.difficulty}
                    />
                  ))}
                </div>
              </ChapterSection>
            </ChapterGroup>
          </div>
        </section>

        {/* 轉篇 - root + caveats(Codex P1 修、v5.10.217) */}
        <section className="mb-12">
          <Eyebrow align="left">轉篇:根源剖析 + 注意事項</Eyebrow>
          <div className="mt-8 space-y-6">
            {/* Root */}
            <Card className="p-8" interactive={false}>
              <h3
                className="text-xl font-semibold text-[var(--jy-text-primary)] mb-4"
                style={{ fontFamily: 'var(--jy-font-display)' }}
              >
                🔍 根源剖析
              </h3>
              <QuickSummary bullets={[data.root.quickSummary]} />
              <div className="mt-4 space-y-2">
                {data.root.body.map((p, i) => (
                  <p key={i} className="text-[var(--jy-text-secondary)] leading-relaxed">{p}</p>
                ))}
              </div>
            </Card>
            {/* Caveats */}
            {data.caveats.length > 0 && (
              <Card className="p-8" interactive={false}>
                <h3 className="text-xl font-semibold text-[var(--jy-text-primary)] mb-4">⚠ 需要注意的地方({data.caveats.length} 條)</h3>
                <ul className="space-y-4">
                  {data.caveats.map((c, i) => (
                    <li key={i} className="border-l-4 pl-4 py-2" style={{ borderLeftColor: 'var(--jy-semantic-balance)' }}>
                      <h4 className="font-medium text-[var(--jy-semantic-balance)]">{c.title}</h4>
                      <p className="mt-1 text-sm text-[var(--jy-text-secondary)]">{c.bond}</p>
                      <p className="mt-2 text-xs text-[var(--jy-text-tertiary)]"><span className="text-[var(--jy-text-muted)]">補救:</span> {c.remedy}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* 合篇 - way + goods + improvements(Codex P1 修、v5.10.217) */}
        <section className="mb-12">
          <Eyebrow align="left">✦ 合篇:你的路 + 好的地方 + 改善建議</Eyebrow>
          <div className="mt-8 space-y-6">
            {/* Way */}
            <Card className="p-8" interactive={false}>
              <h3 className="text-xl font-semibold text-[var(--jy-text-primary)] mb-4" style={{ fontFamily: 'var(--jy-font-display)' }}>
                🛤 你的路 — 怎麼走出來
              </h3>
              <QuickSummary bullets={[data.way.quickSummary]} />
              <div className="mt-4 space-y-2">
                {data.way.body.map((p, i) => (
                  <p key={i} className="text-[var(--jy-text-secondary)] leading-relaxed">{p}</p>
                ))}
              </div>
            </Card>
            {/* Goods */}
            {data.goods.length > 0 && (
              <Card className="p-8" interactive={false}>
                <h3 className="text-xl font-semibold text-[var(--jy-semantic-flow)] mb-4">✦ 你好的地方({data.goods.length} 條)</h3>
                <ul className="space-y-4">
                  {data.goods.map((g, i) => (
                    <li key={i}>
                      <h4 className="font-medium text-[var(--jy-text-gold)]">{g.title}</h4>
                      <p className="mt-1 text-xs text-[var(--jy-text-tertiary)]">支持系統:{g.support}</p>
                      <p className="mt-2 text-sm text-[var(--jy-text-secondary)]"><span className="text-[var(--jy-text-muted)]">善用方式:</span> {g.howToUse}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {/* Improvements */}
            {data.improvements.length > 0 && (
              <Card className="p-8" interactive={false}>
                <h3 className="text-xl font-semibold text-[var(--jy-text-primary)] mb-4">✿ 改善建議({data.improvements.length} 條)</h3>
                <ul className="space-y-6">
                  {data.improvements.map((imp, i) => (
                    <li key={i} className="border-l-4 pl-4 py-2" style={{ borderLeftColor: 'var(--jy-text-gold)' }}>
                      <h4 className="font-semibold text-[var(--jy-text-gold)]">{imp.title}</h4>
                      <p className="mt-2 text-sm text-[var(--jy-text-tertiary)]">為什麼是你:{imp.whyYou}</p>
                      <ol className="mt-3 list-decimal pl-6 space-y-1 text-sm text-[var(--jy-text-secondary)]">
                        {imp.steps.map((s, j) => <li key={j}>{s}</li>)}
                      </ol>
                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <p className="text-[var(--jy-semantic-danger)]">不做會:{imp.ifNot}</p>
                        <p className="text-[var(--jy-semantic-flow)]">做了會:{imp.ifDo}</p>
                      </div>
                      <p className="mt-2 text-xs text-[var(--jy-text-muted)]">最佳時機:{imp.bestTime}</p>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* 寫給你的話 */}
        <section className="mb-12">
          <Card className="p-10" interactive={false}>
            <h3
              className="text-2xl font-semibold text-[var(--jy-text-gold)] mb-6 text-center"
              style={{ fontFamily: 'var(--jy-font-display)' }}
            >
              寫給{data.meta.name}的話
            </h3>
            <QuickSummary title="" bullets={data.letter.body} />
          </Card>
        </section>

        <GoldDivider className="my-12" />

        {/* FeedbackForm — Sprint 1 wire(v5.10.224) */}
        <section className="mb-12">
          <FeedbackForm reportId={data.meta.id} reportType="heart-doubts" />
        </section>

        <GoldDivider className="my-12" />

        {/* PDF download — v5.10.235 wire */}
        <section className="mb-12 flex justify-center">
          <PDFDownloadButton reportType="heart-doubts" reportId={data.meta.id} />
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

function SkeletonView({ id }: { id: string }) {
  return (
    <main className="min-h-screen text-[var(--jy-text-primary)]" style={{ background: 'var(--jy-bg-glow)', backgroundColor: 'var(--jy-bg-void)' }}>
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">
        <Eyebrow>HEART DOUBTS · 心之所惑</Eyebrow>
        <h1 className="mt-8 font-bold" style={{ fontFamily: 'var(--jy-font-display)', fontSize: 'clamp(48px, 6vw, 88px)', lineHeight: 1.05 }}>心之所惑</h1>
        <p className="mt-4 text-[var(--jy-text-tertiary)]">報告 ID:<span className="font-mono">{id}</span></p>
        <GoldDivider className="my-8" />
        <Card className="p-8">
          <p className="text-[var(--jy-text-secondary)]">⚠️ 找不到此 ID 對應的 demo 資料</p>
          <p className="mt-3 text-sm text-[var(--jy-text-tertiary)]">Sprint 1 demo 路徑:<code>/r/heart-doubts/he-xuan-yi</code></p>
        </Card>
      </div>
    </main>
  )
}
