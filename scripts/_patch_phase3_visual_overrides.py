#!/usr/bin/env python3
"""v5.10.395 Warm Light Theme v1.1 — Phase 3 B 類區視覺 override(CSS-only)

策略:不動既有 component .tsx、只在 globals.css 加 [data-theme="light"] selector overrides。
   - 風險最低、dark 模式完全不變(spec v1.0 不破壞)
   - light 模式 token 切換已由 Phase 1 處理、Phase 3 主要解 hero / stats / CTA 的視覺 hierarchy

規格 §5.2 / §5.4 / §5.12 / §5.16:
   - 5.2 Hero CTA gradient 暗模式金 → 亮模式朱砂、MouseGlow 朱砂 0.05
   - 5.4 統計區數字色 gold-700(避朱砂 above-the-fold 衝突)
   - 5.12 出門訣 token 自動切(無 override 必要)
   - 5.16 底部 CTA 鎏金 outline + 朱砂 hover(避朱砂從 hero 到 footer 視覺疲勞)
"""
import subprocess
import sys

GLOBALS = 'app/globals.css'

with open(GLOBALS, 'r', encoding='utf-8') as f:
    src = f.read()

# 掛載點:Phase 2 .tabular 結尾後、Onboarding modal 動畫之前
MARKER = '/* tabular-nums 給統計數字 / 定價 / 八字四柱 / 信心指數 */\n.tabular {\n  font-variant-numeric: tabular-nums;\n}\n\n/* R+8 #11 Onboarding modal 動畫 */'

if MARKER not in src:
    print("❌ Phase 3 marker not found(Phase 2 應該已 patched)")
    sys.exit(1)

ADDITION = '''/* tabular-nums 給統計數字 / 定價 / 八字四柱 / 信心指數 */
.tabular {
  font-variant-numeric: tabular-nums;
}

/* =================================================================
 * v5.10.395 Phase 3 — B 類區視覺 override(只動 light theme、dark 不變)
 * 規格 §5.2 / §5.4 / §5.12 / §5.16
 * 策略:CSS-only [data-theme="light"] override、不動既有 component .tsx
 * 受 NEXT_PUBLIC_FF_WARM_LIGHT_THEME 控制(JS 端 FF off 時 [data-theme] 預設 dark = 不生效)
 * ================================================================= */

/* 5.2 Hero — light 模式 CTA 漸層改朱砂(避純金底白字對暖白底對比不足)*/
[data-theme="light"] .btn-glow,
[data-theme="light"] .cta-primary-large {
  background: linear-gradient(135deg, var(--vermillion-500) 0%, var(--vermillion-700) 100%);
  color: var(--text-on-gold);
  box-shadow: 0 6px 20px rgba(192, 57, 43, 0.25);
}
[data-theme="light"] .btn-glow:hover,
[data-theme="light"] .cta-primary-large:hover {
  box-shadow: 0 10px 28px rgba(192, 57, 43, 0.40);
}

/* 5.2 Hero — Light 模式 .glass 卡片(取消重 backdrop-blur、改實底 + 微 shadow、Apple TW 風)*/
[data-theme="light"] .glass {
  background: var(--bg-card);
  border: 1px solid var(--line);
  box-shadow: 0 2px 8px rgba(42, 31, 24, 0.06);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

/* 5.4 統計區 — light 模式數字色改鎏金深(避朱砂從 Hero 用到統計、above-the-fold 三朱砂衝突)*/
[data-theme="light"] .stat-number,
[data-theme="light"] .text-gold:not(.no-light-override) {
  /* 既有 text-gold 用了既有 var(--color-gold)(香檳金、light 底 FAIL),light override 為鎏金深 */
  color: var(--gold-700);
}

/* 5.4 統計區 — icon 容器漸層在 light 模式改鎏金漸層 */
[data-theme="light"] .icon-gold-gradient,
[data-theme="light"] .bg-gold\\/15,
[data-theme="light"] .bg-gold\\/20 {
  background: linear-gradient(135deg, var(--gold-50) 0%, var(--gold-300) 50%, var(--gold-700) 100%);
}

/* 5.16 底部 CTA — light 模式主 CTA 改鎏金 outline + 朱砂 hover(避朱砂從 hero 到 footer 視覺疲勞)*/
[data-theme="light"] .cta-bottom-primary {
  background: transparent;
  color: var(--gold-700);
  border: 1.5px solid var(--gold-700);
  box-shadow: none;
}
[data-theme="light"] .cta-bottom-primary:hover {
  background: var(--vermillion-500);
  color: var(--text-on-gold);
  border-color: var(--vermillion-500);
}

/* 5.12 出門訣 — light 模式背景 + 邊框 */
[data-theme="light"] .chumenji-card,
[data-theme="light"] .chumenji-feature {
  background: var(--bg-card);
  border: 1px solid var(--gold-500);
}

/* Hero MouseGlow light 模式 — 改朱砂、強度降至 0.05 */
[data-theme="light"] .mouse-glow {
  background: radial-gradient(circle, rgba(192, 57, 43, 0.05) 0%, transparent 60%);
}

/* Scroll progress bar — light 模式 1px 鎏金深 0.6 透 */
[data-theme="light"] .scroll-progress-bar {
  height: 1px;
  background: rgba(92, 68, 22, 0.6);
}

/* RotatingZodiac — light 模式金線改鎏金深 + 降不透明度避眩光 */
[data-theme="light"] .rotating-zodiac {
  stroke: var(--gold-700);
  opacity: 0.55;
}

/* 5.7 14 系統卡片翻面 — light 模式背面改朱砂深底(保留「揭祕感」、L2 P0-4 修)*/
[data-theme="light"] .system-card-back {
  background: var(--vermillion-700);
  color: var(--text-on-gold);
}

/* 5.9 古籍區域容器 — light 模式紙紋(opacity ≤ 8%、L4 Round 3 P1 修)*/
[data-theme="light"] .classical-section {
  background-color: var(--bg-raised);
  /* 紙紋 SVG opacity ≤ 8%、避降低文字可讀性、Phase 4 補 SVG asset */
  background-image: none; /* placeholder、Phase 4 加 /textures/paper-grain-subtle.svg */
}

/* 5.13 創辦人 timeline — light 模式 line solid 鎏金深(取代 rgba 透明、L2 P0-4 修)*/
[data-theme="light"] .timeline-line {
  background: var(--gold-700);
  opacity: 1;
}
[data-theme="light"] .timeline-node {
  background: var(--vermillion-500);
}

/* R+8 #11 Onboarding modal 動畫 */'''

src = src.replace(MARKER, ADDITION, 1)

with open(GLOBALS, 'w', encoding='utf-8') as f:
    f.write(src)

print(f"✅ Phase 3 CSS overrides patched, {len(src.splitlines())} lines (delta from HEAD: {len(src.splitlines()) - 1105})")
