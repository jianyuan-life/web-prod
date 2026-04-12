'use client'

import { useEffect, useState } from 'react'

export default function LiveCounter() {
  const [count, setCount] = useState(0)
  const [target, setTarget] = useState(0)

  useEffect(() => {
    fetch('/api/stats')
      .then(r => r.json())
      .then(d => setTarget(d.count ?? 0))
      .catch(() => setTarget(0))
  }, [])

  // 動態遞增動畫：約 2 秒從 0 到 target
  useEffect(() => {
    if (target === 0) return
    const duration = 2000
    const steps = 60
    const increment = target / steps
    const interval = duration / steps
    let current = 0

    const timer = setInterval(() => {
      current += increment
      if (current >= target) {
        setCount(target)
        clearInterval(timer)
      } else {
        setCount(Math.floor(current))
      }
    }, interval)

    return () => clearInterval(timer)
  }, [target])

  const formatted = count.toLocaleString('en-US')

  if (target === 0) {
    return <span className="font-bold text-gradient-gold">--</span>
  }

  return <span className="font-bold text-gradient-gold">{formatted}</span>
}
