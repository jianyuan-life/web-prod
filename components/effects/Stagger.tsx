// v5.10.213 — Stagger 元素入場動畫(Jamie 規格 4 全域動效之一)
//
// 用 framer-motion + IntersectionObserver、prefers-reduced-motion 自動 disable
// 樣式:子元素一個個 fade + translate-y、配合 reveal 規範(opacity 0→1, y 24→0, blur 8px→0、duration 0.6, ease [0.22,1,0.36,1])
'use client'

import { motion, type Variants } from 'framer-motion'
import { useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

export interface StaggerProps {
  children: ReactNode
  staggerDelay?: number // 子元素間隔秒數、default 0.06
  initialDelay?: number // 第一個元素延遲秒數、default 0.1
  className?: string
}

export function Stagger({ children, staggerDelay = 0.06, initialDelay = 0.1, className = '' }: StaggerProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: initialDelay,
      },
    },
  }

  return (
    <motion.div
      className={className}
      variants={containerVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-50px' }}
    >
      {children}
    </motion.div>
  )
}

// Helper:為 stagger children 提供 reveal animation
export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
  visible: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
}

export interface StaggerItemProps {
  children: ReactNode
  className?: string
}

export function StaggerItem({ children, className = '' }: StaggerItemProps) {
  const reduceMotion = useReducedMotion()
  if (reduceMotion) {
    return <div className={className}>{children}</div>
  }
  return (
    <motion.div className={className} variants={staggerItemVariants}>
      {children}
    </motion.div>
  )
}
