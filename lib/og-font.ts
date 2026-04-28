// v5.7.10:Edge runtime OG image 中文字體 fetch helper(IA round 5 P0)
// Edge runtime 預設無中文字體 fallback、不注入 fonts 中文會渲染為 □ 框框
// 從 share-card/route.tsx 抽出、4 個 OG image 共用(pricing / faq / app root / report token)

let cachedFont: ArrayBuffer | null = null

export async function loadChineseFont(weight: 400 | 700 = 700): Promise<ArrayBuffer | null> {
  if (cachedFont) return cachedFont
  try {
    const cssRes = await fetch(
      `https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@${weight}&display=swap`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }
    )
    if (!cssRes.ok) return null
    const css = await cssRes.text()
    const m = css.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/)
    if (!m) return null
    const fontRes = await fetch(m[1])
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
