// v5.10.212 — FamilyBlueprintReport(對齊 schema、用本 session 元件 + 5 年流年卡)
import { Eyebrow } from '@/components/ui/Eyebrow'
import { HeroBlock } from '@/components/report/shared/HeroBlock'
import { Card } from '@/components/ui/Card'
import { GoldDivider } from '@/components/effects/GoldDivider'
import { BaziPillars } from '@/components/report/shared/BaziPillars'
import { KeyTakeaway } from '@/components/report/shared/KeyTakeaway'
import { QuickSummary } from '@/components/report/shared/QuickSummary'
// v5.10.314 editorial(McKinsey + magazine pattern):結論先行
// v5.10.322 加 PullQuote 進「全家五行分佈」metaphor(magazine pull quote)
import { PullQuote, ExecutiveSummary } from '@/components/report/shared/DropCap'
// v5.10.319 序向動畫(Gemini #4 開箱儀式感、4 reports 統一)
import { Stagger, StaggerItem } from '@/components/effects/Stagger'
import { ChapterGroup, ChapterSection } from '@/components/report/shared/ChapterSection'
import { PracticeCard } from '@/components/report/shared/PracticeCard'
import { ReportSeal } from '@/components/report/shared/ReportSeal'
import { CrisisFooter } from '@/components/report/shared/CrisisFooter'
import { LuckyParams } from '@/components/report/shared/LuckyParams'
import { FeedbackForm } from '@/components/report/shared/FeedbackForm'
import { PDFDownloadButton } from '@/components/report/shared/PDFDownloadButton'
import { ReportToolbar } from '@/components/report/shared/ReportToolbar'
import { ScrollProgress } from '@/components/effects/ScrollProgress'
import { BackToTop } from '@/components/effects/BackToTop'
import type { FamilyBlueprintReport as FamilyData } from '@/types/report-schemas'

interface FamilyBlueprintReportProps {
  id: string
  data?: FamilyData
}

