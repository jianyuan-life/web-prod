// 🔧 臨時 debug endpoint（v5.10.439、v4 D/R/G15 wiring 真因定位用、讀完即刪 v5.10.440）
// 暴露:各 USE_PLAN_V4 env 原始值 + PLAN_SYSTEM_PROMPT['D'/'R'/'G15'] runtime 是 v4 還是 v2
// guard:?k=<ADMIN_KEY>
import { NextRequest, NextResponse } from 'next/server'
import { PLAN_SYSTEM_PROMPT } from '@/workflows/generate-report/plan-prompts'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const k = req.nextUrl.searchParams.get('k')
  if (!k || k !== process.env.ADMIN_KEY) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const probe = (code: string) => {
    const p = PLAN_SYSTEM_PROMPT[code] || ''
    return {
      len: p.length,
      // v4 D 結構獨有句 / v2 D 結構獨有句
      hasV4Marker: /為什麼是這個答案|精準診斷書|漸進式審閱|關係盡職調查|組織動力診斷/.test(p),
      hasV2Marker: /根源剖析|好的地方.*不好的地方|刻意練習/.test(p),
      first100: p.slice(0, 100),
    }
  }
  return NextResponse.json({
    env_raw: {
      C: JSON.stringify(process.env.USE_PLAN_V4_C),
      D: JSON.stringify(process.env.USE_PLAN_V4_D),
      G15: JSON.stringify(process.env.USE_PLAN_V4_G15),
      R: JSON.stringify(process.env.USE_PLAN_V4_R),
      V3: JSON.stringify(process.env.USE_PLAN_V3),
    },
    D: probe('D'),
    R: probe('R'),
    G15: probe('G15'),
    C: probe('C'),
  })
}
