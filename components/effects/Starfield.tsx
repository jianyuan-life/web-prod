// v5.10.198 UI redesign Phase 2 — Starfield 背景星空(Jamie 規格書 3.5)
//
// 行為:
//   - Canvas、30~50 顆星
//   - 2~3% 隨機閃爍
//   - 每 8~12 秒一顆 45° 流星(1.2s 消失)
//   - prefers-reduced-motion 停止動畫(只渲染靜態星點)
//   - FPS ≥ 50(throttle requestAnimationFrame)
'use client'

import { useEffect, useRef } from 'react'

export interface StarfieldProps {
  className?: string
  starCount?: number // 預設 40
  meteorIntervalSec?: [number, number] // 流星間隔 [min, max] 秒、default [8, 12]
}

interface Star {
  x: number
  y: number
  r: number
  baseAlpha: number
  twinklePhase: number
  twinkleSpeed: number
}

interface Meteor {
  x: number
  y: number
  length: number
  speed: number
  alpha: number
  startTime: number
}

export function Starfield({
  className = '',
  starCount = 40,
  meteorIntervalSec = [8, 12],
}: StarfieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>(0)
  const lastMeteorTimeRef = useRef<number>(0)
  const nextMeteorDelayRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const reduceMotion = mq.matches

    // 高 DPI 支援
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    function resize() {
      if (!canvas) return
      const rect = canvas.parentElement?.getBoundingClientRect() ?? { width: window.innerWidth, height: window.innerHeight }
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      ctx?.scale(dpr, dpr)
    }
    resize()

    // v5.10.199 Gemini L4 P1-2 修:用 ResizeObserver 替代 window resize
    //   父容器 dynamic 改尺寸時(如 flex 重排 / lazy-load 影響 viewport)、resize event 不觸發
    //   ResizeObserver 監聽真實 element 尺寸變化、更可靠
    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      resizeObserver = new ResizeObserver(() => resize())
      resizeObserver.observe(canvas.parentElement)
    } else {
      // Fallback:舊瀏覽器或 SSR、保留 window resize
      window.addEventListener('resize', resize)
    }

    // 生成星點
    const stars: Star[] = []
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * (canvas.width / dpr),
        y: Math.random() * (canvas.height / dpr),
        r: Math.random() * 1.2 + 0.3,
        baseAlpha: Math.random() * 0.5 + 0.3,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.02 + 0.01,
      })
    }

    const meteors: Meteor[] = []
    function spawnMeteor(now: number) {
      if (!canvas) return
      meteors.push({
        x: Math.random() * (canvas.width / dpr) * 0.5,
        y: Math.random() * (canvas.height / dpr) * 0.3,
        length: Math.random() * 60 + 40,
        speed: Math.random() * 2 + 4,
        alpha: 1,
        startTime: now,
      })
    }

    function schedNextMeteor() {
      const [min, max] = meteorIntervalSec
      nextMeteorDelayRef.current = (Math.random() * (max - min) + min) * 1000
      lastMeteorTimeRef.current = performance.now()
    }
    schedNextMeteor()

    // FPS throttle to ~50fps
    let lastFrame = 0
    const frameMs = 1000 / 50

    function draw(now: number) {
      if (!ctx || !canvas) return
      if (now - lastFrame < frameMs) {
        animationRef.current = requestAnimationFrame(draw)
        return
      }
      lastFrame = now

      const w = canvas.width / dpr
      const h = canvas.height / dpr
      ctx.clearRect(0, 0, w, h)

      // 繪星點
      for (const s of stars) {
        let alpha = s.baseAlpha
        if (!reduceMotion) {
          // 2-3% 隨機閃爍(twinkle)
          s.twinklePhase += s.twinkleSpeed
          alpha = s.baseAlpha + Math.sin(s.twinklePhase) * 0.25
          alpha = Math.max(0.1, Math.min(1, alpha))
        }
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(201, 168, 76, ${alpha})`
        ctx.fill()
      }

      // 繪流星(僅 non-reduce-motion 環境)
      if (!reduceMotion) {
        if (now - lastMeteorTimeRef.current > nextMeteorDelayRef.current) {
          spawnMeteor(now)
          schedNextMeteor()
        }
        for (let i = meteors.length - 1; i >= 0; i--) {
          const m = meteors[i]
          const age = (now - m.startTime) / 1200 // 1.2s 生命
          if (age >= 1) {
            meteors.splice(i, 1)
            continue
          }
          m.x += m.speed
          m.y += m.speed
          m.alpha = 1 - age
          const grad = ctx.createLinearGradient(m.x, m.y, m.x - m.length, m.y - m.length)
          grad.addColorStop(0, `rgba(255, 240, 200, ${m.alpha})`)
          grad.addColorStop(1, 'rgba(255, 240, 200, 0)')
          ctx.strokeStyle = grad
          ctx.lineWidth = 1.5
          ctx.beginPath()
          ctx.moveTo(m.x, m.y)
          ctx.lineTo(m.x - m.length, m.y - m.length)
          ctx.stroke()
        }
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    if (reduceMotion) {
      // 只渲染一次靜態星點、不啟動動畫
      draw(performance.now())
    } else {
      animationRef.current = requestAnimationFrame(draw)
    }

    return () => {
      cancelAnimationFrame(animationRef.current)
      if (resizeObserver) {
        resizeObserver.disconnect()
      } else {
        window.removeEventListener('resize', resize)
      }
    }
  }, [starCount, meteorIntervalSec])

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none ${className}`}
      aria-hidden
    />
  )
}
