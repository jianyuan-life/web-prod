// v5.10.210 Sprint 1 — HeartDoubtsReport(對齊 schema、用 ScoreCircle / EvidenceList / 整合 wave 1+2 元件)
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Card } from '@/components/ui/Card'
import { GoldDivider } from '@/components/effects/GoldDivider'
import { ScoreCircle } from '@/components/report/shared/ScoreCircle'
import { BaziPillars } from '@/components/report/shared/BaziPillars'
import { EvidenceList } from '@/components/report/shared/EvidenceList'
import { KeyTakeaway } from '@/components/report/shared/KeyTakeaway'
import { QuickSummary } from '@/components/report/shared/QuickSummary'
import { ChapterGroup, ChapterSection } from '@/components/report/shared/ChapterSection'
import { MonthlyDecisionTable } from '@/components/report/shared/MonthlyDecisionTable'
import { PracticeCard } from '@/components/report/shared/PracticeCard'
import { ReportSeal } from '@/components/report/shared/ReportSeal'
import { CrisisFooter } from '@/components/report/shared/CrisisFooter'
import type { HeartDoubtsReport as HeartDoubtsData } from '@/types/report-schemas'

interface HeartDoubtsReportProps {
  id: string
  data?: HeartDoubtsData
}

export function HeartDoubtsReport({ id, data }: HeartDoubtsReportProps) {
  if (!data) return <SkeletonView id={id} />

  return (
    <main
      className="min-h-screen text-[var(--jy-text-primary)]"
      style={{ background: 'var(--jy-bg-glow)', backgroundColor: 'var(--jy-bg-void)' }}
    >
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">

        {/* HERO 評分卡 */}
        <section className="mb-16 grid grid-cols-1 gap-12 lg:grid-cols-2 items-center">
          <div className="flex flex-col items-center lg:items-start">
            <Eyebrow>HEART DOUBTS · 心之所惑</Eyebrow>
            <h1
              className="mt-6 font-bold"
              style={{
                fontFamily: 'var(--jy-font-display)',
                fontSize: 'clamp(48px, 6vw, 88px)',
                lineHeight: 1.05,
                letterSpacing: '-0.04em',
                background: 'var(--jy-gold-shimmer)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {data.meta.name}
            </h1>
            <p className="mt-4 text-[var(--jy-text-tertiary)]">
              出生:<span className="text-[var(--jy-text-secondary)]">{new Date(data.meta.birthDate).toLocaleDateString('zh-TW')}</span>
            </p>
            <p className="mt-1 text-xs text-[var(--jy-text-muted)]">
              精華 {data.meta.durationShort} 分鐘 · 完整 {data.meta.durationFull} 分鐘
            </p>
          </div>

          {/* ScoreCircle 命格綜合評分 */}
          <div className="flex flex-col items-center">
            <ScoreCircle
              grade={data.score.grade}
              value={data.score.value}
              percentile={data.score.percentile}
              challengeLevel={data.score.challengeLevel}
              size={280}
            />
            <p className="mt-4 text-xs text-[var(--jy-text-muted)]">
              {data.score.systemsCount} 套系統交叉分析
            </p>
          </div>
        </section>

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
          <Eyebrow align="left">📜 命盤一覽</Eyebrow>
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
          <Eyebrow align="left">✨ 你的答案</Eyebrow>
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
          <Eyebrow align="left">📜 起承轉合</Eyebrow>
          <div className="mt-8">
            <ChapterGroup type="multiple">
              <ChapterSection emoji="✨" title="深入解析:命格怎麼看這件事">
                <QuickSummary bullets={[data.chapters.one_deep.quickSummary]} />
                {data.chapters.one_deep.body.map((p, i) => (
                  <p key={i} className="text-[var(--jy-text-secondary)] leading-relaxed">{p}</p>
                ))}
              </ChapterSection>

              <ChapterSection emoji="📜" title="命格與此事的直接關聯">
                <QuickSummary bullets={[data.chapters.bond.quickSummary]} />
                {data.chapters.bond.body.map((p, i) => (
                  <p key={i} className="text-[var(--jy-text-secondary)] leading-relaxed">{p}</p>
                ))}
              </ChapterSection>

              <ChapterSection emoji="🎯" title="今年的流年能量">
                <QuickSummary bullets={[data.chapters.flowYear.quickSummary]} />
                {data.chapters.flowYear.body.map((p, i) => (
                  <p key={i} className="text-[var(--jy-text-secondary)] leading-relaxed">{p}</p>
                ))}
              </ChapterSection>

              <ChapterSection emoji="⚡" title="最佳行動方案(短/中/長)">
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

              <ChapterSection emoji="📅" title="最佳時機表">
                <MonthlyDecisionTable rows={data.chapters.timing.map(t => ({
                  period: t.period,
                  action: t.action,
                  reason: t.reason,
                  note: t.note,
                  highlight: t.action.includes('行動') || t.action.includes('簽約'),
                }))} title="" />
              </ChapterSection>

              <ChapterSection emoji="⚡" title={`最大風險(${data.chapters.risks.length} 條)`}>
                <ul className="space-y-3">
                  {data.chapters.risks.map((r, i) => (
                    <li key={i}>
                      <h5 className="font-medium text-[var(--jy-semantic-danger)]">⚠ {r.title}</h5>
                      <p className="mt-1 text-sm text-[var(--jy-text-secondary)]">{r.detail}</p>
                    </li>
                  ))}
                </ul>
              </ChapterSection>

              <ChapterSection emoji="✿" title="刻意練習">
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
    </main>
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
          <p className="mt-3 text-sm text-[var(--jy-text-tertiary)]">Sprint 1 demo 路徑:<code>/report/heart-doubts/he-xuan-yi</code></p>
        </Card>
      </div>
    </main>
  )
}
