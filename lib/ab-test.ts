// A/B 測試核心分流 + 事件追蹤
// 2026-04-17 | 網頁製作部門
//
// 設計原則：
// 1. 不依賴付費 SaaS（LaunchDarkly/Split 等），全部自建
// 2. 同一 visitor_id + experiment_key 永遠落到同一 variant（一致性）
// 3. 分流演算法：FNV-1a hash → 對 variants weight 累計做 bucket assignment
// 4. Server-side（讀 cookie）+ Client-side（React hook）都能用
// 5. 事件追蹤用 POST /api/ab-events，客戶端 fire-and-forget

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'

// ============================================
// 型別
// ============================================
export interface ABVariantDef {
  key: string
  label?: string
  weight: number
}

export interface ABExperiment {
  key: string
  name?: string
  variants: ABVariantDef[]
  status?: 'active' | 'paused' | 'concluded'
  winner?: string | null
}

export type ABEventType = 'impression' | 'click' | 'conversion' | 'revenue'

export interface ABEventPayload {
  experimentKey: string
  variant: string
  visitorId: string
  eventType: ABEventType
  value?: number
  metadata?: Record<string, unknown>
}

// ============================================
// 常數
// ============================================
const VISITOR_COOKIE = 'ab_visitor_id'
const ASSIGNMENT_COOKIE_PREFIX = 'ab_v_'  // ab_v_{experimentKey}
const COOKIE_DAYS = 30

// ============================================
// Hash：FNV-1a（快、分佈均勻，且純 ASCII safe）
// ============================================
export function fnv1aHash(input: string): number {
  let hash = 0x811c9dc5 // 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    // 32-bit FNV prime multiplication（避免 JS 整數溢出用 Math.imul）
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0  // 轉成 unsigned 32-bit
}

// ============================================
// 分流：把 visitor_id + experiment_key hash 後落到 variant bucket
// ============================================
export function assignVariant(
  visitorId: string,
  experiment: ABExperiment,
): string {
  const variants = experiment.variants || []
  if (variants.length === 0) return 'A'

  // 已結論的實驗直接回傳 winner（如果有）
  if (experiment.status === 'concluded' && experiment.winner) {
    return experiment.winner
  }

  const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 0), 0)
  if (totalWeight <= 0) return variants[0].key

  const hash = fnv1aHash(`${experiment.key}:${visitorId}`)
  // 落到 [0, totalWeight) 區間
  const bucket = hash % totalWeight

  let cumulative = 0
  for (const v of variants) {
    cumulative += v.weight || 0
    if (bucket < cumulative) return v.key
  }
  return variants[variants.length - 1].key
}

