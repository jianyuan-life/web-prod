import { NextRequest, NextResponse } from 'next/server'
import { getZiweiProfile } from '@/lib/ziwei-profiles'
import { recordAIUsage } from '@/lib/ai-cost-tracker'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

// ============================================================
// 免費紫微斗數速算 — Python 排盤 + DeepSeek AI 解讀
// ============================================================

const PYTHON_API = 'https://fortune-reports-api.fly.dev'
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || ''
const KIMI_API = 'https://api.moonshot.cn/v1/chat/completions'
const KIMI_KEY = process.env.KIMI_API_KEY || ''

// ── 主星性質對照（用於 AI prompt 與顯示） ──
const STAR_NATURE: Record<string, string> = {
  '紫微': '帝星', '天機': '智慧星', '太陽': '光明星', '武曲': '財星',
  '天同': '福星', '廉貞': '次桃花星', '天府': '令星', '太陰': '富星',
  '貪狼': '桃花星', '巨門': '暗星', '天相': '印星', '天梁': '蔭星',
  '七殺': '將星', '破軍': '耗星',
}

// ── 四化星表（根據年干） ──
const SIHUA: Record<string, string[]> = {
  '甲': ['廉貞化祿', '破軍化權', '武曲化科', '太陽化忌'],
  '乙': ['天機化祿', '天梁化權', '紫微化科', '太陰化忌'],
  '丙': ['天同化祿', '天機化權', '文昌化科', '廉貞化忌'],
  '丁': ['太陰化祿', '天同化權', '天機化科', '巨門化忌'],
  '戊': ['貪狼化祿', '太陰化權', '右弼化科', '天機化忌'],
  '己': ['武曲化祿', '貪狼化權', '天梁化科', '文曲化忌'],
  '庚': ['太陽化祿', '武曲化權', '太陰化科', '天同化忌'],
  '辛': ['巨門化祿', '太陽化權', '文曲化科', '文昌化忌'],
  '壬': ['天梁化祿', '紫微化權', '左輔化科', '武曲化忌'],
  '癸': ['破軍化祿', '巨門化權', '太陰化科', '貪狼化忌'],
}

