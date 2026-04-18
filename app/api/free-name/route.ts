import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as OpenCC from 'opencc-js'
import { recordAIUsage } from '@/lib/ai-cost-tracker'

// ============================================================
// 免費姓名學速算 — 五格剖象法 + DeepSeek AI 解讀
// ============================================================

// 簡體→繁體轉換器（查康熙筆畫前用）
const s2tConverter = OpenCC.Converter({ from: 'cn', to: 'tw' })

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || ''
const KIMI_API = 'https://api.moonshot.cn/v1/chat/completions'
const KIMI_KEY = process.env.KIMI_API_KEY || ''

// ── 康熙字典筆畫資料庫（102,998 字，來源：Unicode Unihan kRSUnicode + 214 部首標準筆畫）──
import kangxiStrokesData from '@/lib/kangxi_strokes.json'
const KANGXI_STROKES: Record<string, number> = kangxiStrokesData as Record<string, number>

function getStrokes(char: string, unknownChars: string[]): number {
  if (KANGXI_STROKES[char] !== undefined) return KANGXI_STROKES[char]
  unknownChars.push(char)
  return 10 // 極少數查不到的字才會走到這裡
}

// 五格剖象法計算（支援四種姓名結構）
function calcWuge(surname: string, givenName: string, unknownChars: string[]) {
  const surnameStrokes = [...surname].map(c => getStrokes(c, unknownChars))
  const givenStrokes = [...givenName].map(c => getStrokes(c, unknownChars))

  const sLen = surnameStrokes.length
  const nLen = givenStrokes.length

  let tiange: number, renge: number, dige: number, waige: number, zongge: number

  if (sLen === 1 && nLen === 2) {
    // 單姓雙名（最常見：何宣逸、林志玲）
    const [A] = surnameStrokes
    const [B, C] = givenStrokes
    tiange = A + 1
    renge = A + B
    dige = B + C
    zongge = A + B + C
    waige = zongge - renge + 1  // 正確公式：總格-人格+1（何宣逸：31-16+1=16）
  } else if (sLen === 1 && nLen === 1) {
    // 單姓單名（如：王力）
    const [A] = surnameStrokes
    const [B] = givenStrokes
    tiange = A + 1
    renge = A + B
    dige = B + 1
    zongge = A + B
    waige = Math.max(zongge - renge + 1, 2)  // 單姓單名：總格-人格+1，最小為2
  } else if (sLen === 2 && nLen === 2) {
    // 複姓雙名（如：歐陽修文）
    const [A, B] = surnameStrokes
    const [C, D] = givenStrokes
    tiange = A + B
    renge = B + C
    dige = C + D
    zongge = A + B + C + D
    waige = zongge - renge + 1
  } else if (sLen === 2 && nLen === 1) {
    // 複姓單名（如：司馬遷）
    const [A, B] = surnameStrokes
    const [C] = givenStrokes
    tiange = A + B
    renge = B + C
    dige = C + 1
    zongge = A + B + C
    waige = zongge - renge + 1
  } else {
    // 通用兜底
    const sTotal = surnameStrokes.reduce((a, b) => a + b, 0)
    const nTotal = givenStrokes.reduce((a, b) => a + b, 0)
    tiange = sTotal + 1
    renge = sTotal + (givenStrokes[0] || 0)
    dige = nLen === 1 ? nTotal + 1 : nTotal
    zongge = sTotal + nTotal
    waige = Math.max(zongge - renge + 1, 2)
  }

  return { tiange, renge, dige, waige, zongge, surnameStrokes, givenStrokes }
}

