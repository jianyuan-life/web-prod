// v5.10.229 — Confetti 慶祝動畫(Jamie pnpm 規格 canvas-confetti、用於 FeedbackForm submit / report unlock 等)
//
// helper hook + button、prefers-reduced-motion 自動 disable
'use client'

import confetti from 'canvas-confetti'
import { useCallback } from 'react'

export interface ConfettiOptions {
  particleCount?: number // default 100
  spread?: number // default 70
  startVelocity?: number // default 30
  gravity?: number // default 1
  origin?: { x?: number; y?: number } // default { y: 0.6 }
  colors?: string[] // default 金色系
}

const DEFAULT_COLORS = ['#FFF8E5', '#FCEEC0', '#E5B95C', '#D4A04A', '#B8842F']

/**
 * useConfetti - hook、回 fire() function
 *
 * 用法:
 *   const fire = useConfetti()
 *   <button onClick={() => fire()}>Click</button>
 */
export function useConfetti(defaultOptions: ConfettiOptions = {}) {
  return useCallback(
    (options: ConfettiOptions = {}) => {
      // prefers-reduced-motion 自動 disable
      if (typeof window !== 'undefined') {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        if (mq.matches) return
      }

      const merged = {
        particleCount: options.particleCount ?? defaultOptions.particleCount ?? 100,
        spread: options.spread ?? defaultOptions.spread ?? 70,
        startVelocity: options.startVelocity ?? defaultOptions.startVelocity ?? 30,
        gravity: options.gravity ?? defaultOptions.gravity ?? 1,
        origin: options.origin ?? defaultOptions.origin ?? { y: 0.6 },
        colors: options.colors ?? defaultOptions.colors ?? DEFAULT_COLORS,
      }

      void confetti(merged)
    },
    [defaultOptions],
  )
}

/**
 * fireConfetti - 一次性 fire(不需 hook、純 utility function)
 */
export function fireConfetti(options: ConfettiOptions = {}) {
  if (typeof window !== 'undefined') {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) return
  }

  void confetti({
    particleCount: options.particleCount ?? 100,
    spread: options.spread ?? 70,
    startVelocity: options.startVelocity ?? 30,
    gravity: options.gravity ?? 1,
    origin: options.origin ?? { y: 0.6 },
    colors: options.colors ?? DEFAULT_COLORS,
  })
}

/**
 * fireGoldShower - 預設金色雨(從天落下、報告 unlock / 付款成功用)
 */
export function fireGoldShower() {
  if (typeof window !== 'undefined') {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches) return
  }

  // 三波金色雨、間隔 200ms
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      void confetti({
        particleCount: 60,
        spread: 100,
        startVelocity: 40,
        gravity: 1.2,
        origin: { x: Math.random() * 0.8 + 0.1, y: -0.1 },
        colors: DEFAULT_COLORS,
      })
    }, i * 200)
  }
}