// ============================================
// UUID v4（不依賴 crypto.randomUUID，相容舊瀏覽器）
// ============================================
export function generateUUID(): string {
  // crypto.randomUUID 現代瀏覽器優先用
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// ============================================
// Cookie 工具（純瀏覽器）
// ============================================
function setCookie(name: string, value: string, days: number) {
  if (typeof document === 'undefined') return
  const expires = new Date()
  expires.setDate(expires.getDate() + days)
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`
}

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

// ============================================
// 取得 / 建立 visitor_id（前端用）
// ============================================
export function getOrCreateVisitorId(): string {
  if (typeof document === 'undefined') return ''
  let vid = getCookie(VISITOR_COOKIE)
  if (!vid) {
    vid = generateUUID()
    setCookie(VISITOR_COOKIE, vid, COOKIE_DAYS * 12) // visitor id 存久一點（12 個月）
  }
  return vid
}

// ============================================
// 伺服器端：從 Request cookie 讀 visitor_id
// （SSR / API route 用，沒有就回 null 讓呼叫端自己決定要不要 fallback）
// ============================================
export function getVisitorIdFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  const match = cookieHeader.match(new RegExp('(?:^|; )' + VISITOR_COOKIE + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

// ============================================
// 發送事件（fire-and-forget，失敗不阻塞 UI）
// ============================================
export async function trackABEvent(payload: ABEventPayload): Promise<void> {
  try {
    // 用 navigator.sendBeacon 提升可靠度（頁面關閉時也能送）
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' })
      const ok = navigator.sendBeacon('/api/ab-events', blob)
      if (ok) return
    }
    await fetch('/api/ab-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch {
    // 事件追蹤失敗不影響主流程
  }
}

// ============================================
// React Hook：取得 variant + 追蹤事件
// 用法：
//   const { variant, track } = useABTest('pricing_c_20260417', [
//     { key: 'A', weight: 50 }, { key: 'B', weight: 50 }
//   ])
// ============================================
export interface UseABTestResult {
  variant: string
  visitorId: string
  track: (eventType: ABEventType, opts?: { value?: number; metadata?: Record<string, unknown> }) => void
  ready: boolean
}

export function useABTest(
  experimentKey: string,
  variants: ABVariantDef[],
  opts?: { autoImpression?: boolean },
): UseABTestResult {
  const autoImpression = opts?.autoImpression !== false // 預設自動發 impression
  const [variant, setVariant] = useState<string>('A')
  const [visitorId, setVisitorId] = useState<string>('')
  const [ready, setReady] = useState(false)
  const impressionSent = useRef(false)

  useEffect(() => {
    const vid = getOrCreateVisitorId()
    setVisitorId(vid)

    // 優先看之前是否已分配過（同一 visitor 保持一致）
    const prev = getCookie(ASSIGNMENT_COOKIE_PREFIX + experimentKey)
    let chosen: string
    if (prev && variants.some((v) => v.key === prev)) {
      chosen = prev
    } else {
      chosen = assignVariant(vid, { key: experimentKey, variants })
      setCookie(ASSIGNMENT_COOKIE_PREFIX + experimentKey, chosen, COOKIE_DAYS)
    }
    setVariant(chosen)
    setReady(true)

    // 自動 impression（只發一次）
    if (autoImpression && !impressionSent.current) {
      impressionSent.current = true
      trackABEvent({
        experimentKey,
        variant: chosen,
        visitorId: vid,
        eventType: 'impression',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentKey])

  const track = useCallback(
    (eventType: ABEventType, trackOpts?: { value?: number; metadata?: Record<string, unknown> }) => {
      if (!visitorId || !variant) return
      trackABEvent({
        experimentKey,
        variant,
        visitorId,
        eventType,
        value: trackOpts?.value,
        metadata: trackOpts?.metadata,
      })
    },
    [experimentKey, variant, visitorId],
  )

  return { variant, visitorId, track, ready }
}

// ============================================
// 統計：Chi-square p-value 計算（兩組 variant 比較用）
// 回傳 p-value；p < 0.05 代表統計顯著
// ============================================
export interface VariantStats {
  key: string
  impressions: number
  conversions: number
}

export function calcConversionRate(s: VariantStats): number {
  return s.impressions > 0 ? s.conversions / s.impressions : 0
}

/**
 * Z-test for two proportions（雙樣本比例差檢定，A/B 最常用）
 * 回 { zScore, pValue, lift, significant }
 */
export function zTestTwoProportions(a: VariantStats, b: VariantStats): {
  zScore: number
  pValue: number
  lift: number        // B 相對 A 的提升比例（正數=B更好）
  significant: boolean
} {
  const p1 = calcConversionRate(a)
  const p2 = calcConversionRate(b)
  const n1 = a.impressions
  const n2 = b.impressions
  if (n1 === 0 || n2 === 0) {
    return { zScore: 0, pValue: 1, lift: 0, significant: false }
  }
  // pooled proportion
  const p = (a.conversions + b.conversions) / (n1 + n2)
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
  if (se === 0) return { zScore: 0, pValue: 1, lift: 0, significant: false }

  const zScore = (p2 - p1) / se
  const pValue = 2 * (1 - normalCdf(Math.abs(zScore)))
  const lift = p1 > 0 ? (p2 - p1) / p1 : 0
  return {
    zScore,
    pValue,
    lift,
    significant: pValue < 0.05 && (n1 + n2) >= 200, // 樣本至少 200
  }
}

// 標準常態累積分佈函式（近似，Abramowitz & Stegun 26.2.17）
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = 0.3989423 * Math.exp((-z * z) / 2)
  const prob =
    d *
    t *
    (0.3193815 +
      t *
        (-0.3565638 +
          t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  return z > 0 ? 1 - prob : prob
}