// 數理吉凶判定（完整 81 數理，同步自 Python 後端 LINGDONG_81）
const JIXIONG: Record<number, { level: string; desc: string }> = {
  1: { level: '大吉', desc: '萬物開泰，富貴榮華，宇宙起源之象。' },
  2: { level: '凶', desc: '混沌未開，進退兩難，分離破敗。' },
  3: { level: '大吉', desc: '名利雙收，繁榮昌盛，進取如意。' },
  4: { level: '凶', desc: '萬事休止，退守保安，不宜進取。' },
  5: { level: '大吉', desc: '福祿長壽，中正剛健，循環相生。' },
  6: { level: '大吉', desc: '天德地祥，安穩吉慶，穩定繁榮。' },
  7: { level: '吉', desc: '剛毅果斷，獨立自主，力行進取。' },
  8: { level: '吉', desc: '堅忍克己，意志剛健，富於進取。' },
  9: { level: '凶', desc: '物極必反，盛極轉衰，窮乏困苦。' },
  10: { level: '凶', desc: '萬事終局，空虛無常，零落孤獨。' },
  11: { level: '大吉', desc: '春生萬物，發展順調，富貴繁榮。' },
  12: { level: '凶', desc: '薄弱無力，孤立無援，意志薄弱。' },
  13: { level: '大吉', desc: '智略超群，才藝多能，博學多才。' },
  14: { level: '凶', desc: '家庭緣薄，孤獨遭難，離祖破家。' },
  15: { level: '大吉', desc: '福壽圓滿，興家聚財，慈祥有德。' },
  16: { level: '大吉', desc: '貴人得助，天乙貴人，興家成業。' },
  17: { level: '吉', desc: '突破萬難，排除困境，剛柔兼備。' },
  18: { level: '吉', desc: '有志竟成，經商做官，內外有運。' },
  19: { level: '凶', desc: '風雲蔽月，智謀優秀但運途多障。' },
  20: { level: '凶', desc: '非業破運，百事不成，災難叢生。' },
  21: { level: '大吉', desc: '光風霽月，獨立權威，萬象更新。' },
  22: { level: '凶', desc: '秋草逢霜，百事不如意，志氣薄弱。' },
  23: { level: '大吉', desc: '旭日東升，壯麗壯觀，功名榮達。' },
  24: { level: '大吉', desc: '家門餘慶，金錢豐盈，白手起家。' },
  25: { level: '吉', desc: '才略智謀，英敏之才，奇謀妙計。' },
  26: { level: '凶帶吉', desc: '變怪奇異，英雄豪傑，波瀾重疊。' },
  27: { level: '凶帶吉', desc: '增長之象，欠恆心，中年不利。' },
  28: { level: '凶', desc: '家親緣薄，離群孤獨，豪傑氣概但孤掌難鳴。' },
  29: { level: '大吉', desc: '財力歸集，名聞海內，成就大業。' },
  30: { level: '凶帶吉', desc: '吉凶參半，得失相伴，投機取巧。' },
  31: { level: '大吉', desc: '智仁勇俱，可享清福，安泰吉祥。' },
  32: { level: '大吉', desc: '僥倖多望，貴人得助，財帛如裕。' },
  33: { level: '大吉', desc: '鸞鳳相會，家門隆昌，功威顯達。' },
  34: { level: '凶', desc: '破家亡身，見識短小，災厄不絕。' },
  35: { level: '吉', desc: '溫和平靜，智達通暢，文昌技藝。' },
  36: { level: '凶', desc: '風浪不平，俠義薄運，曲折波瀾。' },
  37: { level: '吉', desc: '權威顯達，忠實誠信，萬人仰望。' },
  38: { level: '凶帶吉', desc: '意志薄弱，藝術成功，學者技術。' },
  39: { level: '大吉', desc: '富貴榮華，財帛豐盈，暗藏險象。' },
  40: { level: '凶', desc: '智謀膽力，冒險投機，沉浮不定。' },
  41: { level: '大吉', desc: '純陽獨秀，德望兼備，萬象吉祥。' },
  42: { level: '凶帶吉', desc: '博達多能，精力旺盛，中途挫折。' },
  43: { level: '凶', desc: '散財破產，諸事不遂，雖有智謀難成大事。' },
  44: { level: '凶', desc: '破家亡身，暗藏慘淡，事不如意。' },
  45: { level: '大吉', desc: '新生泰和，順風揚帆，智謀經緯。' },
  46: { level: '凶', desc: '載寶沉舟，浪裡淘金，有才無命。' },
  47: { level: '大吉', desc: '花開之象，萬事如意，名利雙收。' },
  48: { level: '大吉', desc: '智謀兼備，德量隆盛，能奏大功。' },
  49: { level: '凶帶吉', desc: '吉臨則吉，凶來則凶，轉凶為吉靠智慧。' },
  50: { level: '凶帶吉', desc: '一成一敗，吉凶參半，先成後敗。' },
  51: { level: '凶帶吉', desc: '盛衰交加，盈虧不定，一成一敗。' },
  52: { level: '大吉', desc: '先見之明，卓識達眼，功利榮達。' },
  53: { level: '凶帶吉', desc: '內外不和，障礙重重，盛衰參半。' },
  54: { level: '凶', desc: '多難悲運，災厄連連，難得成功。' },
  55: { level: '凶帶吉', desc: '外美內苦，和順薄幸，半吉半凶。' },
  56: { level: '凶', desc: '歷盡艱辛，四周障礙，萬事落空。' },
  57: { level: '大吉', desc: '寒雪青松，夜行逢月，努力必成。' },
  58: { level: '凶帶吉', desc: '沉浮多端，先苦後甜，寬宏大量。' },
  59: { level: '凶', desc: '須防悲愁，不遇時運，智謀過人但運途不濟。' },
  60: { level: '凶', desc: '無定意志，暗黑無光，動搖不安。' },
  61: { level: '大吉', desc: '桃花芙蓉，名利雙收，富貴榮華。' },
  62: { level: '凶', desc: '基礎虛弱，內外不和，意志薄弱。' },
  63: { level: '大吉', desc: '萬物化育，繁榮之象，專心一意。' },
  64: { level: '凶', desc: '沉滯不達，禍亂疊至，骨肉分離。' },
  65: { level: '大吉', desc: '天長地久，家運隆昌，富貴長壽。' },
  66: { level: '凶', desc: '內外不和，進退維谷，煩悶失志。' },
  67: { level: '大吉', desc: '利路亨通，萬事順暢，天賜吉祥。' },
  68: { level: '大吉', desc: '興家立業，智慧達人，順風得利。' },
  69: { level: '凶', desc: '坐立不安，動盪不定，病弱短命。' },
  70: { level: '凶', desc: '家庭凶象，春寒牡丹，凋落蕭條。' },
  71: { level: '凶帶吉', desc: '吉中有凶，安享福德，有利有害。' },
  72: { level: '凶', desc: '前半吉後半凶，萬事不利。' },
  73: { level: '吉', desc: '平安中帶吉，高處勝境。' },
  74: { level: '凶', desc: '無勇無謀，消沉退守，不宜進取。' },
  75: { level: '凶帶吉', desc: '守成有餘，進取不足，半吉半凶。' },
  76: { level: '凶', desc: '前途渺茫，家庭不安，凶禍重重。' },
  77: { level: '凶帶吉', desc: '先甘後苦，早年有運晚年不濟。' },
  78: { level: '凶帶吉', desc: '先安後困，半吉半凶，晚年困頓。' },
  79: { level: '凶', desc: '窮途末路，知難而退，身陷困境。' },
  80: { level: '凶', desc: '退藏於密，萬事終止，如同歸零。' },
  81: { level: '大吉', desc: '等同於1，萬象回春，重新開始。' },
}

