import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getFullProfileByDayMaster, type DayMasterProfile } from '@/lib/profiles'
import { recordAIUsage } from '@/lib/ai-cost-tracker'
import { localBazi, BAZI_SX as SX } from '@/lib/bazi-local'

// ============================================================
// 免費命理速算 — Python排盤(+TS fallback) + Kimi AI 潤色
// 核心原則：就算 API 全掛，客戶也能看到豐富的命格分析
// 2026-05-06 R+12:localBazi 抽到 lib/bazi-local.ts 共用(報告頁 5 件套 fallback 也用)
// ============================================================

const PYTHON_API = 'https://fortune-reports-api.fly.dev'
// DeepSeek V3 主力，Kimi 備用
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || ''
const KIMI_API = 'https://api.moonshot.cn/v1/chat/completions'
const KIMI_KEY = process.env.KIMI_API_KEY || ''

// ── AI 呼叫（DeepSeek 主力 + Kimi 備用） ──
async function callAI(bazi: ReturnType<typeof localBazi>, name: string, year: number, month: number, day: number, hour: number, gender: string): Promise<Record<string,string>> {
  const age = 2026 - year
  const systemPrompt = '你是資深命理師。根據八字數據用台灣繁體中文給簡短精準的分析。每段2-3句，語氣溫暖專業。禁止使用 Markdown 語法（不要 **粗體** # 標題 - 符號）。注意：現在是2026年丙午年，所有預測要從2026年開始往後看，不要提到2024或2025。'
  const userPrompt = `${name}，${gender==='M'?'男':'女'}，${age}歲，八字${bazi.pillars.year} ${bazi.pillars.month} ${bazi.pillars.day} ${bazi.pillars.time}，日主${bazi.day_master}${bazi.day_master_wuxing}${bazi.strength}，${bazi.geju}，用神${bazi.yongshen}，五行金${bazi.wuxing_count['金']}木${bazi.wuxing_count['木']}水${bazi.wuxing_count['水']}火${bazi.wuxing_count['火']}土${bazi.wuxing_count['土']}

回覆格式（第一段最重要，要寫6-8句話；其他段各2-3句）：
【2026整體運勢】這是最重要的段落，要寫6-8句話！先講丙午年對此人命盤的整體影響（火勢如何作用於日主），再分析事業運、財運、感情運各一句，然後點出上半年和下半年的差異，最後給出今年最需要把握的一個機會和最需要避開的一個風險。要具體到讓人覺得「說到我心坎裡了」。
【性格深度剖析】像冷讀術般精準描述性格，先大特質再具體細節，3-4句
【財運方向】正財偏財哪個適合，投資風格建議，2-3句
【人際與貴人】什麼類型的人是貴人，什麼人要遠離，2-3句
【未來機會窗口】2026下半年到2028有什麼重要機會，只說一半留懸念用...結尾，2-3句
【需要留意的地方】一個注意事項+時間段，語氣關切，2-3句`

  const parseResponse = (text: string) => {
    const sections: Record<string,string> = {}
    for (const key of ['2026整體運勢','性格深度剖析','財運方向','人際與貴人','未來機會窗口','需要留意的地方']) {
      const m = text.match(new RegExp(`【${key}】[\\s\\n]*([\\s\\S]*?)(?=【|$)`))
      if (m) sections[key] = m[1].trim()
    }
    return sections
  }

  // 先試 DeepSeek
  const tDS = Date.now()
  try {
    const res = await fetch(DEEPSEEK_API, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DEEPSEEK_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        max_tokens: 1500, temperature: 0.7,
      }),
    })
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ''
    // v5.3.5 記帳：不管是否回傳，都 log
    try {
      await recordAIUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        promptTokens: Number(data?.usage?.prompt_tokens || 0),
        completionTokens: Number(data?.usage?.completion_tokens || 0),
        callStage: 'free_bazi',
        latencyMs: Date.now() - tDS,
        status: text ? 'success' : 'error',
        errorMessage: !text && !res.ok ? `HTTP ${res.status}` : undefined,
      })
    } catch { /* noop */ }
    if (text) {
      const sections = parseResponse(text)
      if (Object.keys(sections).length >= 3) return sections
    }
  } catch (e) {
    console.error('DeepSeek error:', e)
    try {
      await recordAIUsage({
        provider: 'deepseek', model: 'deepseek-chat',
        promptTokens: 0, completionTokens: 0,
        callStage: 'free_bazi', latencyMs: Date.now() - tDS,
        status: 'error', errorMessage: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
      })
    } catch { /* noop */ }
  }

  // DeepSeek 失敗，用 Kimi 備用
  const tKimi = Date.now()
  try {
    const res = await fetch(KIMI_API, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${KIMI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'moonshot-v1-8k',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        max_tokens: 1500, temperature: 0.7,
      }),
    })
    const data = await res.json()
    const text = data.choices?.[0]?.message?.content || ''
    try {
      await recordAIUsage({
        provider: 'moonshot',
        model: 'moonshot-v1-8k',
        promptTokens: Number(data?.usage?.prompt_tokens || 0),
        completionTokens: Number(data?.usage?.completion_tokens || 0),
        callStage: 'free_bazi_fallback',
        latencyMs: Date.now() - tKimi,
        status: text ? 'success' : 'error',
      })
    } catch { /* noop */ }
    return parseResponse(text)
  } catch (e) {
    console.error('Kimi fallback error:', e)
    try {
      await recordAIUsage({
        provider: 'moonshot', model: 'moonshot-v1-8k',
        promptTokens: 0, completionTokens: 0,
        callStage: 'free_bazi_fallback', latencyMs: Date.now() - tKimi,
        status: 'error', errorMessage: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
      })
    } catch { /* noop */ }
    return {}
  }
}