export function FamilyBlueprintReport({ id, data }: FamilyBlueprintReportProps) {
  if (!data) return <SkeletonView id={id} />

  return (
    <>
      <ScrollProgress />
      <ReportToolbar
        reportTitle={`家族藍圖 · ${data.meta.familyName}`}
        onDownloadPDF={() => { window.location.href = `/api/r/family-blueprint/${data.meta.id}/pdf` }}
      />
      <main className="min-h-screen text-[var(--jy-text-primary)] relative overflow-hidden" style={{ background: 'var(--jy-bg-glow)', backgroundColor: 'var(--jy-bg-void)' }}>
        <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8 relative z-10">

        {/* v5.10.319 序向動畫(Gemini 開箱儀式感)*/}
        <Stagger>
        <StaggerItem>
        {/* HERO 家族圈 — v5.10.258 wire dead component #4:HeroBlock family variant
            原 inline hero 跟 HeroBlock 內邏輯一致(同設計師輸出)、改用 HeroBlock 是 DRY 重構 */}
        <HeroBlock
          variant="family"
          eyebrow="FAMILY BLUEPRINT · 家族藍圖"
          familyName={data.meta.familyName}
          members={data.members.map((m) => ({ role: m.role, name: m.name, dayMaster: m.bazi.dayMaster }))}
          durations={{ short: data.meta.durationShort, full: data.meta.durationFull }}
        />

        <GoldDivider className="my-12" />

        {/* v5.10.314 ExecutiveSummary「一分鐘看懂」(G15 報告結論先行) */}
        <ExecutiveSummary
          title="一分鐘看懂"
          bullets={[
            `家族成員:${data.members.length} 人合盤(${data.members.map((m) => m.name).join(' / ')})`,
            data.fiveElementsDistribution?.keyFinding
              ? `關鍵發現:${data.fiveElementsDistribution.keyFinding.slice(0, 60)}${data.fiveElementsDistribution.keyFinding.length > 60 ? '…' : ''}`
              : '五行分佈已完成跨代分析',
            data.triangleDynamics?.dangerousMode
              ? `三角動力:${data.triangleDynamics.dangerousMode.slice(0, 60)}${data.triangleDynamics.dangerousMode.length > 60 ? '…' : ''}`
              : '家族系統動力已解析',
          ]}
        />

        {/* 五行分佈對比 */}
        <section className="mb-12">
          <Eyebrow align="left">全家五行分佈</Eyebrow>
          <div className="mt-8 space-y-6">
            {/* v5.10.322 metaphor 改 PullQuote(magazine pattern、家族五行詩意一句拉到 hero 級) */}
            <PullQuote attribution="家 族 五 行 整 合 視 角">
              {data.fiveElementsDistribution.metaphor}
            </PullQuote>

            <Card className="p-8" interactive="subtle">
              <p className="hidden">
                {data.fiveElementsDistribution.metaphor}
              </p>
              <KeyTakeaway title="關鍵發現">
                {data.fiveElementsDistribution.keyFinding}
              </KeyTakeaway>
            </Card>

            {/* 三人五行表 */}
            <Card className="p-6" interactive="subtle">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--jy-border-soft)]">
                    <th className="text-left py-3 px-2 text-[var(--jy-text-muted)] uppercase text-xs">成員</th>
                    {(['木', '火', '土', '金', '水'] as const).map((el) => (
                      <th key={el} className="text-center py-3 px-2 text-[var(--jy-text-gold)]">{el}</th>
                    ))}
                    <th className="text-left py-3 px-2 text-[var(--jy-text-muted)] uppercase text-xs">日主</th>
                  </tr>
                </thead>
                <tbody>
                  {data.fiveElementsDistribution.chartData.map((row) => (
                    <tr key={row.member} className="border-b border-[var(--jy-border-hairline)] last:border-0">
                      <td className="py-3 px-2 text-[var(--jy-text-primary)]" style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif' }}>{row.member}</td>
                      {(['木', '火', '土', '金', '水'] as const).map((el) => {
                        // v5.10.318 editorial:加 inline mini-bar(QA agent finding 數字無柱狀化)
                        const ELEMENT_COLOR: Record<string, string> = { 木: '#6ab04c', 火: '#e74c3c', 土: '#c9a84c', 金: '#bdc3c7', 水: '#3498db' }
                        const val = row.values[el]
                        const widthPct = Math.min(100, val * 18) // max 5 → 90%
                        return (
                          <td key={el} className="text-center py-3 px-2 tabular-nums relative" style={{
                            color: val >= 3 ? 'var(--jy-text-gold)' : (val === 0 ? 'var(--jy-semantic-danger)' : 'var(--jy-text-secondary)'),
                            fontWeight: val >= 3 ? 600 : 400,
                            fontFamily: 'var(--jy-font-mono), monospace',
                          }}>
                            <div className="flex flex-col items-center gap-1">
                              <span>{val}</span>
                              {val > 0 && (
                                <span
                                  className="block h-0.5 max-w-[60%]"
                                  style={{ width: `${widthPct}%`, background: ELEMENT_COLOR[el], opacity: 0.6 }}
                                  aria-hidden
                                />
                              )}
                            </div>
                          </td>
                        )
                      })}
                      <td className="py-3 px-2 text-[var(--jy-text-secondary)] font-medium" style={{ fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif' }}>{row.dayMaster}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* 三人八字 */}
        <section className="mb-12">
          <Eyebrow align="left">各成員八字</Eyebrow>
          <div className="mt-8 space-y-6">
            {data.members.map((m) => (
              <div key={m.name}>
                <h3 className="text-lg font-medium text-[var(--jy-text-primary)] mb-3">
                  {m.role} · {m.name}
                </h3>
                <BaziPillars data={m.bazi} highlightDayMaster />
              </div>
            ))}
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* 三角動力圖 */}
        {data.triangleDynamics && (
          <section className="mb-12">
            <Eyebrow align="left">三角動力</Eyebrow>
            <Card className="mt-8 p-8" interactive="subtle">
              <ul className="space-y-2 mb-6">
                {data.triangleDynamics.edges.map((e, i) => (
                  <li key={i} className="text-[var(--jy-text-secondary)]">
                    <span className="text-[var(--jy-text-gold)]">{e.from} → {e.to}</span>
                    {' :: '}{e.energy}
                  </li>
                ))}
              </ul>
              <KeyTakeaway title="最危險的循環">
                {data.triangleDynamics.dangerousMode}
              </KeyTakeaway>
              <div className="mt-4">
                <h4 className="font-medium text-[var(--jy-text-gold)] mb-2">打破三角的 3 個方法</h4>
                <ol className="list-decimal pl-6 space-y-1.5 text-[var(--jy-text-secondary)]">
                  {data.triangleDynamics.breakingTriangle.map((b, i) => (
                    <li key={i}>{b}</li>
                  ))}
                </ol>
              </div>
            </Card>
          </section>
        )}

        {/* 對偶分析(摺疊) */}
        <section className="mb-12">
          <Eyebrow align="left">三組對偶分析</Eyebrow>
          <div className="mt-8">
            <ChapterGroup type="multiple">
              {Object.entries(data.pairAnalysis).map(([key, pair]) => {
                if (!pair) return null
                return (
                  <ChapterSection key={key} emoji="" title={pair.pair}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <PairItem label="八字合盤" verdict={pair.baziSynastry.verdict} text={pair.baziSynastry.summary} />
                      <PairItem label="紫微互參" verdict={pair.ziweiInterplay.verdict} text={pair.ziweiInterplay.summary} />
                      <PairItem label="生肖" verdict={pair.zodiacInteraction.verdict} text={pair.zodiacInteraction.relation} />
                      <PairItem label="生命靈數" verdict={pair.numerologyInteraction.verdict} text={pair.numerologyInteraction.summary} />
                    </div>
                    <div>
                      <h5 className="font-medium text-[var(--jy-text-gold)] mb-2">→ 相處指南</h5>
                      <ul className="space-y-1.5 text-sm text-[var(--jy-text-secondary)]">
                        {pair.guidance.map((g, i) => <li key={i}>· {g}</li>)}
                      </ul>
                    </div>
                  </ChapterSection>
                )
              })}
            </ChapterGroup>
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* goods + cautions + communicationModel + parenting(Codex P1 修、v5.10.219) */}
        {data.goods.length > 0 && (
          <section className="mb-12">
            <Eyebrow align="left">家族好的地方({data.goods.length} 條)</Eyebrow>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {data.goods.map((g, i) => (
                <Card key={i} className="p-5" interactive="subtle">
                  <div className="text-2xl mb-2" aria-hidden>{g.element}</div>
                  <h4 className="font-semibold text-[var(--jy-semantic-flow)]">{g.title}</h4>
                  <p className="mt-2 text-sm text-[var(--jy-text-secondary)]">{g.content}</p>
                  <p className="mt-2 text-xs text-[var(--jy-text-tertiary)]">善用:{g.howToUse}</p>
                </Card>
              ))}
            </div>
          </section>
        )}

        {data.cautions.length > 0 && (
          <section className="mb-12">
            <Eyebrow align="left">⚠ 家族需要注意的地方({data.cautions.length} 條)</Eyebrow>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {data.cautions.map((c, i) => (
                <Card key={i} className="p-5 border-l-4" style={{ borderLeftColor: 'var(--jy-semantic-balance)' }} interactive="subtle">
                  <h4 className="font-semibold text-[var(--jy-semantic-balance)]">⚠ {c.title}</h4>
                  <p className="mt-2 text-sm text-[var(--jy-text-secondary)]">{c.detail}</p>
                  <p className="mt-2 text-xs text-[var(--jy-text-gold)]">應對:{c.response}</p>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="mb-12">
          <Eyebrow align="left">💬 家族溝通模式</Eyebrow>
          <Card className="mt-8 p-8" interactive="subtle">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mb-6">
              <RoleChip label="決策者" name={data.communicationModel.roles.decisionMaker} />
              <RoleChip label="協調者" name={data.communicationModel.roles.coordinator} />
              <RoleChip label="執行者" name={data.communicationModel.roles.executor} />
              <RoleChip label="情緒穩定" name={data.communicationModel.roles.emotionStabilizer} />
            </div>
            <div className="border-t border-[var(--jy-border-hairline)] pt-4">
              <h4 className="font-medium text-[var(--jy-text-gold)] mb-2">情緒傳導鏈</h4>
              <p className="text-[var(--jy-text-secondary)] text-sm">
                {data.communicationModel.emotionChain.map(e => `${e.from} → ${e.to}`).join(' → ')}
              </p>
              <KeyTakeaway title="切斷點" className="mt-4">{data.communicationModel.cutPoint}</KeyTakeaway>
            </div>
          </Card>
        </section>

        <section className="mb-12">
          <Eyebrow align="left">親子教養方向</Eyebrow>
          <Card className="mt-8 p-8" interactive="subtle">
            <p className="italic text-[var(--jy-text-gold)] text-lg leading-relaxed mb-6">
              「{data.parenting.childTalent}」
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 mb-6">
              <Card className="p-5" interactive="subtle">
                <h4 className="font-medium text-[var(--jy-semantic-water)] mb-2">父適合當什麼</h4>
                <p className="text-sm text-[var(--jy-text-secondary)]">{data.parenting.fatherRole}</p>
              </Card>
              <Card className="p-5" interactive="subtle">
                <h4 className="font-medium text-[var(--jy-semantic-fire)] mb-2">母適合當什麼</h4>
                <p className="text-sm text-[var(--jy-text-secondary)]">{data.parenting.motherRole}</p>
              </Card>
            </div>
            <div>
              <h4 className="font-medium text-[var(--jy-text-gold)] mb-3">親子衝突預防(各階段)</h4>
              <ul className="space-y-2">
                {data.parenting.conflictPrevention.map((cp, i) => (
                  <li key={i} className="flex items-start gap-3 text-sm">
                    <span className="flex-shrink-0 inline-flex h-6 px-2 items-center rounded text-xs" style={{ backgroundColor: 'rgba(229,185,92,0.15)', color: 'var(--jy-text-gold)' }}>
                      {cp.ageRange}
                    </span>
                    <span className="text-[var(--jy-text-secondary)]">{cp.warning}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </section>

        <GoldDivider className="my-12" />

        {/* 5 年流年 */}
        <section className="mb-12">
          <Eyebrow align="left">家族 5 年流年</Eyebrow>
          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
            {data.yearly5.map((y) => (
              <Card key={y.year} className="p-5" interactive="subtle">
                <div className="text-center mb-3">
                  <div className="text-2xl mb-1" aria-hidden>{y.icon}</div>
                  <h4 className="text-xl font-bold text-[var(--jy-text-gold)]" style={{ fontFamily: 'var(--jy-font-display)' }}>
                    {y.year}
                  </h4>
                  <p className="text-xs text-[var(--jy-text-tertiary)]">{y.ganzhi}</p>
                  <p className="text-sm text-[var(--jy-text-secondary)] mt-1">{y.nickname}</p>
                </div>
                <p className="text-xs text-[var(--jy-text-secondary)] mb-3">{y.overallEnergy}</p>
                {/* v5.10.299 editorial:rounded-full pill → hairline serif keyword(QA L5 finding 跨 G15 補) */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
                  {y.keywords.map((kw) => (
                    <span key={kw} className="inline-flex items-center text-[11px] border-l pl-2"
                      style={{ borderLeftColor: 'var(--jy-text-gold)', color: 'var(--jy-text-gold)', fontFamily: 'var(--jy-font-serif, "Noto Serif TC"), serif' }}>
                      {kw}
                    </span>
                  ))}
                </div>
                <div className="space-y-1 text-[10px] text-[var(--jy-text-tertiary)]">
                  <p>最佳月:{y.keyMonths.best.join('、')}</p>
                  <p>最差月:{y.keyMonths.worst.join('、')}</p>
                </div>
              </Card>
            ))}
          </div>
          <Card className="mt-6 p-6" interactive="subtle">
            <h4 className="font-medium text-[var(--jy-text-gold)] mb-3">5 年總覽</h4>
            <ul className="space-y-1.5 text-sm text-[var(--jy-text-secondary)]">
              <li>黃金年:{data.fiveYearOverview.goldenYear}</li>
              <li>修整年:{data.fiveYearOverview.repairYear}</li>
              <li>重大決策窗口:{data.fiveYearOverview.decisionWindows.join(' / ')}</li>
              <li>⚠ 最大挑戰:{data.fiveYearOverview.biggestChallenge}</li>
            </ul>
          </Card>
        </section>

        <GoldDivider className="my-12" />

        {/* 改善處方箋 8 條 */}
        <section className="mb-12">
          <Eyebrow align="left">改善建議——家族處方箋({data.prescriptions.length} 條)</Eyebrow>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
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

        {/* 行動指南 + 幸運元素 */}
        <section className="mb-12">
          <Eyebrow align="left">家族行動指南 + 幸運元素</Eyebrow>
          <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
            <Card className="p-5" interactive="subtle">
              <h4 className="font-medium text-[var(--jy-semantic-flow)] mb-3">每日</h4>
              <ul className="space-y-1.5 text-sm text-[var(--jy-text-secondary)]">
                {data.actionGuide.daily.map((a, i) => <li key={i}>· {a}</li>)}
              </ul>
            </Card>
            <Card className="p-5" interactive="subtle">
              <h4 className="font-medium text-[var(--jy-semantic-balance)] mb-3">每月</h4>
              <ul className="space-y-1.5 text-sm text-[var(--jy-text-secondary)]">
                {data.actionGuide.monthly.map((a, i) => <li key={i}>· {a}</li>)}
              </ul>
            </Card>
            <Card className="p-5" interactive="subtle">
              <h4 className="font-medium text-[var(--jy-text-gold)] mb-3">每年</h4>
              <ul className="space-y-1.5 text-sm text-[var(--jy-text-secondary)]">
                {data.actionGuide.yearly.map((a, i) => <li key={i}>· {a}</li>)}
              </ul>
            </Card>
          </div>
          <div className="mt-6">
            <LuckyParams data={{
              colors: [data.actionGuide.luckyElements.commonColor, data.actionGuide.luckyElements.assistColor],
              numbers: data.actionGuide.luckyElements.numbers,
              directions: [data.actionGuide.luckyElements.direction],
              hours: [],
              plants: [],
              avoid: [],
              talents: data.actionGuide.luckyElements.activities,
            }} />
          </div>
        </section>

        <GoldDivider className="my-12" />

        {/* 寫給家的話 */}
        <section className="mb-12">
          <Card className="p-10" interactive="subtle">
            <h3
              className="text-2xl font-semibold text-[var(--jy-text-gold)] mb-6 text-center"
              style={{ fontFamily: 'var(--jy-font-display)' }}
            >
              寫給{data.meta.familyName}的話
            </h3>
            <p className="text-lg text-[var(--jy-text-gold)] italic text-center mb-6">
              {data.letter.quickSummary}
            </p>
            <QuickSummary title="" bullets={data.letter.body} />
          </Card>
        </section>

        <GoldDivider className="my-12" />

        {/* FeedbackForm — Sprint 1 wire(v5.10.224) */}
        <section className="mb-12">
          <FeedbackForm reportId={data.meta.id} reportType="family-blueprint" />
        </section>

        <GoldDivider className="my-12" />

        {/* PDF download — v5.10.235 wire */}
        <section className="mb-12 flex justify-center">
          <PDFDownloadButton reportType="family-blueprint" reportId={data.meta.id} />
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

        </StaggerItem>
        </Stagger>
        </div>
        <BackToTop />
      </main>
    </>
  )
}

function RoleChip({ label, name }: { label: string; name: string }) {
  return (
    <div className="text-center rounded-lg p-3 bg-[var(--jy-bg-card)]/40 border border-[var(--jy-border-hairline)]">
      <p className="text-xs uppercase tracking-wider text-[var(--jy-text-muted)]">{label}</p>
      <p className="mt-1 font-semibold text-[var(--jy-text-gold)]">{name}</p>
    </div>
  )
}

function PairItem({ label, verdict, text }: { label: string; verdict: string; text: string }) {
  const VERDICT_COLOR: Record<string, string> = {
    '合': 'var(--jy-semantic-flow)',
    '需磨合': 'var(--jy-semantic-balance)',
    '不合': 'var(--jy-semantic-danger)',
  }
  const color = VERDICT_COLOR[verdict] || 'var(--jy-text-secondary)'
  return (
    <div className="rounded-lg p-3 bg-[var(--jy-bg-card)]/40 border border-[var(--jy-border-hairline)]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs uppercase tracking-wider text-[var(--jy-text-muted)]">{label}</span>
        <span className="text-xs font-medium" style={{ color }}>{verdict}</span>
      </div>
      <p className="text-sm text-[var(--jy-text-secondary)]">{text}</p>
    </div>
  )
}

function SkeletonView({ id }: { id: string }) {
  return (
    <main className="min-h-screen text-[var(--jy-text-primary)]" style={{ background: 'var(--jy-bg-glow)', backgroundColor: 'var(--jy-bg-void)' }}>
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">
        <Eyebrow>FAMILY BLUEPRINT · 家族藍圖</Eyebrow>
        <h1 className="mt-8 font-bold" style={{ fontFamily: 'var(--jy-font-display)', fontSize: 'clamp(48px, 6vw, 88px)', lineHeight: 1.05 }}>家族藍圖</h1>
        <p className="mt-4 text-[var(--jy-text-tertiary)]">報告 ID:<span className="font-mono">{id}</span></p>
        <GoldDivider className="my-8" />
        <Card className="p-8">
          <p className="text-[var(--jy-text-secondary)]">找不到此 ID 對應的 demo 資料</p>
          <p className="mt-3 text-sm text-[var(--jy-text-tertiary)]">Sprint 1 demo 路徑:<code>/r/family-blueprint/he-jia</code></p>
        </Card>
      </div>
    </main>
  )
}
