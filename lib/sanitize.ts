// v5.10.88 — L5 Codex finding W1:8 處 dangerouslySetInnerHTML 統一 sanitize 入口
// v5.10.193 — L3 Codex P2:加 role + aria-* 到 allowlist
// v5.10.197 hot-fix — 從 isomorphic-dompurify 改 sanitize-html(純 JS、無 jsdom)
//
// 🔴 為什麼換 sanitize-html(2026-05-12 production 500 事故 root cause):
//   - isomorphic-dompurify 內部 `new JSDOM(...)` 在 Vercel Fluid Compute cold start
//     module load 失敗 → page.tsx 整個 SSR module 載入失敗 → /report + /blog 全 500
//   - v5.3.43 已移除 page.tsx 直接 import、但 v5.10.190 透過 lib/sanitize.ts 間接 reintroduce
//   - sanitize-html 純 JS、無 jsdom 依賴、Vercel Fluid Compute 安全
//
// 🔴 警告:**絕不要**在 production code 直接 / 間接 import isomorphic-dompurify
//   (透過 lib 也不行、Webpack/Turbopack 會 hoist 該套件、cold start 一樣 init JSDOM)
//
// API 保持不變:safeHtml(html: string): string
import sanitizeHtml from 'sanitize-html'

// sanitize-html 跟 DOMPurify 的 config schema 不同、需 map
//   DOMPurify ALLOWED_TAGS → sanitize-html allowedTags(同名陣列)
//   DOMPurify ALLOWED_ATTR → sanitize-html allowedAttributes(物件、'*': [...])
//   DOMPurify FORBID_TAGS → sanitize-html disallowedTagsMode + allowedTags 排除
//   DOMPurify FORBID_ATTR → 由 allowedAttributes 控制(白名單方式、不在 list 自動 drop)
const SANITIZE_CONFIG: sanitizeHtml.IOptions = {
  allowedTags: [
    'p','h1','h2','h3','h4','h5','h6','strong','em','u','s','ul','ol','li',
    'a','br','hr','blockquote','table','thead','tbody','tr','th','td',
    'code','pre','span','div','b','i','sup','sub',
    'details','summary',
  ],
  allowedAttributes: {
    '*': [
      'class','id','style','colspan','rowspan','align',
      // v5.10.193 accessibility:保留 renderSectionMarkdown card-stack 的 ARIA 語意
      'role','aria-label','aria-labelledby','aria-describedby',
    ],
    'a': ['href','target','rel','class','id','style'],
  },
  // disallowedTagsMode: 'discard' = 移除不在 allowedTags 內的標籤(default、跟 DOMPurify 行為一致)
  disallowedTagsMode: 'discard',
  // 不允許 data-* 屬性(對齊 DOMPurify ALLOW_DATA_ATTR: false)
  allowedSchemesAppliedToAttributes: ['href'],
  allowedSchemes: ['http','https','mailto'],
}

export function safeHtml(html: string): string {
  return sanitizeHtml(html || '', SANITIZE_CONFIG)
}

// v5.10.197 hot-fix blog 變體(blog 多 img + src/alt 屬性)
// 同樣 sanitize-html 純 JS、無 jsdom、Vercel Fluid Compute 安全
const BLOG_SANITIZE_CONFIG: sanitizeHtml.IOptions = {
  allowedTags: [
    'p','h1','h2','h3','h4','h5','h6','strong','em','u','s','ul','ol','li',
    'a','br','hr','blockquote','table','thead','tbody','tr','th','td',
    'code','pre','span','div','b','i','sup','sub',
    'img', // blog 變體加 img
  ],
  allowedAttributes: {
    '*': ['class','id','style','colspan','rowspan','align'],
    'a': ['href','target','rel','class','id','style'],
    'img': ['src','alt','width','height','loading','class','id','style'],
  },
  disallowedTagsMode: 'discard',
  allowedSchemesAppliedToAttributes: ['href','src'],
  allowedSchemes: ['http','https','mailto','data'], // img data: URI 允許
}

export function safeHtmlForBlog(html: string): string {
  return sanitizeHtml(html || '', BLOG_SANITIZE_CONFIG)
}