// ── 農曆→國曆轉換（純 TS 實現，覆蓋 1900-2100） ──
// 使用查表法，農曆每月大小月+閏月資訊
function lunarToSolar(lunarYear: number, lunarMonth: number, lunarDay: number): { year: number; month: number; day: number } | null {
  // 簡化版：呼叫 Python API 做轉換（lunar-python 庫最準確）
  // 如果 Python API 不可用，用近似公式
  // 這裡先返回 null，後面會呼叫 Python API
  return null
}

// ── 真太陽時校正 ──
function trueSolarTime(year: number, month: number, day: number, hour: number, minute: number, longitude: number, timezoneOffset: number): { hour: number; minute: number; adjusted: boolean; diff_minutes: number } {
  // 1. 地理時差：每個時區15度，偏差 = (經度 - 時區標準經度) × 4分鐘/度
  const standardLongitude = timezoneOffset * 15 // 例：UTC+8 → 120度
  const geoCorrection = (longitude - standardLongitude) * 4 // 分鐘

  // 2. 均時差（Equation of Time）：根據日期計算太陽快慢
  // 公式：B = 2π(N-81)/365，EoT = 9.87sin(2B) - 7.53cos(B) - 1.5sin(B)
  const N = dayOfYear(year, month, day)
  const B = (2 * Math.PI * (N - 81)) / 365
  const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B) // 分鐘

  // 3. 總校正 = 地理時差 + 均時差
  const totalCorrection = Math.round(geoCorrection + EoT)

  // 4. 校正時間
  let totalMinutes = hour * 60 + minute + totalCorrection
  if (totalMinutes < 0) totalMinutes += 24 * 60
  if (totalMinutes >= 24 * 60) totalMinutes -= 24 * 60

  const newHour = Math.floor(totalMinutes / 60)
  const newMinute = totalMinutes % 60

  return {
    hour: newHour,
    minute: newMinute,
    adjusted: totalCorrection !== 0,
    diff_minutes: totalCorrection,
  }
}

