'use client'
// A/B 測試 React 組件
// 2026-04-17 | 網頁製作部門
//
// 兩種用法：
// (1) <Experiment experimentKey="xxx" variants={...}>{(ctx) => ...}</Experiment>
//     — render-prop 式，最靈活
// (2) <ABVariant experimentKey="xxx" variantKey="A">...</ABVariant>
//     — 宣告式，適合整段 JSX 在不同 variant 之間切換
//
// 兩者都自動 fire impression 事件，呼叫 ctx.track('click'/'conversion') 即可追蹤

import React, { ReactNode } from 'react'
import { useABTest, ABVariantDef, ABEventType } from '@/lib/ab-test'

export interface ExperimentContext {
  variant: string
  visitorId: string
  ready: boolean
  track: (eventType: ABEventType, opts?: { value?: number; metadata?: Record<string, unknown> }) => void
}

export interface ExperimentProps {
  experimentKey: string
  variants: ABVariantDef[]
  /** render-prop children */
  children: (ctx: ExperimentContext) => ReactNode
  /** SSR fallback：ready 之前顯示的內容（建議放 variant A 的版本） */
  fallback?: ReactNode
  /** 是否自動發 impression（預設 true） */
  autoImpression?: boolean
}

/**
 * render-prop 式實驗組件
 * 範例：
 *   <Experiment
 *     experimentKey="hero_cta_20260417"
 *     variants={[{key:'A',weight:50},{key:'B',weight:50}]}
 *   >
 *     {({ variant, track }) => (
 *       <button onClick={() => track('click')}>
 *         {variant === 'A' ? '立即解鎖你的人生藍圖' : '3 分鐘看懂你的命盤'}
 *       </button>
 *     )}
 *   </Experiment>
 */
export function Experiment({
  experimentKey,
  variants,
  children,
  fallback = null,
  autoImpression = true,
}: ExperimentProps) {
  const { variant, visitorId, ready, track } = useABTest(experimentKey, variants, { autoImpression })

  if (!ready) return <>{fallback}</>
  return <>{children({ variant, visitorId, ready, track })}</>
}

/**
 * 宣告式 variant wrapper
 * 範例：
 *   <ABVariant experimentKey="pricing_c_20260417" variantKey="A">
 *     <PriceTag amount={89} />
 *   </ABVariant>
 *   <ABVariant experimentKey="pricing_c_20260417" variantKey="B">
 *     <PriceTag amount={99} />
 *   </ABVariant>
 *
 * 注意：需要搭配 <ABVariantProvider> 使用以避免重複分配
 */
export interface ABVariantProps {
  experimentKey: string
  variants: ABVariantDef[]
  variantKey: string
  children: ReactNode
}

export function ABVariant({ experimentKey, variants, variantKey, children }: ABVariantProps) {
  const { variant, ready } = useABTest(experimentKey, variants, { autoImpression: true })
  if (!ready) return null
  if (variant !== variantKey) return null
  return <>{children}</>
}

/**
 * 便捷：兩個 variant 的 A/B（只需傳入兩段 JSX，不用寫 render-prop）
 * 範例：
 *   <SimpleABTest
 *     experimentKey="hero_cta_20260417"
 *     a={<button>原版 CTA</button>}
 *     b={<button>新版 CTA</button>}
 *   />
 */
export interface SimpleABTestProps {
  experimentKey: string
  a: ReactNode
  b: ReactNode
  weightA?: number
  weightB?: number
  fallback?: ReactNode
}

export function SimpleABTest({ experimentKey, a, b, weightA = 50, weightB = 50, fallback }: SimpleABTestProps) {
  const variants: ABVariantDef[] = [
    { key: 'A', weight: weightA },
    { key: 'B', weight: weightB },
  ]
  return (
    <Experiment experimentKey={experimentKey} variants={variants} fallback={fallback ?? a}>
      {({ variant }) => <>{variant === 'A' ? a : b}</>}
    </Experiment>
  )
}
