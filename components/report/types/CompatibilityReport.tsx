// v5.10.201 Sprint 1 — CompatibilityReport skeleton(合否?)
// Schema 對應:tasks/unified_spec_2026-05-13_jianyuan_reports_incremental.md type='compatibility'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Card } from '@/components/ui/Card'
import { GoldDivider } from '@/components/effects/GoldDivider'

interface CompatibilityReportProps {
  id: string
}

export function CompatibilityReport({ id }: CompatibilityReportProps) {
  return (
    <main
      className="min-h-screen text-[var(--jy-text-primary)]"
      style={{ background: 'var(--jy-bg-glow)', backgroundColor: 'var(--jy-bg-void)' }}
    >
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">
        <Eyebrow>COMPATIBILITY · 合否?</Eyebrow>

        <h1
          className="mt-8 font-bold text-[var(--jy-text-primary)]"
          style={{
            fontFamily: 'var(--jy-font-display)',
            fontSize: 'clamp(48px, 6vw, 88px)',
            lineHeight: 1.05,
            letterSpacing: '-0.04em',
          }}
        >
          合否?
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
            <li>HERO 雙人 × 判定徽章(<code>verdict</code> variant、⚡ 合但有雷區、amber gradient pulse)</li>
            <li>A 姓名 ✕ B 姓名(SVG path morphing、hover ✕ → ⚭)</li>
            <li>七大系統合盤(八字 / 紫微 / 西占 / 吠陀 / 人類圖 / 數字 / 易經 / 生肖)</li>
            <li>八字日干關係(七殺 / 偏財)+ 紫微互參(雙 12 宮並排 + 飛宮)</li>
            <li>西占 Synastry(雙星盤疊加 + 相位線)+ 吠陀 Kuta(Tara 8 格圈)</li>
            <li>人類圖配對(9 中心並排)+ 數字命理 + 易經兩卦並排 + 生肖六合/三合/相沖</li>
            <li>綜合判定:合 5 / 磨合 2 / 不合 0 三欄</li>
            <li>三年流年(2026 烈火 / 2027 餘溫 / 2028 穩定)</li>
            <li>改善建議 6 條(合夥憲法 / 月初校準 / 緊急 SOP / ...)+ 雙人 letter</li>
          </ul>
        </Card>
      </div>
    </main>
  )
}