function dayOfYear(year: number, month: number, day: number): number {
  const dt = new Date(year, month - 1, day)
  const start = new Date(year, 0, 1)
  return Math.floor((dt.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1
}

export async function POST(req: NextRequest) {
  try {
    const { year: inputYear, month: inputMonth, day: inputDay, hour: inputHour, minute = 0, gender, name,
            calendar_type = 'solar', latitude, longitude, timezone_offset = 8, time_unknown = false } = await req.json()

    // v5.3.34：輸入範圍驗證（避免把 -99999 或 99999 丟進 localBazi / Python API）
    const inRange = (v: unknown, min: number, max: number): boolean => {
      const n = Number(v)
      return Number.isFinite(n) && n >= min && n <= max
    }
    if (!inRange(inputYear, 1900, 2100)) {
      return NextResponse.json({ detail: '出生年超出範圍（1900-2100）' }, { status: 400 })
    }
    if (!inRange(inputMonth, 1, 12) || !inRange(inputDay, 1, 31)) {
      return NextResponse.json({ detail: '出生月/日超出範圍' }, { status: 400 })
    }
    if (!inRange(inputHour, 0, 23) || !inRange(minute, 0, 59)) {
      return NextResponse.json({ detail: '出生時辰超出範圍' }, { status: 400 })
    }
    if (gender !== 'M' && gender !== 'F') {
      return NextResponse.json({ detail: '性別格式錯誤' }, { status: 400 })
    }
    if (name !== undefined && (typeof name !== 'string' || name.length > 50)) {
      return NextResponse.json({ detail: '姓名格式錯誤或過長' }, { status: 400 })
    }
    if (longitude !== undefined && longitude !== null && longitude !== 0 && !inRange(longitude, -180, 180)) {
      return NextResponse.json({ detail: '經度超出範圍' }, { status: 400 })
    }
    if (latitude !== undefined && latitude !== null && latitude !== 0 && !inRange(latitude, -90, 90)) {
      return NextResponse.json({ detail: '緯度超出範圍' }, { status: 400 })
    }
    if (timezone_offset !== undefined && !inRange(timezone_offset, -12, 14)) {
      return NextResponse.json({ detail: '時區超出範圍' }, { status: 400 })
    }

    // Step 0: 農曆→國曆轉換
    let year = inputYear, month = inputMonth, day = inputDay
    let lunarConverted = false

    if (calendar_type === 'lunar') {
      // 呼叫 Python API 做農曆轉換（lunar-python 最準確）
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(`${PYTHON_API}/api/lunar-to-solar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year: inputYear, month: inputMonth, day: inputDay }),
          signal: controller.signal,
        })
        clearTimeout(timeout)
        if (res.ok) {
          const data = await res.json()
          year = data.year; month = data.month; day = data.day
          lunarConverted = true
        }
      } catch {
        // Python API 不可用，用原始日期（提示用戶）
        console.error('農曆轉換失敗，使用原始日期')
      }
    }

    // Step 0.5: 真太陽時校正
    let hour = inputHour
    let solarTimeInfo = null
    if (longitude && longitude !== 0 && !time_unknown) {
      const correction = trueSolarTime(year, month, day, hour, minute, longitude, timezone_offset)
      hour = correction.hour
      solarTimeInfo = {
        original: `${inputHour}:${String(minute).padStart(2, '0')}`,
        corrected: `${correction.hour}:${String(correction.minute).padStart(2, '0')}`,
        diff_minutes: correction.diff_minutes,
        longitude,
      }
    }

    // Step 1: 嘗試 Python API，超時 20 秒就用 TS fallback（Fly.io 冷啟動通常 10-15 秒）
    let bazi: ReturnType<typeof localBazi>
    let isFallback = false
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 20000)
      const res = await fetch(`${PYTHON_API}/api/free-bazi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, day, hour, minute, gender, time_unknown, time_mode: time_unknown ? 'unknown' : 'exact' }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (res.ok) {
        bazi = await res.json()
      } else {
        bazi = localBazi(year, month, day, hour)
        isFallback = true
      }
    } catch {
      bazi = localBazi(year, month, day, hour)
      isFallback = true
    }

    // Step 2: 補齊生肖（Python API 可能沒返回）
    if (!bazi.shengxiao) {
      let sy = year
      if (month < 2 || (month === 2 && day < 4)) sy -= 1
      bazi.shengxiao = SX[(sy - 4) % 12]
    }

    // Step 3: 取得日主命格概述（永遠有內容，不依賴任何 API）
    const profile = (getFullProfileByDayMaster(bazi.day_master) || getFullProfileByDayMaster('甲')) as DayMasterProfile

    // Step 4: 直接呼叫 DeepSeek（不設 race timeout，Vercel 有 60 秒）
    let aiSections: Record<string,string> = {}
    try {
      aiSections = await callAI(bazi, name || '', year, month, day, hour, gender)
    } catch (e) { console.error('AI error:', e) }

    // Step 5: 太陽星座（從生日直接算）
    const zodiacSigns = [
      { name:'摩羯座', en:'Capricorn', start:[1,1], end:[1,19], element:'土象', trait:'務實穩重、目標明確、有耐心和毅力，是天生的管理者和長期規劃者' },
      { name:'水瓶座', en:'Aquarius', start:[1,20], end:[2,18], element:'風象', trait:'獨立創新、思想前衛、重視自由與理想，善於打破常規開創新局' },
      { name:'雙魚座', en:'Pisces', start:[2,19], end:[3,20], element:'水象', trait:'感性細膩、直覺敏銳、富有同理心和創造力，內心世界豐富深邃' },
      { name:'牡羊座', en:'Aries', start:[3,21], end:[4,19], element:'火象', trait:'行動力強、勇於開創、充滿熱情和競爭心，是天生的先鋒和領導者' },
      { name:'金牛座', en:'Taurus', start:[4,20], end:[5,20], element:'土象', trait:'穩定踏實、重視物質安全、審美品味高，在財務管理上有天賦' },
      { name:'雙子座', en:'Gemini', start:[5,21], end:[6,20], element:'風象', trait:'思維敏捷、善於溝通、好奇心旺盛，能同時處理多項事務' },
      { name:'巨蟹座', en:'Cancer', start:[6,21], end:[7,22], element:'水象', trait:'重視家庭、情感豐富、保護欲強，直覺準確且記憶力極佳' },
      { name:'獅子座', en:'Leo', start:[7,23], end:[8,22], element:'火象', trait:'自信大方、有領袖魅力、慷慨熱情，天生的舞台焦點和表演者' },
      { name:'處女座', en:'Virgo', start:[8,23], end:[9,22], element:'土象', trait:'細心嚴謹、追求完美、分析能力強，在專業領域能達到極致水準' },
      { name:'天秤座', en:'Libra', start:[9,23], end:[10,22], element:'風象', trait:'優雅和諧、善於社交、追求公平正義，有極高的審美和協調能力' },
      { name:'天蠍座', en:'Scorpio', start:[10,23], end:[11,21], element:'水象', trait:'意志堅定、洞察力強、感情深沉，一旦認定目標就不達目的不罷休' },
      { name:'射手座', en:'Sagittarius', start:[11,22], end:[12,21], element:'火象', trait:'樂觀開朗、追求自由與真理、視野寬廣，天生的探險家和哲學家' },
      { name:'摩羯座', en:'Capricorn', start:[12,22], end:[12,31], element:'土象', trait:'務實穩重、目標明確、有耐心和毅力，是天生的管理者和長期規劃者' },
    ]
    let sunSign = zodiacSigns[0]
    for (const z of zodiacSigns) {
      const [sm,sd] = z.start, [em,ed] = z.end
      if ((month === sm && day >= sd) || (month === em && day <= ed)) { sunSign = z; break }
    }

    // Step 6: 生命靈數
    const digits = `${year}${month}${day}`.split('').map(Number)
    let lifePathSum = digits.reduce((a,b) => a+b, 0)
    while (lifePathSum > 9 && lifePathSum !== 11 && lifePathSum !== 22) {
      lifePathSum = lifePathSum.toString().split('').map(Number).reduce((a,b) => a+b, 0)
    }
    const lifePathDesc: Record<number, { title: string; desc: string }> = {
      1: { title: '領導者', desc: '獨立自主、開創精神強。你天生就是帶頭的人，有強烈的個人意志和行動力。適合創業或擔任管理職。' },
      2: { title: '合作者', desc: '善於協調、重視和諧。你的天賦在於連結人與人之間的關係，是天生的調解者和支持者。適合諮詢、外交、服務業。' },
      3: { title: '表達者', desc: '創意豐富、善於溝通。你有極強的表達能力和藝術天賦，能把複雜的事情說得生動有趣。適合創作、行銷、教育。' },
      4: { title: '建造者', desc: '踏實穩健、重視秩序。你是最可靠的執行者，善於將藍圖變為現實。適合工程、金融、管理。' },
      5: { title: '自由者', desc: '追求變化、適應力強。你厭惡一成不變，需要多元體驗和冒險。適合旅遊、貿易、媒體。' },
      6: { title: '關懷者', desc: '有責任感、重視家庭。你天生有照顧人的本能，在家庭和社區中扮演重要角色。適合醫療、教育、社工。' },
      7: { title: '探索者', desc: '善於思考、追求真理。你的內心世界豐富，喜歡深入研究事物的本質。適合研究、科技、哲學。' },
      8: { title: '成就者', desc: '目標導向、有商業頭腦。你天生對權力和財富有敏銳的嗅覺，執行力極強。適合企業管理、投資、法律。' },
      9: { title: '智慧者', desc: '胸懷寬廣、有大愛精神。你能看到更大的格局，關心的不只是自己而是整個世界。適合慈善、藝術、靈性領域。' },
      11: { title: '啟示者', desc: '直覺極強、有靈性天賦。你是少數的大師數，能感受到別人感受不到的事物。適合靈性、心理學、藝術。' },
      22: { title: '大建築師', desc: '能將願景化為現實的少數人。你有改變世界的潛力和執行力。適合建築、大型項目、社會改革。' },
    }
    const lifePath = lifePathDesc[lifePathSum] || lifePathDesc[9]

    // 生肖詳細年運
    const shengxiaoYearFortune: Record<string, string> = {
      '鼠': '2026丙午年，屬鼠者逢沖太歲之年。上半年事業波動較大，但危中有機，適合主動求變而非被動等待。下半年運勢回穩，年底有意外之財的可能。感情方面單身者有機會遇到心動對象，已婚者需注意溝通，避免因工作壓力影響家庭關係。健康方面留意腸胃和睡眠品質。',
      '牛': '2026丙午年，屬牛者運勢穩中有升。事業方面貴人運不錯，可能有升遷或轉職的好機會，尤其在年中。財運方面正財穩定，偏財有小驚喜。感情上桃花運旺，單身者把握社交場合。健康整體良好，但要注意肩頸和腰背問題。',
      '虎': '2026丙午年，屬虎者進入三合年，整體運勢順遂。事業上有突破性的發展機會，適合開拓新領域或嘗試新項目。財運亨通，投資運不錯但需控制風險。感情和諧，家庭關係融洽。健康方面精力充沛，適合培養運動習慣。',
      '馬': '2026丙午年為本命年，屬馬者需特別留意。俗話說「太歲當頭坐，無喜恐有禍」，建議上半年低調行事，避免重大決策。下半年運勢好轉，事業上有貴人相助。財運方面守財為上，不宜大額投資。感情方面可能經歷考驗，但只要彼此坦誠，反而能加深感情。建議年初參拜太歲，佩戴紅色飾品。',
      '羊': '2026丙午年，屬羊者六合太歲，運勢極佳。事業上有重要的合作機會，貴人緣極強。財運旺盛，適合投資理財。感情甜蜜，已婚者家庭和樂，單身者有望脫單。健康良好，心情愉悅。今年是近幾年最好的年份之一。',
      '猴': '2026丙午年，屬猴者運勢中等偏上。事業方面有挑戰但也有突破口，關鍵在於能否抓住年中的一個重要機會。財運波動，上半年較緊，下半年好轉。感情方面需要多花心思經營。健康注意呼吸系統。',
      '雞': '2026丙午年，屬雞者桃花運旺但財運需謹慎。事業上有變動的可能，適合學習新技能提升競爭力。人際關係活躍，社交場合多。財運方面正財穩定，偏財要控制，不宜投機。感情豐富多彩。',
      '狗': '2026丙午年，屬狗者整體運勢不錯。事業穩步發展，有望獲得認可和獎勵。財運穩健，適合長期投資。感情方面和諧平穩，家庭關係融洽。健康方面注意保養關節和骨骼。',
      '豬': '2026丙午年，屬豬者財運亨通。事業上雖然壓力不小，但收穫也豐。下半年有一筆意外之財的可能。感情方面需要多陪伴家人，工作再忙也別忽略另一半。健康方面控制飲食，避免暴飲暴食。',
      '兔': '2026丙午年，屬兔者桃花運和人緣極佳。事業上適合拓展人脈，透過社交獲得新機會。財運中等，不適合大額投機。感情方面異性緣旺，已婚者要注意分寸。健康良好，心情愉快。',
      '龍': '2026丙午年，屬龍者氣勢如虹。事業上有大的突破機會，尤其在第二、三季度。財運旺盛，正財偏財都有進帳。但要注意不要因為太順而驕傲自滿。感情方面魅力四射，桃花朵朵。',
      '蛇': '2026丙午年，屬蛇者六合太歲（巳午），運勢極為順遂。事業上有重大晉升或轉職機會，貴人運極強。財運豐收，是近年最好的理財年份。感情和諧美滿。今年適合做重大人生決定。',
    }

    // 記錄用戶分析（去重，fire-and-forget）
    if (name && inputYear && inputMonth && inputDay) {
      const analyticsSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      )
      analyticsSupabase.from('user_analytics').upsert({
        name,
        birth_year: inputYear,
        birth_month: inputMonth,
        birth_day: inputDay,
        source: 'free',
      }, { onConflict: 'name,birth_year,birth_month,birth_day' }).then(
        () => {},
        () => {},
      )
    }

    // 記錄免費工具使用（不阻塞回應）
    const supabaseTrack = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
    supabaseTrack.from('free_tool_usage').insert({ client_name: `bazi_${year}/${month}/${day}`, birth_year: year, gender, has_ai_result: Object.keys(aiSections).length > 0 }).then(() => {}, () => {})

    return NextResponse.json({
      ...bazi,
      profile,
      ai_sections: aiSections,
      has_ai: Object.keys(aiSections).length > 0,
      sun_sign: { name: sunSign.name, element: sunSign.element, trait: sunSign.trait },
      life_path: { number: lifePathSum, ...lifePath },
      shengxiao_fortune: shengxiaoYearFortune[bazi.shengxiao] || '',
      // 真太陽時校正資訊
      solar_time: solarTimeInfo,
      // 農曆轉換資訊
      lunar_converted: lunarConverted,
      time_unknown,
      // 是否使用 TS fallback（近似節氣表，精確度約 95%）
      is_fallback: isFallback,
    })
  } catch (err) {
    console.error('free-bazi error:', err)
    // 不洩漏內部錯誤訊息給客戶端
    return NextResponse.json({ detail: '分析失敗，請稍後再試' }, { status: 500 })
  }
}
