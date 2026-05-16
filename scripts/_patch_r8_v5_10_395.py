#!/usr/bin/env python3
"""v5.10.395 Warm Light Theme v1.1 — R8Enhancements DarkModeToggle 改用 next-themes useTheme()

precise string replace、避免 Edit tool 截斷問題。
"""
import sys

src_path = 'components/report/R8Enhancements.tsx'

with open(src_path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src.splitlines())
print(f"Original lines: {orig_len}")

# Patch 1
old1 = (
    "import { useEffect, useState, useCallback } from 'react'\n"
    "\n"
    "const STORAGE_KEYS = {\n"
    "  ONBOARDING_DISMISSED: 'jy_report_onboarding_v1',\n"
    "  VIEW_MODE: 'jy_report_view_mode_v1',  // 'simple' | 'expert'\n"
    "  THEME: 'jy_report_theme_v1',           // 'dark' | 'light'\n"
    "}"
)
new1 = (
    "import { useEffect, useState, useCallback } from 'react'\n"
    "import { useTheme } from 'next-themes'\n"
    "\n"
    "const STORAGE_KEYS = {\n"
    "  ONBOARDING_DISMISSED: 'jy_report_onboarding_v1',\n"
    "  VIEW_MODE: 'jy_report_view_mode_v1',  // 'simple' | 'expert'\n"
    "  // v5.10.395 Warm Light v1.1:THEME key 已 migrate 到 next-themes 'theme'、保留作 trace\n"
    "  THEME: 'jy_report_theme_v1',\n"
    "}"
)
assert old1 in src, "Patch 1 marker not found"
src = src.replace(old1, new1, 1)

# Patch 2 — full DarkModeToggle replace
# Use line-by-line read to avoid escape headaches
old_lines = [
    "// ============================================================",
    "// #13 Dark / Light Mode 切換",
    "// ============================================================",
    "export function DarkModeToggle() {",
    "  const [theme, setTheme] = useState<'dark' | 'light'>('dark')",
    "",
    "  useEffect(() => {",
    "    // v5.10.183 P0 修(4 plans Playwright Vision audit 抓):",
    "    // 原邏輯自動 follow OS prefers-color-scheme: light、客戶 OS 是 light 就套 light theme",
    "    // 但鑑源報告是品牌深色設計(深紫 + 金色 hero / 命盤卡 / 太陽之火 等)、強行套 light 會視覺撕裂",
    "    // 修補:預設永遠 dark、只在客戶主動點 toggle 才切 light、不再 follow OS 偏好",
    "    const stored = readStorage(STORAGE_KEYS.THEME)",
    "    if (stored === 'light' || stored === 'dark') {",
    "      setTheme(stored)",
    "      applyTheme(stored)",
    "    }",
    "    // 不再 auto-follow window.matchMedia('(prefers-color-scheme: light)')",
    "  }, [])",
    "",
    "  const applyTheme = (t: 'dark' | 'light') => {",
    "    if (typeof document === 'undefined') return",
    "    document.documentElement.setAttribute('data-theme', t)",
    "  }",
    "",
    "  const toggle = () => {",
    "    const next = theme === 'dark' ? 'light' : 'dark'",
    "    setTheme(next)",
    "    applyTheme(next)",
    "    writeStorage(STORAGE_KEYS.THEME, next)",
    "  }",
    "",
    "  return (",
    "    <button",
    "      type=\"button\"",
    "      onClick={toggle}",
    "      aria-label={`切換到${theme === 'dark' ? '淺色' : '深色'}模式`}",
    "      title={`切換到${theme === 'dark' ? '淺色' : '深色'}模式`}",
    "      className=\"px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 text-[12px]\"",
    "      style={{",
    "        background: 'rgba(255,255,255,0.06)',",
    "        border: '1px solid rgba(255,255,255,0.18)',",
    "        color: theme === 'dark' ? '#f5d76e' : '#1a2340',",
    "      }}",
    "    >",
    "      <span aria-hidden>{theme === 'dark' ? '☀' : '\U0001F319'}</span>",
    "      <span className=\"hidden sm:inline\">{theme === 'dark' ? '淺色' : '深色'}</span>",
    "    </button>",
    "  )",
    "}",
]
old2 = "\n".join(old_lines)

