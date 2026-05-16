// 提示詞合集 Prompt 19 任務 A — 個人化封面 Pipeline
// ============================================================
// 輸入 (plan_code,user_name,dominant_element,chart_metadata)
// → 1200×1600 封面 + 1200×630 OG。風格鎖:Noto Serif TC bold /
// 朱漆紅 #B33A2E / 鑑源黑 #0A0A0A / 東方學術 minimal。
// 方案名從 lib/plan-names PLAN_NAMES(SSOT)。
//
// 🔴 自治邊界:本檔產出 deterministic SVG 封面(零外部 API、SHA256
//   可重現,合集驗收要求 deterministic)。nano-banana/canvas-design
//   skill 增強 = 需 skill runtime(老闆/staging 階段接);本基線先確保
//   8 方案 × 5 元素 = 40 張可 1 次生成。
// 註:合集列 .ts;用 .mjs(可直接 node 跑、無 ts-node 依賴)。
//
// 跑法:node scripts/generate-cover.mjs [--all] [--plan C --name 王某 --element 火]

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(REPO, '.generated_covers')

// SSOT 對齊 lib/plan-names PLAN_NAMES(此處鏡像、改方案以 lib 為準)
const PLAN_NAMES = {
  C: '人生藍圖', D: '心之所惑', G15: '家族藍圖', R: '合否?',
  E1: '事件擇吉', E2: '月度單盤', E3: '月度精選', E4: '年度全運',
}
const ELEMENTS = { 木: '#3f7d4f', 火: '#B33A2E', 土: '#9a7b3f', 金: '#c9b25a', 水: '#3f6a8a' }

function svgCover(plan, name, element, w, h) {
  const accent = ELEMENTS[element] || '#B33A2E'
  const planName = PLAN_NAMES[plan] || plan
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="#0A0A0A"/>
<g opacity="0.06" stroke="${accent}" stroke-width="1">
${Array.from({ length: 3 }, (_, i) => `<line x1="${(w / 3) * (i + 1)}" y1="0" x2="${(w / 3) * (i + 1)}" y2="${h}"/>`).join('')}
${Array.from({ length: 3 }, (_, i) => `<line x1="0" y1="${(h / 3) * (i + 1)}" x2="${w}" y2="${(h / 3) * (i + 1)}"/>`).join('')}
</g>
<rect x="${w * 0.12}" y="${h * 0.42}" width="${w * 0.16}" height="6" fill="${accent}"/>
<text x="${w * 0.12}" y="${h * 0.4}" fill="#888" font-family="Noto Serif TC,serif" font-size="${w * 0.028}">鑑源命理</text>
<text x="${w * 0.12}" y="${h * 0.54}" fill="#fff" font-family="Noto Serif TC,serif" font-weight="700" font-size="${w * 0.075}">${planName}</text>
<text x="${w * 0.12}" y="${h * 0.62}" fill="${accent}" font-family="Noto Serif TC,serif" font-size="${w * 0.04}">${name}</text>
<text x="${w * 0.12}" y="${h * 0.92}" fill="#555" font-family="Noto Serif TC,serif" font-size="${w * 0.022}">jianyuan.life</text>
</svg>`
}

function gen(plan, name, element) {
  mkdirSync(OUT, { recursive: true })
  const cover = svgCover(plan, name, element, 1200, 1600)
  const og = svgCover(plan, name, element, 1200, 630)
  const slug = `${plan}_${element}_${name}`.replace(/\W/g, '_')
  writeFileSync(join(OUT, `${slug}_cover.svg`), cover, 'utf-8')
  writeFileSync(join(OUT, `${slug}_og.svg`), og, 'utf-8')
  const sha = createHash('sha256').update(cover).digest('hex').slice(0, 12)
  console.log(`[ok] ${slug}  sha256=${sha}(deterministic)`)
}

const args = process.argv.slice(2)
if (args.includes('--all')) {
  for (const p of Object.keys(PLAN_NAMES))
    for (const el of Object.keys(ELEMENTS)) gen(p, '範例', el)
  console.log(`[done] 8 方案 × 5 元素 = ${Object.keys(PLAN_NAMES).length * Object.keys(ELEMENTS).length} 張`)
} else {
  const get = (k, d) => {
    const i = args.indexOf(k)
    return i >= 0 ? args[i + 1] : d
  }
  gen(get('--plan', 'C'), get('--name', '範例'), get('--element', '火'))
}
