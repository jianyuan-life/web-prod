'use client'

/**
 * v5.10.395 Warm Light Theme v1.1 — ThemeProvider wrapper
 *
 * 規格:tasks/spec_ui_warm_light_theme_2026-05-16_v1.md §4.2 §4.4
 * 4 LLM 共識(Round 3 95.5/100、P0=0)
 *
 * 角色:wrap next-themes ThemeProvider、預設 system + data-theme attribute
 *
 * 為什麼:
 * - 既有 R8 R8Enhancements DarkModeToggle v5.10.183 用 useState + 直接 setAttribute、
 *   無 SSR no-flash、無多元件同步、無 system preference detect
 * - 全站 ThemeProvider 後、R8 與未來 NavBar/Footer/banner 統一用 useTheme()
 * - localStorage migration:既有 `jy_report_theme_v1` key 由 app/layout.tsx inline script 處理
 */

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  // v5.10.408:報告閱讀區 light 適配未完成(殼 inline 深空漸層 page.tsx L1687 +
  // 實測 326/929 處正文文字在淺殼下 < 3:1 不可讀)、warm-light 報告遷移 sprint 完成前
  // /report/* 鎖 dark。forcedTheme 不寫 localStorage、離開報告頁即回用戶原偏好;
  // 解「html=light、內容全黑」狀態錯亂(主題鍵看似壞掉 + 暖白 banner 不實宣傳)。
  const forcedTheme = pathname?.startsWith('/report/') ? 'dark' : undefined
  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      forcedTheme={forcedTheme}
      disableTransitionOnChange={false}
      themes={['light', 'dark']}
      // 注意:next-themes 預設 storageKey = 'theme'
      // 既有 R8 用 'jy_report_theme_v1'、由 inline script(layout.tsx)做一次性 migration
    >
      {children}
    </NextThemesProvider>
  )
}
