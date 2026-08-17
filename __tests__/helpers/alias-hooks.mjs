// v5.10.492:讓 node --experimental-strip-types 能直接載入用 '@/' 路徑別名的
// production 模組(tsconfig paths 對應專案根目錄)。只做解析映射,不改任何來源碼——
// 測試必須測到真模組本身(v5.10.483 投影事故/測試 08 mock 重寫版的同型教訓)。
import { registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const EXTS = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx']

function probe(base) {
  for (const ext of EXTS) {
    const candidate = base + ext
    if (existsSync(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true }
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // 1) '@/xxx' → 專案根目錄
    if (specifier.startsWith('@/')) {
      const hit = probe(path.join(ROOT, specifier.slice(2)))
      if (hit) return hit
    }
    // 2) 無副檔名的相對匯入(TS 慣例 './d_plan_v2')→ 補副檔名探測
    if (specifier.startsWith('.') && !path.extname(specifier) && context.parentURL) {
      const parentDir = path.dirname(new URL(context.parentURL).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
      const hit = probe(path.resolve(decodeURIComponent(parentDir), specifier))
      if (hit) return hit
    }
    return nextResolve(specifier, context)
  },
})