new_lines = [
    "// ============================================================",
    "// #13 Dark / Light Mode 切換",
    "// v5.10.395 Warm Light Theme v1.1:改用 next-themes useTheme()、與全站 ThemeProvider 統一",
    "// 歷史:v5.10.183 修「不 follow OS」(light 不完整)/ v5.10.395 解:Warm Light tokens 完整、可 follow OS",
    "// 規格:tasks/spec_ui_warm_light_theme_2026-05-16_v1.md",
    "// ============================================================",
    "export function DarkModeToggle() {",
    "  const { theme, setTheme, resolvedTheme } = useTheme()",
    "  const [mounted, setMounted] = useState(false)",
    "",
    "  useEffect(() => setMounted(true), [])",
    "",
    "  if (!mounted) {",
    "    return (",
    "      <button",
    "        type=\"button\"",
    "        aria-label=\"切換主題(載入中)\"",
    "        className=\"px-3 py-1.5 rounded-md flex items-center gap-1.5 text-[12px]\"",
    "        style={{",
    "          background: 'rgba(255,255,255,0.06)',",
    "          border: '1px solid rgba(255,255,255,0.18)',",
    "          color: '#f5d76e',",
    "        }}",
    "        disabled",
    "      >",
    "        <span aria-hidden>☀</span>",
    "        <span className=\"hidden sm:inline\">主題</span>",
    "      </button>",
    "    )",
    "  }",
    "",
    "  const current: 'dark' | 'light' = resolvedTheme === 'light' ? 'light' : 'dark'",
    "  const next: 'dark' | 'light' = current === 'dark' ? 'light' : 'dark'",
    "",
    "  return (",
    "    <button",
    "      type=\"button\"",
    "      onClick={() => {",
    "        setTheme(next)",
    "        if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {",
    "          ;(window as any).gtag('event', 'theme_selected', {",
    "            event_category: 'preference',",
    "            theme_value: next,",
    "            previous_theme: theme,",
    "            is_first_visit: false,",
    "            source_location: 'report_toolbar',",
    "            resolved_theme: next,",
    "          })",
    "        }",
    "      }}",
    "      aria-label={`切換到${current === 'dark' ? '淺色' : '深色'}模式`}",
    "      title={`切換到${current === 'dark' ? '淺色' : '深色'}模式`}",
    "      className=\"px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 text-[12px]\"",
    "      style={{",
    "        background: 'rgba(255,255,255,0.06)',",
    "        border: '1px solid rgba(255,255,255,0.18)',",
    "        color: current === 'dark' ? '#f5d76e' : '#1a2340',",
    "      }}",
    "    >",
    "      <span aria-hidden>{current === 'dark' ? '☀' : '\U0001F319'}</span>",
    "      <span className=\"hidden sm:inline\">{current === 'dark' ? '淺色' : '深色'}</span>",
    "    </button>",
    "  )",
    "}",
]
new2 = "\n".join(new_lines)

if old2 not in src:
    print("[ERROR] Patch 2 marker NOT FOUND in source")
    # Debug: 顯示 mismatch 點
    for i, l in enumerate(old_lines):
        if l not in src:
            print(f"  Missing line {i}: {repr(l)}")
            break
    sys.exit(1)

src = src.replace(old2, new2, 1)

with open(src_path, 'w', encoding='utf-8') as f:
    f.write(src)

new_len = len(src.splitlines())
print(f"After patch: {new_len} lines (delta +{new_len - orig_len})")
print(f"Final last 3 lines: {chr(10).join(src.splitlines()[-3:])}")