function getJixiong(num: number): { level: string; desc: string } {
  const n = num > 81 ? num - 80 : (num <= 0 ? 1 : num)
  return JIXIONG[n] || { level: '凶', desc: '此數理較為波折，宜以德行化解。' }
}

// 五行對應
function numToWuxing(n: number): string {
  const last = n % 10
  if (last === 1 || last === 2) return '木'
  if (last === 3 || last === 4) return '火'
  if (last === 5 || last === 6) return '土'
  if (last === 7 || last === 8) return '金'
  return '水' // 9, 0
}

// 三才配置
function getSancai(tiange: number, renge: number, dige: number) {
  const t = numToWuxing(tiange)
  const r = numToWuxing(renge)
  const d = numToWuxing(dige)
  return { tian: t, ren: r, di: d, config: `${t}${r}${d}` }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { surname, givenName, gender = 'M', year, month, day } = body

    if (!surname || !givenName) {
      return NextResponse.json({ detail: '請提供姓和名' }, { status: 400 })
    }

    // 保留用戶原始輸入（可能是簡體），用於前端顯示
    const originalSurname = surname
    const originalGivenName = givenName
    const originalFullName = originalSurname + originalGivenName

    // 轉繁體查康熙筆畫（康熙字典用繁體字）
    const tcSurname = s2tConverter(surname)
    const tcGivenName = s2tConverter(givenName)

    // 五格計算（用繁體字查筆畫）
    const unknownChars: string[] = []
    const wuge = calcWuge(tcSurname, tcGivenName, unknownChars)
    const fullName = originalFullName

    // 各格吉凶
    const tiangeJx = getJixiong(wuge.tiange)
    const rengeJx = getJixiong(wuge.renge)
    const digeJx = getJixiong(wuge.dige)
    const waigeJx = getJixiong(wuge.waige)
    const zonggeJx = getJixiong(wuge.zongge)

    // 三才配置
    const sancai = getSancai(wuge.tiange, wuge.renge, wuge.dige)

    // 五行
    const tiangeWx = numToWuxing(wuge.tiange)
    const rengeWx = numToWuxing(wuge.renge)
    const digeWx = numToWuxing(wuge.dige)
    const waigeWx = numToWuxing(wuge.waige)
    const zonggeWx = numToWuxing(wuge.zongge)

    // 綜合評分（基於五格吉凶）
    const scoreMap: Record<string, number> = { '大吉': 95, '吉': 82, '凶帶吉': 65, '凶': 40 }
    const scores = [tiangeJx, rengeJx, digeJx, waigeJx, zonggeJx].map(jx => scoreMap[jx.level] || 60)
    // 人格和總格權重最高
    const totalScore = Math.round(scores[0] * 0.1 + scores[1] * 0.3 + scores[2] * 0.2 + scores[3] * 0.1 + scores[4] * 0.3)

    // DeepSeek AI 深度解讀
    let aiAnalysis = ''
    try {
      const prompt = `你是一位姓名學大師。請根據以下姓名分析結果，用溫暖親切的口吻為「${fullName}」做一段深度解讀（約600字）。

姓名：${fullName}（${gender === 'M' ? '男' : '女'}）
天格 ${wuge.tiange}（${tiangeWx}）— ${tiangeJx.level}
人格 ${wuge.renge}（${rengeWx}）— ${rengeJx.level}：${rengeJx.desc}
地格 ${wuge.dige}（${digeWx}）— ${digeJx.level}：${digeJx.desc}
外格 ${wuge.waige}（${waigeWx}）— ${waigeJx.level}
總格 ${wuge.zongge}（${zonggeWx}）— ${zonggeJx.level}：${zonggeJx.desc}
三才配置：${sancai.config}（${sancai.tian}-${sancai.ren}-${sancai.di}）
綜合評分：${totalScore}/100

請包含：
1. 姓名整體評價（從五格數理綜合分析）
2. 人格解讀（性格、天賦、人際）
3. 事業和財運暗示
4. 感情和家庭運
5. 改善建議（如果有凶格）

【格式要求】
- 全篇必須使用台灣繁體中文
- 不要使用 Markdown 語法：不要 ** 粗體、不要 # 標題、不要 - 符號、不要任何星號
- 不要用「您好」開頭，直接進入分析
- 語氣要溫暖親切`

      const tDS = Date.now()
      const aiRes = await fetch(DEEPSEEK_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEEPSEEK_KEY}` },
        body: JSON.stringify({
          model: 'deepseek-chat', temperature: 0.8, max_tokens: 2000,
          messages: [
            { role: 'system', content: '你是專業的姓名學命理師，善於用溫暖的語言解讀姓名五格。回答必須使用台灣繁體中文，且不可使用 Markdown 語法（禁用 **粗體** # 標題 - 符號）。' },
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
            callStage: 'free_name', latencyMs: Date.now() - tDS,
            status: aiAnalysis ? 'success' : 'incomplete',
          })
        } catch { /* noop */ }
      } else {
        try {
          await recordAIUsage({
            provider: 'deepseek', model: 'deepseek-chat',
            promptTokens: 0, completionTokens: 0,
            callStage: 'free_name', latencyMs: Date.now() - tDS,
            status: 'error', errorMessage: `HTTP ${aiRes.status}`,
          })
        } catch { /* noop */ }
      }
    } catch (e) {
      try {
        await recordAIUsage({
          provider: 'deepseek', model: 'deepseek-chat',
          promptTokens: 0, completionTokens: 0,
          callStage: 'free_name', latencyMs: 0,
          status: 'error', errorMessage: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
        })
      } catch { /* noop */ }
      const tKimi = Date.now()
      try {
        const kimiRes = await fetch(KIMI_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KIMI_KEY}` },
          body: JSON.stringify({
            model: 'moonshot-v1-auto', temperature: 0.8, max_tokens: 2000,
            messages: [
              { role: 'system', content: '你是專業的姓名學命理師。回答必須使用台灣繁體中文，不可使用 Markdown 語法。' },
              { role: 'user', content: `請為「${fullName}」（人格${wuge.renge}${rengeJx.level}、總格${wuge.zongge}${zonggeJx.level}）做600字姓名學解讀。` },
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
              callStage: 'free_name_fallback', latencyMs: Date.now() - tKimi,
              status: aiAnalysis ? 'success' : 'incomplete',
            })
          } catch { /* noop */ }
        } else {
          try {
            await recordAIUsage({
              provider: 'moonshot', model: 'moonshot-v1-auto',
              promptTokens: 0, completionTokens: 0,
              callStage: 'free_name_fallback', latencyMs: Date.now() - tKimi,
              status: 'error', errorMessage: `HTTP ${kimiRes.status}`,
            })
          } catch { /* noop */ }
        }
      } catch (err) {
        try {
          await recordAIUsage({
            provider: 'moonshot', model: 'moonshot-v1-auto',
            promptTokens: 0, completionTokens: 0,
            callStage: 'free_name_fallback', latencyMs: Date.now() - tKimi,
            status: 'error', errorMessage: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
          })
        } catch { /* noop */ }
      }
    }

    // 記錄用戶分析（去重）
    if (fullName && year && month && day) {
      const analyticsSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      )
      analyticsSupabase.from('user_analytics').upsert({
        name: fullName, birth_year: year, birth_month: month, birth_day: day, source: 'free-name',
      }, { onConflict: 'name,birth_year,birth_month,birth_day' }).then(() => {}, () => {})
    }

    // 記錄免費工具使用
    const supabaseTrack = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')
    supabaseTrack.from('free_tool_usage').insert({ client_name: `name_${originalFullName}`, birth_year: year || null, gender: gender || null, has_ai_result: true }).then(() => {}, () => {})

    return NextResponse.json({
      fullName: originalFullName,
      surname: originalSurname,
      givenName: originalGivenName,
      surnameStrokes: wuge.surnameStrokes,
      givenStrokes: wuge.givenStrokes,
      tiange: { value: wuge.tiange, wuxing: tiangeWx, ...tiangeJx },
      renge: { value: wuge.renge, wuxing: rengeWx, ...rengeJx },
      dige: { value: wuge.dige, wuxing: digeWx, ...digeJx },
      waige: { value: wuge.waige, wuxing: waigeWx, ...waigeJx },
      zongge: { value: wuge.zongge, wuxing: zonggeWx, ...zonggeJx },
      sancai,
      totalScore,
      aiAnalysis,
      hasAi: !!aiAnalysis,
    })
  } catch (err) {
    console.error('姓名學速算錯誤:', err)
    return NextResponse.json({ detail: '分析失敗，請稍後再試' }, { status: 500 })
  }
}
