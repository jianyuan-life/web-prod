function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character] ?? character)
}

function safeLocalPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || /[\p{Cc}\\]/u.test(value)) return '/dashboard'
  return escapeHtml(value)
}

export function createConsultationPdfUnavailablePage(input: {
  status: number
  reportHref: string
  retryHref: string
}): Response {
  const expired = input.status === 404
  const reportHref = safeLocalPath(input.reportHref)
  const retryHref = safeLocalPath(input.retryHref)
  const title = expired ? '下載連結已失效' : 'PDF 目前無法下載'
  const description = expired
    ? '請從「我的報告」重新開啟這份報告，再按一次下載。你的報告不會因此消失。'
    : '線上報告仍可正常閱讀，也不會重複扣款。你可以稍後再試，或先回到報告繼續閱讀。'
  const retryAction = expired
    ? ''
    : `<a class="primary" href="${retryHref}">再試一次</a>`

  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
  <title>${title}｜鑑源</title>
  <style>
    :root{color-scheme:light dark;--bg:#121616;--panel:#1e2321;--ink:#f3eee5;--muted:#bbb4aa;--line:rgba(214,181,111,.24);--accent:#dfbd74;--cta:#dfbd74;--cta-ink:#1b160f}
    @media(prefers-color-scheme:light){:root{--bg:#eee5d7;--panel:#fbf6ed;--ink:#2f2a24;--muted:#655e54;--line:rgba(111,78,38,.22);--accent:#7a531b;--cta:#983c2e;--cta-ink:#fffaf4}}
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;color:var(--ink);background:radial-gradient(circle at 82% 12%,color-mix(in srgb,var(--accent) 13%,transparent),transparent 26rem),var(--bg);font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif}
    main{width:min(100%,640px);padding:clamp(28px,6vw,52px);background:var(--panel);border:1px solid var(--line);border-radius:26px;box-shadow:0 30px 90px rgba(0,0,0,.25)}
    .kicker{margin:0 0 12px;color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.18em}h1{margin:0;color:var(--ink);font-family:Georgia,"Noto Serif TC",serif;font-size:clamp(32px,8vw,52px);line-height:1.15;letter-spacing:-.04em}p{margin:20px 0 0;color:var(--muted);line-height:1.85}.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}.actions a{min-height:46px;display:inline-flex;align-items:center;justify-content:center;padding:12px 17px;border-radius:12px;font-size:14px;font-weight:750;text-decoration:none}.primary{color:var(--cta-ink);background:var(--cta);border:1px solid color-mix(in srgb,var(--cta) 75%,black)}.secondary{color:var(--ink);border:1px solid var(--line)}.tertiary{color:var(--muted)}a:focus-visible{outline:2px solid var(--accent);outline-offset:3px}@media(max-width:480px){.actions{display:grid}.actions a{width:100%}}
  </style>
</head>
<body>
  <main>
    <p class="kicker">鑑源 · 私人報告</p>
    <h1>${title}</h1>
    <p>${description}</p>
    <nav class="actions" aria-label="後續操作">
      ${retryAction}
      <a class="secondary" href="${reportHref}">回到線上報告</a>
      <a class="tertiary" href="mailto:support@jianyuan.life">聯絡客服</a>
    </nav>
  </main>
</body>
</html>`

  return new Response(html, {
    status: input.status,
    headers: {
      'Cache-Control': 'private, no-store, no-cache, max-age=0, must-revalidate',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Content-Type': 'text/html; charset=utf-8',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
    },
  })
}
