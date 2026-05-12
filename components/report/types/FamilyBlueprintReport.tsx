// v5.10.201 Sprint 1 — FamilyBlueprintReport skeleton(家族藍圖)
// Schema 對應:tasks/unified_spec_2026-05-13_jianyuan_reports_incremental.md type='family-blueprint'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Card } from '@/components/ui/Card'
import { GoldDivider } from '@/components/effects/GoldDivider'

interface FamilyBlueprintReportProps {
  id: string
}

export function FamilyBlueprintReport({ id }: FamilyBlueprintReportProps) {
  return (
    <main
      className="min-h-screen text-[var(--jy-text-primary)]"
      style={{ background: 'var(--jy-bg-glow)', backgroundColor: 'var(--jy-bg-void)' }}
    >
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">
        <Eyebrow>FAMILY BLUEPRINT · 家族藍圖</Eyebrow>

        <h1
          className="mt-8 font-bold text-[var(--jy-text-primary)]"
          style={{
            fontFamily: 'var(--jy-font-display)',
            fontSize: 'clamp(48px, 6vw, 88px)',
            lineHeight: 1.05,
            letterSpacing: '-0.04em',
          }}
        >
          家族藍圖
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
            <li>HERO 家族圈(<code>family</code> variant、三人剪影 + 中央連結光線)</li>
            <li>家族五行分佈對比(三人並排雷達圖 + 「廚房比喻」金色框)</li>
            <li>父 × 母 / 母 × 子 / 父 × 子 對偶分析(八字合盤 + 紫微互參 + 生肖 + 數字)</li>
            <li>★ 三角動力圖(SVG 三角 + 沿邊運動粒子、點擊高亮配對)</li>
            <li>家族溝通模式(情緒傳導鏈 SVG)+ 親子教養方向</li>
            <li>家族 5 年流年(2026 烈火 🔥 / 2027 餘溫 / 2028 穩定 🪙 / 2029 收成 / 2030 重整)</li>
            <li>改善建議 8 條(水源保護 / 爸爸減壓 / 教養對齊 / ...)</li>
            <li>家族行動指南(每日 / 每月 / 每年)+ family letter</li>
          </ul>
        </Card>
      </div>
    </main>
  )
}
