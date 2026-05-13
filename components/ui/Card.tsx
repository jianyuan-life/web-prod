// v5.10.198 UI redesign Phase 2 — Card 玻璃擬態(Jamie 規格書 3.2)
// v5.10.199 Gemini L4 P1-1 修:Polymorphic 'as' prop 改 React.ElementType + 泛型 type-safe
// v5.10.215 Gemini P0 修:移除 'use client'(Card 為純 div wrapper、無互動、應為 RSC、降 client bundle)
//
// 樣式:
//   bg-bg-card/70 backdrop-blur-xl border border-line rounded-lg shadow-card
//   hover:shadow-card-hover -translate-y-1 border-[rgba(201,168,76,0.35)]
//   過渡 240ms

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'

const BASE_CARD = `
  rounded-[16px] border border-[rgba(201,168,76,0.18)]
  bg-[rgba(17,26,48,0.7)] backdrop-blur-xl
  shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_16px_40px_rgba(0,0,0,0.35)]
`

const INTERACTIVE_CARD = `
  transition-all duration-[240ms] ease-[cubic-bezier(0.4,0,0.2,1)]
  hover:-translate-y-1
  hover:border-[rgba(201,168,76,0.35)]
  hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_60px_rgba(0,0,0,0.45)]
`

// Polymorphic type — caller 傳 as='article' 時 props 自動切換到 HTMLAttributes<HTMLElement>
type CardOwnProps<E extends ElementType = 'div'> = {
  as?: E
  interactive?: boolean
  children?: ReactNode
  className?: string
}

export type CardProps<E extends ElementType = 'div'> = CardOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof CardOwnProps>

// 不用 forwardRef、改 ref-as-prop pattern(React 19 支援、避免 forwardRef + polymorphic 型別衝突)
export function Card<E extends ElementType = 'div'>({
  as,
  interactive = true,
  className = '',
  children,
  ...rest
}: CardProps<E>) {
  const Component = (as || 'div') as ElementType
  const interactiveClass = interactive ? INTERACTIVE_CARD : ''
  return (
    <Component className={`${BASE_CARD} ${interactiveClass} ${className}`} {...rest}>
      {children}
    </Component>
  )
}
