// v5.10.201 Sprint 1 — LifeBlueprintReport skeleton(人生藍圖)
// Schema 對應:tasks/unified_spec_2026-05-13_jianyuan_reports_incremental.md type='life-blueprint'
// Sprint 1 只放 skeleton + 路由通、實際內容 Sprint 2+ 漸進填
import { Eyebrow } from '@/components/ui/Eyebrow'
import { Card } from '@/components/ui/Card'
import { GoldDivider } from '@/components/effects/GoldDivider'

interface LifeBlueprintReportProps {
  id: string
  // TODO Sprint 2:data: LifeBlueprintReportData(從 paid_reports adapter 來)
}

export function LifeBlueprintReport({ id }: LifeBlueprintReportProps) {
  return (
    <main
      className="min-h-screen text-[var(--jy-text-primary)]"
      style={{
        background: 'var(--jy-bg-glow)',
        backgroundColor: 'var(--jy-bg-void)',
      }}
    >
      <div className="mx-auto max-w-[1280px] px-4 py-20 sm:px-6 lg:px-8">
        <Eyebrow>LIFE BLUEPRINT · 人生藍圖</Eyebrow>

        <h1
          className="mt-8 font-bold text-[var(--jy-text-primary)]"
          style={{
            fontFamily: 'var(--jy-font-display)',
            fontSize: 'clamp(48px, 6vw, 88px)',
            lineHeight: 1.05,
            letterSpacing: '-0.04em',
          }}
        >
          人生藍圖
        </h1>

        <p className="mt-4 text-[var(--jy-text-tertiary)]">
          報告 ID:<span className="font-mono">{id}</span>
        </p>

        <GoldDivider className="my-8" />

        <Card className="p-8">
          <p className="text-[var(--jy-text-secondary)]">
            ⚠️ Sprint 1 Skeleton — 路由通、Feature Flag 啟用、實際內容由 Sprint 2+ 漸進填入:
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-6 text-[var(--jy-text-secondary)]">
            <li>HERO 命格封號(<code>score</code> variant)+ 旋轉星盤 SVG</li>
            <li>2026 行動建議 3 卡(啟動 / 持續 / 整合)</li>
            <li>命格名片 5 件套(八字四柱 / 紫微命宮 / 天賦 / 課題)</li>
            <li>命格 3 層洞察(核心性格 / KPI 三軸 / 時間軸)</li>
            <li>14 系統共識矩陣(7×14、★ + 共識度)</li>
            <li>大運起伏時間軸(6-8 步)+ 12 月份能量柱</li>
            <li>起承轉合 16 章(✨📜🎯⚡✦✿)</li>
            <li>幸運參數 / 月份決策表 / 出門訣 CTA / 報告印章</li>
          </ul>
        </Card>
      </div>
    </main>
  )
}
