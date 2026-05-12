// v5.10.200 — Design Tokens canonical(Jamie 2026-05-13 規格更新版)
//
// 用途:
//   - 純 TS export、供 .ts/.tsx 直接 import(`import { tokens } from '@/lib/design-tokens'`)
//   - 跟 globals.css 內 `--jy-*` CSS var 對應、值同步
//   - 設計值 source of truth(規格書改值時、改本檔 + globals.css)
//
// 命名空間:`jy-*` prefix 避免衝突既有 `--color-gold` 等 200+ 處 var 用法
// 向後兼容:既有 var 保留(Phase migration 漸進替換)、新 component 用本 tokens
//
// 規格 source:Jamie 2026-05-13 design tokens 規格更新版(取代之前 v1.0 部分值)

export const tokens = {
  // ===== 色彩:夜空命理 × 金箔貴氣 =====
  color: {
    bg: {
      void: '#05060F',    // 最深、body background
      space: '#0A0E22',   // 主層、section
      nebula: '#101536',  // 卡片底
      mist: '#1A2150',    // hover / active
      glow: 'radial-gradient(circle at 50% 0%, #2A1F5C 0%, #05060F 60%)',
    },
    gold: {
      50: '#FFF8E5',
      100: '#FCEEC0',
      200: '#F8DC8C',
      400: '#E5B95C',
      500: '#D4A04A',
      600: '#B8842F',
      700: '#8B5E1A',
      shimmer: 'linear-gradient(135deg, #FCEEC0 0%, #E5B95C 35%, #B8842F 70%, #FCEEC0 100%)',
    },
    semantic: {
      flow: '#4ADE80',    // 順流 75+
      balance: '#FBBF24', // 平衡 55-75
      adjust: '#F97316',  // 調整 <55
      danger: '#EF4444',
      water: '#60A5FA',
      wood: '#86EFAC',
      fire: '#FB7185',
      earth: '#D4A04A',
      metal: '#E2E8F0',
    },
    text: {
      primary: '#F8FAFC',
      secondary: '#CBD5E1',
      tertiary: '#94A3B8',
      muted: '#64748B',
      gold: '#E5B95C',
    },
    border: {
      hairline: 'rgba(255,255,255,0.06)',
      soft: 'rgba(255,255,255,0.10)',
      gold: 'rgba(229,185,92,0.30)',
    },
  },

  // ===== 字體(中文襯線 × 西文無襯線 × 數字 Tabular)=====
  font: {
    display: '"Noto Serif TC", "Source Han Serif TC", serif',
    body: '"Noto Sans TC", "Inter var", sans-serif',
    mono: '"JetBrains Mono", "IBM Plex Mono", monospace',
    numeric: '"Inter var", "SF Pro Display"',
    numericFeatures: '"tnum", "ss01"',
  },

  // ===== 字級(Major Third 1.25 比例)=====
  type: {
    hero: { size: 'clamp(48px, 6vw, 88px)', lineHeight: 1.05, weight: 700, tracking: '-0.04em' },
    h1: { size: 'clamp(36px, 4vw, 56px)', lineHeight: 1.1, weight: 700, tracking: '-0.03em' },
    h2: { size: 'clamp(28px, 3vw, 40px)', lineHeight: 1.15, weight: 600, tracking: '-0.02em' },
    h3: { size: 'clamp(22px, 2vw, 28px)', lineHeight: 1.25, weight: 600 },
    h4: { size: '18px', lineHeight: 1.35, weight: 600 },
    body: { size: '16px', lineHeight: 1.75, weight: 400 },
    small: { size: '14px', lineHeight: 1.6, weight: 400 },
    caption: { size: '12px', lineHeight: 1.5, weight: 400, tracking: '0.02em' },
    bazi: { size: 'clamp(40px, 4vw, 64px)', lineHeight: 1, weight: 500, family: 'display' as const },
  },

  // ===== 間距(8pt grid)=====
  spacing: {
    1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '24px',
    6: '32px', 7: '48px', 8: '64px', 9: '96px', 10: '128px',
  },

  // ===== 圓角 =====
  radius: {
    sm: '8px', md: '12px', lg: '16px', xl: '20px',
    '2xl': '24px', '3xl': '32px', pill: '9999px',
  },

  // ===== 陰影(金光 + 深空)=====
  shadow: {
    card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 24px 48px -16px rgba(0,0,0,0.6)',
    gold: '0 0 0 1px rgba(229,185,92,0.4), 0 0 40px -8px rgba(229,185,92,0.35)',
    halo: '0 0 80px -10px rgba(229,185,92,0.25), 0 0 160px -40px rgba(167,139,250,0.3)',
    inset: 'inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.4)',
    elevate: '0 32px 80px -20px rgba(0,0,0,0.7)',
  },

  // ===== Motion(Apple Spring + Linear Ease)=====
  motion: {
    // framer-motion 用:`<motion.div animate={...} transition={tokens.motion.spring}>`
    spring: { type: 'spring' as const, stiffness: 280, damping: 32, mass: 0.8 },
    smooth: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
    swift: { duration: 0.25, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] },
    stagger: { staggerChildren: 0.06, delayChildren: 0.1 },
    reveal: {
      opacity: [0, 1],
      y: [24, 0],
      filter: ['blur(8px)', 'blur(0px)'],
      transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
    },
    // CSS parallax(用 var(--scroll) + style attribute)
    parallax: 'translate3d(0, calc(var(--scroll, 0) * 0.3px), 0)',
  },

  // ===== 響應式斷點(對齊 Tailwind v4、加 xs / 3xl)=====
  breakpoint: {
    xs: '420px',
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
    '3xl': '1920px',
  },

  // ===== Grid container(Tailwind utility shorthand)=====
  grid: {
    container: 'max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8',
    gap: 'gap-4 md:gap-6 lg:gap-8',
  },
} as const

// 型別 export 供 component prop 使用
export type Tokens = typeof tokens
export type GoldShade = keyof typeof tokens.color.gold
export type SemanticColor = keyof typeof tokens.color.semantic
export type FontType = keyof typeof tokens.type
