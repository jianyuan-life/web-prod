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

// v5.10.445 — 報告專用 sanitize（UI 稽核 §3 P2-1 空 <p> 灌水 + §2 P1-2 ol 重編號 之 post-sanitize 半）
//   真因:報告渲染把 block 元素(<blockquote>/<div>/<ol>/<table>)包進 <p class="report-p">，
//   sanitize-html 的 HTML5 重平衡會「在 block 前先關掉 <p>」→ 殘留大量空 <p></p>(C 報告 240 個)、
//   並可能把「同一個邏輯清單」拆成多段相鄰 <ol>/<ul>(項目間空行 → 空 <p> 隔開)。
//   兩者都是 sanitize「之後」才出現、renderer 端清不到、必須在 sanitize 後再清一次:
//   ① 刪「無實質內容」的 <p>(只含空白/&nbsp;/<br>)— 解過長 + 視覺鬆散。
//   ② 合併「僅以空白/空 <p>/<br> 相隔的相鄰 <ul>」(bullet 條列、無可見編號)→ 把「同一份條列被空行
//      拆成多段」還原為單一清單。**只合 <ul>、刻意不合 <ul>↔<ol> 也不合 <ol>+<ol>**:
//   🔒 為何 <ol> 不合併(對應 v5.10.445 IA L2 §3 wrong-merge finding、4 份真實報告 C/R/E1/E3 實測決策):
//      · <ol> 合併會「續編號」(1,2 + 1,2 → 1,2,3,4)。若 AI 在「同一 ### 子章節」下寫兩份「本意各自從 1 起算」
//        的編號清單、僅以空行相隔 → 合併會把它們錯接成連續編號(視覺可見的錯)。此結構雖罕見、但「結構上可能」、
//        不能只靠「真資料沒出現」就放行 → **乾脆不合 <ol>、徹底消除此 hazard**。
//      · 實測代價 = 0:真資料 C/R/E1/E3 共 0 個 <ol> 因「空白/空段」相鄰(E1 的 8 個 <ol>-gap 全有 prose 隔開、
//        本就不會被合併)→ 拿掉 <ol> 合併對真報告毫無功能損失、純風險消除。
//      · 真正的 P1-2「同一份編號清單被拆段重編號」在 renderInlineMarkdown 解決:連續 `1. 2. 3.` 行被
//        L911 的包裝 regex 收進「同一個 <ol>」、再由其後的 stripBrInList 清掉項目間 <br/>、不依賴此處合併。
//      · <ul>(disc bullet)無可見序號、即便極端情況把兩份 bullet 合在一起也「不產生錯誤的數字」、視覺中性 → 安全可合。
//   ⚠️ 純結構清理:只比對 <p>/<ul> 結構標籤、不碰任何文字內容;有內容的 <p> 一律保留。迴圈到 fixpoint
//      (可能①清空 <p> 後②才相鄰);每次 replace 皆「換空字串」→ 輸出單調縮短 → 必終止、無 ReDoS。
//   ⚠️ XSS:sanitize 先跑(同 safeHtml 的 SANITIZE_CONFIG)、post-pass 僅「移除」標籤(換空字串)、永不新增 → 零注入面。
export function safeReportHtml(html: string): string {
  let out = sanitizeHtml(html || '', SANITIZE_CONFIG)
  let prev: string
  do {
    prev = out
    out = out
      .replace(/<p\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>/g, '')
      // 只合 <ul>(無編號、合併視覺中性);<ol> 刻意不合(避免錯接續號、見上方 §3 說明)
      .replace(/<\/ul>(?:\s|<br\s*\/?>|<p[^>]*>\s*<\/p>)*<ul>/g, '')
  } while (out !== prev)
  return out
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
