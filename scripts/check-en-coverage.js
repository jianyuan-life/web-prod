// 英文翻譯覆蓋率檢查腳本（一次性，驗收用）
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const src = fs.readFileSync(path.join(ROOT, 'lib/i18n-en.ts'), 'utf8')

// 抽字典所有 key（支援同行多個 k:v）
const keys = new Set()
const re = /'([^']+)'\s*:/g
let m
while ((m = re.exec(src))) {
  keys.add(m[1])
}
const sortedKeys = Array.from(keys)
  .filter(k => /[一-鿿]/.test(k))
  .sort((a, b) => b.length - a.length)

const norm = s => s.replace(/\s+/g, ' ').trim()

const files = ['app/page.tsx', 'app/pricing/page.tsx', 'app/whitepaper/page.tsx']
let total = 0,
  hit = 0,
  partial = 0,
  missed = 0
const missedArr = []

for (const f of files) {
  let code = fs.readFileSync(path.join(ROOT, f), 'utf8')
  // 掉 JSX 注釋 {/* ... */}
  code = code.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  // 掉 JS 注釋
  code = code.replace(/\/\*[\s\S]*?\*\//g, '')
  // 掉 metadata 整塊（包含所有 title/keywords/OG 等——server-side only）
  const metaIdx = code.indexOf('export const metadata')
  if (metaIdx > -1) {
    let depth = 0,
      i = metaIdx
    while (i < code.length) {
      if (code[i] === '{') depth++
      else if (code[i] === '}') {
        depth--
        if (depth === 0) {
          i++
          break
        }
      }
      i++
    }
    code = code.slice(0, metaIdx) + code.slice(i)
  }

  const texts = new Set()

  // (a) JSX >...< 之間的 text-node
  const jsxText = />([^<>{}]+?)</g
  let mm
  while ((mm = jsxText.exec(code))) {
    const t = mm[1].replace(/&(\w+|#\d+);/g, '').trim()
    if (!/[一-鿿]{2,}/.test(t)) continue
    texts.add(t)
  }

  // (b) 物件字面值的中文字串（runtime render 成 text-node）
  const strRe = /['"]([^'"]{2,200})['"]/g
  while ((mm = strRe.exec(code))) {
    const s = mm[1]
    if (!/[一-鿿]{2,}/.test(s)) continue
    if (/^[a-z0-9\-\s]+$/.test(s)) continue
    texts.add(s.trim())
  }

  for (const s of texts) {
    total++
    if (keys.has(s) || keys.has(norm(s))) {
      hit++
      continue
    }
    let out = s
    let replaced = false
    for (const k of sortedKeys) {
      if (out.includes(k)) {
        out = out.split(k).join('_')
        replaced = true
      }
    }
    const remainCn = (out.match(/[一-鿿]/g) || []).length
    const origCn = (s.match(/[一-鿿]/g) || []).length
    const rate = origCn > 0 ? 1 - remainCn / origCn : 1
    if (rate >= 0.7) partial++
    else {
      missed++
      missedArr.push([path.basename(f), s.slice(0, 80), rate.toFixed(2)])
    }
  }
}

console.log('Dict CN keys:', sortedKeys.length)
console.log('Runtime-visible chinese strings:', total)
console.log('Exact hit:', hit)
console.log('Partial hit (>=70% replaced):', partial)
console.log('Missed:', missed)
console.log(
  'Coverage (exact+partial):',
  (((hit + partial) / total) * 100).toFixed(1) + '%'
)
console.log('Exact-only coverage:', ((hit / total) * 100).toFixed(1) + '%')
console.log('\n--- Sample missed (first 10) ---')
missedArr.slice(0, 10).forEach(m => console.log(m[0], '|', m[2], '|', m[1]))
