#!/usr/bin/env python3
"""v5.10.395 Warm Light Theme v1.1 — patch globals.css 完整(Phase 1 tokens + Phase 2 font system)

避開 Edit tool 對 CJK 多行 CSS block 的截斷問題。
復原 HEAD + 一次性 patch 兩段。
"""
import subprocess
import sys

GLOBALS = 'app/globals.css'

# Step 1: 從 git HEAD 復原
src = subprocess.check_output(['git', 'show', f'HEAD:{GLOBALS}']).decode('utf-8')
print(f"Restored {GLOBALS} from HEAD: {len(src.splitlines())} lines")

# Step 2: 找掛載點 — 既有 [data-theme="light"] .glass 區塊後
MARKER = '[data-theme="light"] .glass {\n  background: rgba(255, 255, 255, 0.75);\n  border: 1px solid rgba(139, 110, 60, 0.18);\n}\n\n/* R+8 #11 Onboarding modal 動畫 */'

if MARKER not in src:
    print("❌ Marker not found")
    sys.exit(1)

# Phase 1 + Phase 2 combined addition(放 .glass 之後、Onboarding modal 之前)
ADDITION = '''[data-theme="light"] .glass {
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(139, 110, 60, 0.18);
}

/* =================================================================
 * v5.10.395 Warm Light Theme v1.1 — semantic tokens(2026-05-16、4 LLM 共識 95.5/100)
 * 規格:tasks/spec_ui_warm_light_theme_2026-05-16_v1.md
 * 政策:既有 --color-* tokens 不動(L1041-1079、保 v5.10.59/.66 修補)、新增語意 token 雙軌共存
 * 對比度:所有 token 用 Python WCAG 2.1 公式算過
 * 受 NEXT_PUBLIC_FF_WARM_LIGHT_THEME 控制(.env.local)、預設 false、不影響 production
 * ================================================================= */

:root {
  /* Warm Light 新增語意 token(dark 預設、不影響既有 dark 設計)*/
  /* 背景層(5 階)*/
  --bg-base: #080B16;
  --bg-raised: #0E1428;
  --bg-sunken: #060912;
  --bg-card: #111A30;
  --bg-card-hi: #15203A;

  /* 文字層(dark、AAA)*/
  --text-primary: #E8E4DE;
  --text-secondary: #B3B8C5;
  --text-muted: #7A8194;
  --text-on-gold: #0A0E1A;

  /* 朱砂(7 階、light 主強調用)*/
  --vermillion-50: #FBEEEB;
  --vermillion-300: #D87060;
  --vermillion-500: #C0392B;
  --vermillion-700: #8E2A1E;

  /* 金(dark 香檳金、AAA)*/
  --gold-50: #F8F1DE;
  --gold-300: #E0C679;
  --gold-500: #C9A84C;
  --gold-700: #8E6F2A;

  /* 線條 */
  --line: rgba(201, 168, 76, 0.18);
  --line-strong: rgba(201, 168, 76, 0.40);

  /* 主強調 alias(theme 動態決定)*/
  --accent-primary: var(--gold-500);
  --accent-secondary: var(--gold-300);

  /* line-height / letter-spacing 全站基準變數 */
  --leading-body: 1.75;
  --leading-heading: 1.25;
  --leading-classical: 1.85;
  --tracking-body: 0.02em;
  --tracking-heading: -0.01em;
  --tracking-eyebrow: 0.24em;
}

[data-theme="light"] {
  /* Warm Light 完整 token override(取代上方 :root dark 預設)*/
  --bg-base: #FAF6EE;            /* 暖白宣紙 */
  --bg-raised: #F2E8D5;          /* 米色抬升 */
  --bg-sunken: #FDF9F1;
  --bg-card: #FFFBF2;
  --bg-card-hi: #FAF1DE;

  --text-primary: #2A1F18;       /* AAA 14.90:1 暖墨黑 */
  --text-secondary: #5A4E42;     /* AAA 7.48:1 暖灰 */
  --text-muted: #7A6E62;         /* AA 4.60:1 弱輔助 */
  --text-on-gold: #FAF6EE;

  --vermillion-500: #C0392B;     /* AA 5.05:1 主朱砂 */
  --vermillion-700: #8E2A1E;     /* AAA 7.79:1 朱砂深 */

  --gold-300: #C9A864;           /* FAIL 2.10:1 ⚠️ 僅裝飾、勿作文字 */
  --gold-500: #8C5E1A;           /* AA 5.22:1 ✅ 主鎏金(NEW、取代 v0 FAIL #B8893B)*/
  --gold-700: #5C4416;           /* AAA 8.49:1 鎏金深 */

  --line: rgba(140, 94, 26, 0.22);
  --line-strong: rgba(92, 68, 22, 0.45);

  --color-success-light: #2E6B40;
  --color-danger-light: #A93429;
  --color-warning-light: #7A4E18;

  --accent-primary: var(--vermillion-500);
  --accent-secondary: var(--vermillion-300);
}

/* @custom-variant dark/light — Tailwind v4 自定義 variant 對齊 data-theme attribute */
@custom-variant dark (&:where([data-theme="dark"] *, [data-theme="dark"]));
@custom-variant light (&:where([data-theme="light"] *, [data-theme="light"]));

/* =================================================================
 * Phase 2 — 字體系統 + i18n typography
 * 規格 §3 §8;解 v0 P0-4 (padding 負值不合 CSS);加 L3 共識繁簡切換
 * ================================================================= */

/* 中文標點 OpenType feature(取代 v0 撒謊的 padding 負值)*/
:lang(zh-Hant) body,
:lang(zh-Hans) body,
:where(html:not([lang])) body {
  font-feature-settings: "palt" 1, "halt" 1;
  hanging-punctuation: first allow-end;
}

/* 簡繁字體 stack 切換 */
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
  border-left: 3px solid var(--gold-700);
  padding-left: 1.25em;
  margin: 1em 0;
  color: var(--text-secondary);
}

/* tabular-nums 給統計數字 / 定價 / 八字四柱 / 信心指數 */
.tabular {
  font-variant-numeric: tabular-nums;
}

/* R+8 #11 Onboarding modal 動畫 */'''

src = src.replace(MARKER, ADDITION, 1)

with open(GLOBALS, 'w', encoding='utf-8') as f:
    f.write(src)

print(f"✅ {GLOBALS} patched, final: {len(src.splitlines())} lines (delta +{len(src.splitlines()) - 1105})")
print(f"Tokens added: vermillion / gold-light / classical / lang switching / OpenType")
