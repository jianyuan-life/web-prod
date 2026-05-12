// v5.10.198 UI redesign Phase 2 — Button 共用元件(Jamie 規格書 3.1)
//
// variants:
//   primary    — gradient 金底 + 深字 + gold-glow shadow + hover 上浮放大
//   secondary  — 透明底 + 金邊 + 金字 + hover 填金 8%
//   ghost      — 純文字 + 右箭頭 + hover 箭頭右移 4px
//
// 全部:focus-visible:outline-2 outline-gold-300 outline-offset-2
// 過渡:200ms cubic-bezier(0.4,0,0.2,1)
'use client'

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  icon?: ReactNode
  rightIcon?: ReactNode
}

const SIZE_CLASSES = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-6 text-[15px]',
  lg: 'h-12 px-7 text-base',
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: `
    text-[#0A0E1A] font-semibold
    bg-[linear-gradient(135deg,#D4B36A_0%,#C9A84C_50%,#B8923D_100%)]
    shadow-[0_8px_32px_rgba(201,168,76,0.25),inset_0_1px_0_rgba(255,255,255,0.25)]
    border border-transparent
    hover:-translate-y-0.5 hover:scale-[1.02]
    hover:shadow-[0_12px_40px_rgba(201,168,76,0.5),inset_0_1px_0_rgba(255,255,255,0.3)]
    active:translate-y-0 active:scale-[0.99]
    transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]
  `,
  secondary: `
    text-[#C9A84C] font-semibold bg-transparent
    border border-[rgba(201,168,76,0.4)]
    hover:bg-[rgba(201,168,76,0.08)] hover:border-[rgba(201,168,76,0.7)]
    active:scale-[0.99]
    transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]
  `,
  ghost: `
    text-[#E0C679] font-medium bg-transparent border-0
    hover:text-[#F0E0B0]
    transition-colors duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]
    group
  `,
}

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-[#E0C679] focus-visible:outline-offset-2 focus:outline-none'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, rightIcon, className = '', children, ...rest },
  ref,
) {
  const sizeClass = SIZE_CLASSES[size]
  const variantClass = VARIANT_CLASSES[variant]
  const isGhost = variant === 'ghost'

  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sizeClass} ${variantClass} ${FOCUS_RING} ${className}`}
      {...rest}
    >
      {icon ? <span className="inline-flex">{icon}</span> : null}
      <span>{children}</span>
      {rightIcon ? (
        <span
          className={
            isGhost
              ? 'inline-flex transition-transform duration-200 group-hover:translate-x-1'
              : 'inline-flex'
          }
        >
          {rightIcon}
        </span>
      ) : null}
    </button>
  )
})
