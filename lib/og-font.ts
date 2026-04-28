// v5.7.10:Edge runtime OG image 中文字體 fetch helper(IA round 5 P0)
// v5.7.11:Codex + Gemini round 6 P0 — @vercel/og(Satori)優先支援 ttf/otf/woff、woff2 在舊版 satori 不支援
//   修法:① 用舊 v1 css endpoint(回 ttf URL)而非 v2(回 woff2)② regex 兼容 ttf/woff/woff2 ③ 加 3s timeout
// Edge runtime 預設無中文字體 fallback、不注入 fonts 中文會渲染為 □ 框框

let cachedFont: ArrayBuffer | null = null

export async function loadChineseFont(weight: 400 | 700 = 700): Promise<ArrayBuffer | null> {
  if (cachedFont) return cachedFont
  try {
    // 用舊 v1 css endpoint + 老瀏覽器 UA、Google Fonts 會回 ttf URL(Satori 穩定支援)
    const cssRes = await fetch(
      `https://fonts.googleapis.com/css?family=Noto+Sans+TC:${weight}&subset=chinese-traditional&display=swap`,
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko)' },
        signal: AbortSignal.timeout(3000),
      }
    )
    if (!cssRes.ok) return null
    const css = await cssRes.text()
    // 兼容 ttf / woff / woff2(優先 ttf > woff > woff2)
    const m = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.ttf)\)/)
      || css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff)\)/)
      || css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/)
    if (!m) return null
    const fontRes = await fetch(m[1], { signal: AbortSignal.timeout(3000) })
    if (!fontRes.ok) return null
    cachedFont = await fontRes.arrayBuffer()
    return cachedFont
  } catch {
    return null
  }
}

// 整合 ImageResponse fonts 配置(若 font fetch 失敗、回傳 undefined 讓 ImageResponse 走 fallback)
export async function getOGFonts(weight: 400 | 700 = 700) {
  const data = await loadChineseFont(weight)
  if (!data) return undefined
  return [{ name: 'NotoTC', data, style: 'normal' as const, weight }]
}
