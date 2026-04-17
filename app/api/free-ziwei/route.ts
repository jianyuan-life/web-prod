import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getZiweiProfile } from '@/lib/ziwei-profiles'

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

    // 紫微斗數必須走 Python API — TS 無法正確排盤
    let pythonData: Record<string, unknown> | null = null
    let mainStar = ''
    let yearTG = TG_LIST[((year - 4) % 10 + 10) % 10]
    let sihua = SIHUA[yearTG] || SIHUA['甲']
    // 十二宮位星曜資料：從 Python API tables 中提取
    const palaceData: Record<string, { branch: string; mainStars: string; minorStars: string }> = {}

    try {
      const pyRes = await fetch(`${PYTHON_API}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || '用戶',
          year, month, day, hour, minute, gender,
          calendar_type, lunar_leap, time_unknown, time_mode,
          latitude, longitude, timezone_offset,
        }),
        signal: AbortSignal.timeout(60000),
      })
      if (pyRes.ok) {
        const pyJson = await pyRes.json()
        // Python API 返回 analyses 陣列，找到紫微斗數的項目
        const analyses = pyJson?.analyses || []
        const ziweiAnalysis = analyses.find((a: { system: string }) => a.system === '紫微斗數')
        if (ziweiAnalysis) {
          pythonData = ziweiAnalysis
          // 從 tables 中找十二宮位資料
          // 表格格式：['命宮', '宮位地支', '主星（頓號分隔）', '輔星']
          const tables = ziweiAnalysis.tables || []
          const PALACE_NAMES = ['命宮', '兄弟宮', '夫妻宮', '子女宮', '財帛宮', '疾厄宮', '遷移宮', '交友宮', '事業宮', '田宅宮', '福德宮', '父母宮']
          for (const table of tables) {
            if (table.title?.includes('十二宮') || table.title?.includes('命盤') || table.title?.includes('主星')) {
              const rows = table.rows || []
              for (const row of rows) {
                const palaceName = String(row[0] || '').trim()
                if (PALACE_NAMES.includes(palaceName) && row.length > 2) {
                  const mainStarsCell = String(row[2] || '').trim()
                  const minorStarsCell = row.length > 3 ? String(row[3] || '').trim() : ''
                  const branchCell = String(row[1] || '').trim()
                  palaceData[palaceName] = {
                    branch: branchCell,
                    mainStars: mainStarsCell === '—' || mainStarsCell === '-' ? '' : mainStarsCell,
                    minorStars: minorStarsCell === '—' || minorStarsCell === '-' ? '' : minorStarsCell,
                  }
                  // 從命宮提取主星
                  if (palaceName === '命宮' && !mainStar) {
                    mainStar = mainStarsCell.split('、')[0].split('/')[0].split('（')[0].trim()
                    if (mainStar === '—' || mainStar === '-') mainStar = ''
                  }
                }
              }
            }
          }
          // 備用：從 details 或 summary 中提取主星
          if (!mainStar && ziweiAnalysis.summary) {
            const match = String(ziweiAnalysis.summary).match(/命宮主星[：:]\s*(\S+)/)
            if (match) mainStar = match[1]
          }
          // 再備用：從全文中找
          if (!mainStar) {
            const allText = JSON.stringify(ziweiAnalysis)
            const starNames = Object.keys(STAR_NATURE)
            for (const star of starNames) {
              if (allText.includes(`命宮`) && allText.includes(star)) {
                mainStar = star
                break
              }
            }
          }
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

語氣要像一位關心晚輩的長者，溫暖但有見地。不要用「您好」開頭，直接進入分析。`

      const aiRes = await fetch(DEEPSEEK_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
        body: JSON.stringify({
          model: 'deepseek-chat', temperature: 0.8, max_tokens: 2000,
          messages: [
            { role: 'system', content: '你是專業的紫微斗數命理師，善於用溫暖的語言解讀命盤。回答必須使用繁體中文。' },
            { role: 'user', content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (aiRes.ok) {
        const aiJson = await aiRes.json()
        aiAnalysis = aiJson.choices?.[0]?.message?.content || ''
      }
    } catch {
      // DeepSeek 失敗，嘗試 Kimi
      try {
        const kimiRes = await fetch(KIMI_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KIMI_KEY}` },
          body: JSON.stringify({
            model: 'moonshot-v1-auto', temperature: 0.8, max_tokens: 2000,
            messages: [
              { role: 'system', content: '你是專業的紫微斗數命理師。回答必須使用繁體中文。' },
              { role: 'user', content: `請為命宮${mainStar}（${starNature}）、${yearTG}年生的${gender === 'M' ? '男' : '女'}性做800字紫微斗數解讀。` },
            ],
          }),
          signal: AbortSignal.timeout(30000),
        })
        if (kimiRes.ok) {
          const kimiJson = await kimiRes.json()
          aiAnalysis = kimiJson.choices?.[0]?.message?.content || ''
        }
      } catch { /* AI 全部失敗，使用靜態內容 */ }
    }

    // 記錄用戶分析（去重）
    if (name && year && month && day) {
      const analyticsSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      )
      analyticsSupabase.from('user_analytics').upsert({
        name, birth_year: year, birth_month: month, birth_day: day, source: 'free-ziwei',
      }, { onConflict: 'name,birth_year,birth_month,birth_day' }).then(() => {}, () => {})
    }

    // 記錄免費工具使用
    const supabaseTrack = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
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
      wuxingju: (pythonData as Record<string, unknown>)?.wuxing_ju || '',
      aiAnalysis,
      hasAi: !!aiAnalysis,
      pythonData,
    })
  } catch (err) {
    console.error('紫微速算錯誤:', err)
    return NextResponse.json({ detail: '分析失敗，請稍後再試' }, { status: 500 })
  }
}
