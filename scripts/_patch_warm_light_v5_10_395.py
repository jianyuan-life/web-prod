#!/usr/bin/env python3
"""v5.10.395 Warm Light Theme v1.1 — 統一 patch Navbar + layout.tsx + R8

precise string replace、避免 Edit tool 截斷 CJK + 多行 JSX 的問題。
"""
import subprocess
import sys


def git_show(path):
    return subprocess.check_output(['git', 'show', f'HEAD:{path}']).decode('utf-8')


def patch_file(path, patches, restore_first=True):
    """patches: list of (old_str, new_str) tuples、依序套用"""
    if restore_first:
        src = git_show(path)
        print(f"  [{path}] restored from HEAD ({len(src.splitlines())} lines)")
    else:
        with open(path, 'r', encoding='utf-8') as f:
            src = f.read()

    for i, (old, new) in enumerate(patches):
        if old not in src:
            print(f"  [{path}] ❌ Patch {i+1} marker NOT FOUND")
            sys.exit(1)
        src = src.replace(old, new, 1)
        print(f"  [{path}] ✅ Patch {i+1} applied")

    with open(path, 'w', encoding='utf-8') as f:
        f.write(src)
    print(f"  [{path}] Final: {len(src.splitlines())} lines")


# ===== 1. Navbar.tsx =====
navbar_patches = [
    (
        "import LocaleSwitcher from './LocaleSwitcher'\nimport { getLocale, UI_TEXT } from '@/lib/i18n'",
        "import LocaleSwitcher from './LocaleSwitcher'\nimport { ThemeToggleSimple } from './ThemeToggleSimple'\nimport { getLocale, UI_TEXT } from '@/lib/i18n'",
    ),
    (
        '        <div className="flex items-center gap-3">\n          <LocaleSwitcher />\n          {/* 桌面版用戶區域 */}',
        '        <div className="flex items-center gap-3">\n          {/* v5.10.395 Warm Light Theme v1.1 — NavBar 主切換 toggle(FF 控制)*/}\n          {process.env.NEXT_PUBLIC_FF_WARM_LIGHT_THEME === \'true\' && (\n            <div className="hidden md:block">\n              <ThemeToggleSimple />\n            </div>\n          )}\n          <LocaleSwitcher />\n          {/* 桌面版用戶區域 */}',
    ),
]

# ===== 2. layout.tsx =====
layout_patches = [
    # Patch 1: import
    (
        "import { GlobalToastProvider } from '@/components/report/shared/GlobalToast'\nimport './globals.css'",
        "import { GlobalToastProvider } from '@/components/report/shared/GlobalToast'\nimport { ThemeProvider } from '@/components/ThemeProvider'\nimport { ThemeLanguageSettings } from '@/components/ThemeLanguageSettings'\nimport { FirstVisitWarmBanner } from '@/components/FirstVisitWarmBanner'\nimport './globals.css'",
    ),
    # Patch 2: inline no-flash script + R8 migration(放 head 最前)
    (
        '    <html lang="zh-TW" className={`${notoSerif.variable} ${notoSans.variable} ${notoSerifSC.variable} ${notoSansSC.variable} ${cinzel.variable}`} suppressHydrationWarning>\n      <head>\n        {/* v5.10.326 perf:預連線關鍵第三方來源',
        '    <html lang="zh-TW" className={`${notoSerif.variable} ${notoSans.variable} ${notoSerifSC.variable} ${notoSansSC.variable} ${cinzel.variable}`} suppressHydrationWarning>\n      <head>\n        {/* v5.10.395 Warm Light Theme v1.1 — SSR no-flash + R8 localStorage migration\n            必須在 ThemeProvider hydrate 前執行、避免閃爍\n            規格:tasks/spec_ui_warm_light_theme_2026-05-16_v1.md §4.1 §4.5\n            L4 Gemini Round 3 P2:fallback 用 prefers-color-scheme detect、不寫死 dark\n            L2 IA Round 1 P0-3:既有 R8 \'jy_report_theme_v1\' key 一次性遷移 */}\n        <script\n          dangerouslySetInnerHTML={{\n            __html: "(function(){try{var O=\'jy_report_theme_v1\',N=\'theme\',o=localStorage.getItem(O);if(o&&!localStorage.getItem(N)){localStorage.setItem(N,o);}var t=localStorage.getItem(N),pd=window.matchMedia(\'(prefers-color-scheme: dark)\').matches,th=(t===\'light\'||t===\'dark\')?t:(pd?\'dark\':\'light\');document.documentElement.setAttribute(\'data-theme\',th);}catch(e){var fd=window.matchMedia(\'(prefers-color-scheme: dark)\').matches;document.documentElement.setAttribute(\'data-theme\',fd?\'dark\':\'light\');}})();",\n          }}\n        />\n        {/* v5.10.326 perf:預連線關鍵第三方來源',
    ),
    # Patch 3: wrap ThemeProvider 在 GlobalToastProvider 外
    (
        '        <Tracker />\n        <ReferralHandler />\n        <CookieConsent />\n        {/* v5.10.250 wire dead component:GlobalToastProvider 包整 app、開放 useToast() 全域可用 */}\n        <GlobalToastProvider>\n        <LocaleContent>\n        <Navbar />\n        <main className="pt-16">{children}</main>\n        <GlobalBackToTop />',
        '        <Tracker />\n        <ReferralHandler />\n        <CookieConsent />\n        {/* v5.10.395 Warm Light Theme v1.1 — ThemeProvider 包整 app(對齊 inline script 同 data-theme attr)\n            預設 system + R8 localStorage 已由 inline script 遷移到 \'theme\' key */}\n        <ThemeProvider>\n        {/* v5.10.250 wire dead component:GlobalToastProvider 包整 app、開放 useToast() 全域可用 */}\n        <GlobalToastProvider>\n        <LocaleContent>\n        <Navbar />\n        {process.env.NEXT_PUBLIC_FF_WARM_LIGHT_THEME === \'true\' && <FirstVisitWarmBanner />}\n        <main className="pt-16">{children}</main>\n        <GlobalBackToTop />',
    ),
    # Patch 4: 關 ThemeProvider + 加 ThemeLanguageSettings
    (
        '              <p className="mt-2">&copy; 2026 鑒源 JianYuan. 版權所有 &middot; v{pkg.version}</p>\n            </div>\n          </div>\n        </footer>\n        </LocaleContent>\n        </GlobalToastProvider>',
        '              <p className="mt-2">&copy; 2026 鑒源 JianYuan. 版權所有 &middot; v{pkg.version}</p>\n            </div>\n\n            {/* v5.10.395 Warm Light Theme v1.1 — Footer 完整 theme + language settings(FF 控制)*/}\n            {process.env.NEXT_PUBLIC_FF_WARM_LIGHT_THEME === \'true\' && <ThemeLanguageSettings />}\n          </div>\n        </footer>\n        </LocaleContent>\n        </GlobalToastProvider>\n        </ThemeProvider>',
    ),
]

# ===== Apply =====
print("=== Patching Navbar.tsx ===")
patch_file('components/Navbar.tsx', navbar_patches)
print()
print("=== Patching app/layout.tsx ===")
patch_file('app/layout.tsx', layout_patches)
print()
print("Done. R8Enhancements.tsx already patched in previous step.")
