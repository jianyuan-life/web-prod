// T10 v5.10.353 (Master Plan Sprint 7):useRetryCountdown hook
// 給 429 RateLimitError 顯示倒數、自動 enable retry button
//
// 用法:
//   const { secondsLeft, isReady, start } = useRetryCountdown()
//   try { await apiPost(...) }
//   catch (e) {
//     if (e instanceof RateLimitError) start(e.retryAfter)
//     else setError(e.message)
//   }
//   {!isReady && <p>請等 {secondsLeft} 秒</p>}
//   <button disabled={!isReady} onClick={retry}>{isReady ? '重試' : `${secondsLeft}s`}</button>

'use client'

import { useEffect, useState, useCallback } from 'react'

export interface UseRetryCountdownReturn {
  secondsLeft: number
  isReady: boolean
  start: (seconds: number) => void
  reset: () => void
}

export function useRetryCountdown(): UseRetryCountdownReturn {
  const [secondsLeft, setSecondsLeft] = useState(0)

  // 倒數
  useEffect(() => {
    if (secondsLeft <= 0) return
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000)
    return () => clearTimeout(t)
  }, [secondsLeft])

  const start = useCallback((seconds: number) => {
    if (seconds <= 0 || seconds > 86400) return  // 防 invalid input
    setSecondsLeft(Math.ceil(seconds))
  }, [])

  const reset = useCallback(() => setSecondsLeft(0), [])

  return {
    secondsLeft,
    isReady: secondsLeft <= 0,
    start,
    reset,
  }
}
