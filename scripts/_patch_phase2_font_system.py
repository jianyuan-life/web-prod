#!/usr/bin/env python3
"""v5.10.395 Warm Light Theme v1.1 — Phase 2 字體系統 patch globals.css

加入:
1. font-feature-settings palt/halt(替代 v0 撒謊的 padding 負值、L1 P0-4 修)
2. :lang(zh-Hant) / :lang(zh-Hans) / :lang(en) selectors
3. .classical (古籍引用字體)
4. hanging-punctuation
"""
import sys

GLOBALS_PATH = 'app/globals.css'

with open(GLOBALS_PATH, 'r', encoding='utf-8') as f:
    src = f.read()

# 找掛載點:在 @custom-variant 之後加 Phase 2 font system
marker = '@custom-variant light (&:where([data-theme="light"] *, [data-theme="light"]));\n'
addition = '''@custom-variant light (&:where([data-theme="light"] *, [data-theme="light"]));

/* =================================================================
 * v5.10.395 Warm Light Theme v1.1 — Phase 2 字體系統 + i18n typography
 * 規格:tasks/spec_ui_warm_light_theme_2026-05-16_v1.md §3 §8
 *
 * 解 v0 P0-4:CSS padding 不接受負值(L1 Round 1)、改用 OpenType feature
 * 加 L3 Qwen Round 1 共識:zh-Hant / zh-Hans / en 三軌語言 typography
 * 加 L2 P0-5 + L3 P0-1 共識:古籍引用獨立字體層 .classical
 * ================================================================= */

/* 中文標點 + 字距 OpenType feature(學 Apple TW sfpro-tw.css 但用 OpenType 而非 padding hack)*/
:lang(zh-Hant) body,
:lang(zh-Hans) body,
:where(html:not([lang])) body {
  font-feature-settings: "palt" 1, "halt" 1;
  hanging-punctuation: first allow-end;
}

/* 簡繁字體 stack 切換(:lang() selector、學 Notion 但補完整 CJK fallback)*/
:lang(zh-Hant) body {
  font-family: var(--font-body), "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", "Inter", system-ui, -apple-system, sans-serif;
}
:lang(zh-Hans) body {
  font-family: var(--font-body-sc), "Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Source Han Sans SC", "Inter", system-ui, sans-serif;
}
:lang(en) body {
  font-family: "Inter", system-ui, -apple-system, sans-serif;
  --leading-body: 1.6;
}

/* 古籍引用 component class(被 <ClassicalQuote> 用)*/
.classical {
  font-family: "Source Han Serif TC", var(--font-sans), "Noto Serif TC", serif;
  font-style: italic;
  line-height: 1.85;
  letter-spacing: 0.02em;
  /* Light:鎏金深邊框 + 內縮 */
  border-left: 3px solid var(--gold-700, #5C4416);
  padding-left: 1.25em;
  margin: 1em 0;
  color: var(--text-secondary);
}

/* tabular-nums 給統計數字 / 定價 / 八字四柱 / 信心指數 */
.tabular {
  font-variant-numeric: tabular-nums;
}

/* line-height / letter-spacing 全站基準變數(可被 component override)*/
:root {
  --leading-body: 1.75;
  --leading-heading: 1.25;
  --leading-classical: 1.85;
  --tracking-body: 0.02em;
  --tracking-heading: -0.01em;
  --tracking-eyebrow: 0.24em;
}

'''

# Find marker; if found, replace single occurrence
if marker not in src:
    print(f"❌ Marker not found in {GLOBALS_PATH}")
    sys.exit(1)

src = src.replace(marker, addition, 1)

with open(GLOBALS_PATH, 'w', encoding='utf-8') as f:
    f.write(src)

print(f"✅ {GLOBALS_PATH} patched, now {len(src.splitlines())} lines")
