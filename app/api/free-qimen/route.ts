import { NextRequest, NextResponse } from 'next/server'

// ============================================================
// 免費奇門遁甲排盤 API — 呼叫 Fly.io Python API + 格式轉換
// ============================================================

const PYTHON_API = 'https://fortune-reports-api.fly.dev'

// 宮名→數字映射
const GONG_NAME_TO_NUM: Record<string, string> = {
  '坎一': '1', '坤二': '2', '震三': '3', '巽四': '4',
  '中五': '5', '乾六': '6', '兌七': '7', '艮八': '8', '離九': '9',
}

// 將 Python API 格式轉換為前端期望格式
function transformApiData(data: Record<string, unknown>): Record<string, unknown> {
  const chart = (data.chart || {}) as Record<string, Record<string, unknown>>
  const palaces: Record<string, Record<string, unknown>> = {}

  for (const [gongName, gongData] of Object.entries(chart)) {
    const num = GONG_NAME_TO_NUM[gongName]
    if (!num) continue
    palaces[num] = {
      position: gongName,
      direction: gongData.direction || '',
      tianpan_gan: gongData.tianpan_gan || '',
      dipan_gan: gongData.dipan_gan || '',
      jiuxing: gongData.star || '',
      bamen: gongData.door || '',
      bashen: gongData.shen || '',
      geju: [
        ...(gongData.jige ? [gongData.jige] : []),
        ...(gongData.xiongge ? [gongData.xiongge] : []),
        ...(gongData.jiudun ? [gongData.jiudun] : []),
        ...((gongData.sanzha as string[]) || []),
        ...((gongData.menxingshen_combo as string[]) || []),
      ].filter(Boolean),
      kong: gongData.kongwang || false,
      fuyin: gongData.xing_fuyin || gongData.men_fuyin || false,
      fanyin: gongData.xing_fanyin || gongData.men_fanyin || false,
      menpo: gongData.menpo || false,
      is_jimen: gongData.is_jimen || false,
      is_jixing: gongData.is_jixing || false,
      is_jishen: gongData.is_jishen || false,
    }
  }

  // 從 ju 字串提取陰陽遁和局數（如 "陽遁1局"）
  const juStr = String(data.ju || '')
  const juMatch = juStr.match(/(陽遁|陰遁)(\d+)局/)
  const yinyang = juMatch ? juMatch[1] : (data.dun_type as string) || ''
  const juNumber = juMatch ? parseInt(juMatch[2]) : (data.ju_num as number) || 0

  // 收集吉格和凶格
  const jiGeju: string[] = []
  const xiongGeju: string[] = []
  for (const p of Object.values(palaces)) {
    const geju = (p.geju as string[]) || []
    for (const g of geju) {
      if (!g) continue
      // 簡單判斷：含「格」的多為凶格關鍵字
      if (['六儀擊刑', '門迫', '入墓', '反吟', '伏吟'].some(k => g.includes(k))) {
        if (!xiongGeju.includes(g)) xiongGeju.push(g)
      } else {
        if (!jiGeju.includes(g)) jiGeju.push(g)
      }
    }
  }

  return {
    pan_type: data.type || '時家奇門',
    yinyang,
    ju_number: juNumber,
    xunshou: data.xunshou || '',
    jieqi: data.jieqi || '',
    datetime: data.datetime || '',
    year_gz: data.year_gz || '',
    month_gz: data.month_gz || '',
    day_gz: data.day_gan || '',
    hour_gz: data.hour_gz || '',
    shichen: data.shichen || '',
    shichen_time: data.shichen_time || '',
    zhifu: data.zhifu_star || '',
    zhifu_gong: data.zhifu_gong || '',
    zhishi: data.zhishi_door || '',
    zhishi_gong: data.zhishi_gong || '',
    zhishi_analysis: data.zhishi_analysis || null,
    dun_method: data.pan_method || '',
    yuan_method: data.yuan_method || '',
    palaces,
    geju_summary: { ji: jiGeju, xiong: xiongGeju },
    kongwang_gongs: data.kongwang_gongs || [],
    tianyi_gongs: data.tianyi_gongs || [],
    yima_gong: data.yima_gong || '',
    nianming_gong: data.nianming_gong || '',
    wubuyu_shi: data.wubuyu_shi || null,
    chaoshen_jieqi: data.chaoshen_jieqi || null,
    tst_offset: data.tst_offset || 0,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      year, month, day, hour, minute = 0,
      pan_type = 'hour',
    } = body

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)

    const res = await fetch(`${PYTHON_API}/api/free-qimen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, day, hour, minute, pan_type }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const errText = await res.text().catch(() => '排盤失敗')
      return NextResponse.json(
        { detail: `排盤引擎錯誤：${errText}` },
        { status: res.status }
      )
    }

    const raw = await res.json()
    const transformed = transformApiData(raw as Record<string, unknown>)
    return NextResponse.json(transformed)
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json(
        { detail: '排盤引擎啟動中，請稍候再試（約需 10-15 秒）' },
        { status: 504 }
      )
    }
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : '排盤失敗，請稍後再試' },
      { status: 500 }
    )
  }
}