const TG_LIST = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // v5.2.2 修正：加收 latitude/longitude/timezone_offset/lunar_leap 讓免費和付費結果一致
    const {
      year, month, day, hour = 12, minute = 0, gender = 'M', name = '',
      calendar_type = 'solar',
      latitude = null,
      longitude = null,
      timezone_offset = 8.0,
      lunar_leap = false,
      time_unknown = false,
      time_mode = 'shichen',
    } = body

    if (!year || !month || !day) {
      return NextResponse.json({ detail: '請提供完整出生資料' }, { status: 400 })
    }

    // v5.3.34：範圍驗證
    const inRange = (v: unknown, min: number, max: number): boolean => {
      const n = Number(v)
      return Number.isFinite(n) && n >= min && n <= max
    }
    if (!inRange(year, 1900, 2100) || !inRange(month, 1, 12) || !inRange(day, 1, 31)) {
      return NextResponse.json({ detail: '出生日期超出範圍' }, { status: 400 })
    }
    if (!inRange(hour, 0, 23) || !inRange(minute, 0, 59)) {
      return NextResponse.json({ detail: '出生時辰超出範圍' }, { status: 400 })
    }
    if (gender !== 'M' && gender !== 'F') {
      return NextResponse.json({ detail: '性別格式錯誤' }, { status: 400 })
    }
    if (typeof name !== 'string' || name.length > 50) {
      return NextResponse.json({ detail: '姓名格式錯誤或過長' }, { status: 400 })
    }

    // 紫微斗數必須走 Python API — TS 無法正確排盤
    // v5.2.7：改用輕量 /api/free-ziwei 端點（正確回傳 palaces + wuxing_ju，不會 11 宮借星）
    let pythonData: Record<string, unknown> | null = null
    let mainStar = ''
    let yearTG = TG_LIST[((year - 4) % 10 + 10) % 10]
    let sihua = SIHUA[yearTG] || SIHUA['甲']
    // 十二宮位星曜資料：從 ziwei_basic_chart.palaces 轉換
    const palaceData: Record<string, { branch: string; mainStars: string; minorStars: string; palaceGan?: string; sihuaTag?: string[] }> = {}
    // 命主/身主/五行局/大限/流年等進階資料（/api/free-ziwei 不提供，保留空字串）
    let mingZhu = ''
    let shenZhu = ''
    let currentDaxian = ''
    let currentXiaoxian = ''
    let yearFlow = ''
    let daxianStars = ''
    const triplePairs: string[] = []
    const extraAnalyses = ''
    let wuxingJuNum = 0

    try {
      const pyRes = await fetch(`${PYTHON_API}/api/free-ziwei`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year, month, day, hour, gender,
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (pyRes.ok) {
        const pyJson = await pyRes.json()
        pythonData = pyJson
        // 五行局數（2/3/4/5/6）
        if (typeof pyJson.wuxing_ju_num === 'number') {
          wuxingJuNum = pyJson.wuxing_ju_num
        }
        // 生年干支
        if (pyJson.year_gan) {
          yearTG = String(pyJson.year_gan)
          sihua = SIHUA[yearTG] || sihua
        }
        // 十二宮位
        const palaces = (pyJson.palaces || {}) as Record<string, {
          dizhi: string
          tiangan?: string
          main_stars?: Array<{ name: string; brightness?: string }>
          sihua?: string[]
        }>
        for (const [palaceName, p] of Object.entries(palaces)) {
          const mainStarNames = (p.main_stars || []).map(s => s.name).filter(Boolean)
          const sihuaTags: string[] = []
          for (const s of (p.sihua || [])) {
            for (const t of ['祿', '權', '科', '忌']) {
              if (s.includes(`化${t}`) && !sihuaTags.includes(t)) sihuaTags.push(t)
            }
          }
          palaceData[palaceName] = {
            branch: p.dizhi || '',
            mainStars: mainStarNames.join('、'),
            minorStars: '',
            palaceGan: p.tiangan || '',
            sihuaTag: sihuaTags.length ? sihuaTags : undefined,
          }
          // 命宮主星
          if (palaceName === '命宮' && mainStarNames.length > 0) {
            mainStar = mainStarNames[0]
          }
        }
        // 備用：從 ming_stars_text 取命宮主星
        if (!mainStar && pyJson.ming_stars_text) {
          const firstStar = String(pyJson.ming_stars_text).split('、')[0].trim()
          if (firstStar && firstStar !== '無主星（借對宮）') mainStar = firstStar
        }
      }
    } catch {
      // Python API 不可用
    }

    // 如果 Python API 失敗且無法取得命宮主星，返回錯誤
    if (!mainStar) {
      return NextResponse.json({
        detail: '服務暫時忙碌，請稍後再試。紫微斗數排盤需要精確計算，目前系統負載較高。',
        retry: true,
      }, { status: 503 })
    }

    const profile = getZiweiProfile(mainStar) || getZiweiProfile('紫微')!
    const starNature = STAR_NATURE[mainStar] || '主星'

    // DeepSeek AI 深度解讀
    let aiAnalysis = ''
    const tDS = Date.now()
    try {
      const prompt = `你是一位紫微斗數大師。請根據以下命盤資料，用溫暖親切的口吻為${name || '此人'}做一段深度解讀（約800字）。

命宮主星：${mainStar}（${starNature}）
年干：${yearTG}
四化：${sihua.join('、')}
性別：${gender === 'M' ? '男' : '女'}
出生年：${year}

請包含：
1. 命宮主星的性格特質深度剖析
2. 四化星對命運的影響
3. 事業和財運方向
4. 感情和人際關係建議
5. 2026丙午年運勢提點

【格式要求】
- 全篇必須使用台灣繁體中文，不可出現任何簡體字（例如「稳/财/难/关/风/爱」等）
- 不要使用 Markdown 語法：不要有 ** 粗體、不要有 # 標題、不要有 - 符號
- 不要用「您好」或「親愛的」開頭，直接進入分析
- 語氣要像一位關心晚輩的長者，溫暖但有見地`

      const aiRes = await fetch(DEEPSEEK_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
        body: JSON.stringify({
          model: 'deepseek-chat', temperature: 0.8, max_tokens: 2000,
          messages: [
            { role: 'system', content: '你是專業的紫微斗數命理師，善於用溫暖的語言解讀命盤。回答必須使用台灣繁體中文（不可出現簡體字），且不可使用 Markdown 語法（不要 **粗體** 不要 # 標題）。' },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (aiRes.ok) {
        const aiJson = await aiRes.json()
        aiAnalysis = aiJson.choices?.[0]?.message?.content || ''
        try {
          await recordAIUsage({
            provider: 'deepseek', model: 'deepseek-chat',
            promptTokens: Number(aiJson?.usage?.prompt_tokens || 0),
            completionTokens: Number(aiJson?.usage?.completion_tokens || 0),
            callStage: 'free_ziwei', latencyMs: Date.now() - tDS,
            status: aiAnalysis ? 'success' : 'incomplete',
          })
        } catch { /* noop */ }
      } else {
        try {
          await recordAIUsage({
            provider: 'deepseek', model: 'deepseek-chat',
            promptTokens: 0, completionTokens: 0,
            callStage: 'free_ziwei', latencyMs: Date.now() - tDS,
            status: 'error', errorMessage: `HTTP ${aiRes.status}`,
          })
        } catch { /* noop */ }
      }
    } catch (e) {
      try {
        await recordAIUsage({
          provider: 'deepseek', model: 'deepseek-chat',
          promptTokens: 0, completionTokens: 0,
          callStage: 'free_ziwei', latencyMs: Date.now() - tDS,
          status: 'error', errorMessage: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
        })
      } catch { /* noop */ }
      // DeepSeek 失敗，嘗試 Kimi
      const tKimi = Date.now()
      try {
        const kimiRes = await fetch(KIMI_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KIMI_KEY}` },
          body: JSON.stringify({
            model: 'moonshot-v1-auto', temperature: 0.8, max_tokens: 2000,
            messages: [
              { role: 'system', content: '你是專業的紫微斗數命理師。回答必須使用台灣繁體中文（不可出現簡體字），不可使用 Markdown 語法。' },
              { role: 'user', content: `請為命宮${mainStar}（${starNature}）、${yearTG}年生的${gender === 'M' ? '男' : '女'}性做800字紫微斗數解讀（不要用 Markdown 粗體/標題符號）。` },
            ],
          }),
          signal: AbortSignal.timeout(30000),
        })
        if (kimiRes.ok) {
          const kimiJson = await kimiRes.json()
          aiAnalysis = kimiJson.choices?.[0]?.message?.content || ''
          try {
            await recordAIUsage({
              provider: 'moonshot', model: 'moonshot-v1-auto',
              promptTokens: Number(kimiJson?.usage?.prompt_tokens || 0),
              completionTokens: Number(kimiJson?.usage?.completion_tokens || 0),
              callStage: 'free_ziwei_fallback', latencyMs: Date.now() - tKimi,
              status: aiAnalysis ? 'success' : 'incomplete',
            })
          } catch { /* noop */ }
        } else {
          try {
            await recordAIUsage({
              provider: 'moonshot', model: 'moonshot-v1-auto',
              promptTokens: 0, completionTokens: 0,
              callStage: 'free_ziwei_fallback', latencyMs: Date.now() - tKimi,
              status: 'error', errorMessage: `HTTP ${kimiRes.status}`,
            })
          } catch { /* noop */ }
        }
      } catch (err) {
        try {
          await recordAIUsage({
            provider: 'moonshot', model: 'moonshot-v1-auto',
            promptTokens: 0, completionTokens: 0,
            callStage: 'free_ziwei_fallback', latencyMs: Date.now() - tKimi,
            status: 'error', errorMessage: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
          })
        } catch { /* noop */ }
      }
    }

    // 記錄用戶分析（去重）
    if (name && year && month && day) {
      const analyticsSupabase = createServiceClient()
      analyticsSupabase.from('user_analytics').upsert({
        name, birth_year: year, birth_month: month, birth_day: day, source: 'free-ziwei',
      }, { onConflict: 'name,birth_year,birth_month,birth_day' }).then(() => {}, () => {})
    }

    // 記錄免費工具使用
    const supabaseTrack = createServiceClient()
    supabaseTrack.from('free_tool_usage').insert({ client_name: `ziwei_${year}/${month}/${day}`, birth_year: year, gender, has_ai_result: true }).then(() => {}, () => {})

    return NextResponse.json({
      mainStar,
      starNature,
      starTitle: profile.title,
      personality: profile.personality,
      strengths: profile.strengths,
      challenges: profile.challenges,
      career: profile.career,
      love: profile.love,
      health: profile.health,
      lucky: profile.lucky,
      year2026: profile.year2026,
      palaceData,
      sihua,
      yearTG,
      wuxingju: wuxingJuNum || 0,
      // 進階欄位（從 Python detail 解析）
      mingZhu,
      shenZhu,
      currentDaxian,
      currentXiaoxian,
      yearFlow,
      daxianStars,
      triplePairs,
      extraAnalyses,
      aiAnalysis,
      hasAi: !!aiAnalysis,
      pythonData,
    })
  } catch (err) {
    console.error('紫微速算錯誤:', err)
    return NextResponse.json({ detail: '分析失敗，請稍後再試' }, { status: 500 })
  }
}
