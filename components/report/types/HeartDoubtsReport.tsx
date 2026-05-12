// v5.10.201 Sprint 1 — HeartDoubtsReport skeleton(心之所惑)
// Schema 對應:tasks/unified_spec_2026-05-13_jianyuan_reports_incremental.md type='heart-doubts'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Card } from '@/components/ui/Card'
import { GoldDivider } from '@/components/effects/GoldDivider'

interface HeartDoubtsReportProps {
  id: string
}

export function HeartDoubtsReport({ id }: HeartDoubtsReportProps) {
  return (
    <main
      className="min-h-screen text-[var(--jy-text-primary)]"
      style={{ background: 'var(--jy-bg-glow)', backgroundColor: 'var(--jy-bg-void)' }}
    >
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">
        <Eyebrow>HEART DOUBTS · 心之所惑</Eyebrow>

        <h1
          className="mt-8 font-bold text-[var(--jy-text-primary)]"
          style={{
            fontFamily: 'var(--jy-font-display)',
            fontSize: 'clamp(48px, 6vw, 88px)',
            lineHeight: 1.05,
            letterSpacing: '-0.04em',
          }}
        >
          心之所惑
        </h1>

        <p className="mt-4 text-[var(--jy-text-tertiary)]">
          報告 ID:<span className="font-mono">{id}</span>
        </p>

        <GoldDivider className="my-8" />

        <Card className="p-8">
          <p className="text-[var(--jy-text-secondary)]">
            ⚠️ Sprint 1 Skeleton — Sprint 2+ 填:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-[var(--jy-text-secondary)]">
            <li>HERO 評分卡(<code>score</code> variant、ScoreCircle B+ 79/100、conic-gradient)</li>
            <li>15 系統 dots(5 顆並排、已用亮金 / 未用灰)</li>
            <li>四柱大字 + 五行 emoji + 十神 chip</li>
            <li>你的問題(灰底引言卡)</li>
            <li>命盤佐證 12 條(摺疊、system chip + finding)</li>
            <li>30 秒懶人包 4 卡(起 1 / 承 7 / 轉 2 / 合 4)</li>
            <li>起承轉合 14 章(問題 / 答案 / 深入解析 / 流年雷達 / 三階段時間軸 / 月份表 / 最大風險)</li>
            <li>刻意練習處方箋 / 寫給你的話 / 出門訣 CTA / 回饋 / 報告印章</li>
          </ul>
        </Card>
      </div>
    </main>
  )
}
