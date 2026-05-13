// v5.10.207 — Utility functions(對齊 shadcn/ui 標準 pattern)
//
// 用途:
//   - cn():合併 className(clsx + twMerge、處理 Tailwind class 衝突)
//   - 對應 Jamie 規格 pnpm install 之 clsx + tailwind-merge
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * 合併 className 並解決 Tailwind class 衝突
 *
 * 範例:
 *   cn('px-4 text-sm', condition && 'px-6')  // → 'text-sm px-6'(後者覆蓋前者)
 *   cn('text-red-500', 'text-blue-500')      // → 'text-blue-500'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
