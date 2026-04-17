'use client'
// 示範實驗：首頁 Hero CTA 文案 A/B 測試
// 2026-04-17 | 網頁製作部門
// experiment key: hero_cta_20260417
//
// A (原版): 立即免費體驗 · 30 秒出結果
// B (新版): 3 分鐘看懂你的命盤
//
// 追蹤事件：
// - impression: 自動（user 看到 CTA）
// - click: 點擊 CTA 時
// （conversion 事件在結帳成功頁由 Stripe webhook 或前端呼叫 /api/ab-events 補記）

import { Experiment } from '@/components/ABTest'

const VARIANTS = [
  { key: 'A', label: '立即免費體驗 · 30 秒出結果', weight: 50 },
  { key: 'B', label: '3 分鐘看懂你的命盤', weight: 50 },
]

export default function HeroCTAExperiment() {
  return (
    <Experiment
      experimentKey="hero_cta_20260417"
      variants={VARIANTS}
      fallback={
        // SSR / ready 前 fallback 顯示 A（避免閃爍）
        <DefaultCTA />
      }
    >
      {({ variant, track }) => (
        <a
          href="/tools/bazi"
          onClick={() => track('click', { metadata: { placement: 'hero' } })}
          className="inline-flex items-center gap-2 px-8 py-3.5 bg-gold text-dark font-bold rounded-[10px] text-[15px] btn-glow"
          data-ab-variant={variant}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          {variant === 'A' ? '免費體驗 · 30 秒出結果' : '3 分鐘看懂你的命盤'}
        </a>
      )}
    </Experiment>
  )
}

function DefaultCTA() {
  return (
    <a
      href="/tools/bazi"
      className="inline-flex items-center gap-2 px-8 py-3.5 bg-gold text-dark font-bold rounded-[10px] text-[15px] btn-glow"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
      免費體驗 · 30 秒出結果
    </a>
  )
}
