// 奇門遁甲白話文產生器 — 規則表 fallback
// v5.3.14（2026-04-18）
//
// 用途：當 AI 沒生成 plain_advantage / plain_purpose 時，前端用規則表產出通用白話說明
// 優先順序：AI 個人化版 > 規則表通用版 > 預設說明
//
// 規則來源：以「八門」為主軸（奇門遁甲選時的核心），九星/八神做微調

// 八門對應白話（主體）
interface BamenMeaning {
  essence: string         // 一句話本質
  advantage: string       // 盤的優勢（2-3 句）
  purposes: string[]      // 最適合做什麼（3-4 項）
  avoid?: string          // 要小心什麼
}

const BAMEN_PLAIN: Record<string, BamenMeaning> = {
  '開門': {
    essence: '最有開創能量的時段',
    advantage: '這是整個時段裡「啟動新事物」能量最強的黃金窗口。天地給你「推進」的通道，推動平時不敢動的決策會比其他時間順得多。貴人、長輩、權威人物對你的回應會比平常明顯更友善。',
    purposes: [
      '開會提大膽提案、主動拜訪決策者',
      '簽下拖了很久的合約、談重要的合作',
      '處理跟長輩/主管/父執輩的重要對話',
    ],
  },
  '休門': {
    essence: '最適合「以靜制動」的時段',
    advantage: '這時段不是往前衝的能量，而是「沉澱、修復、貴人自己來找你」的空間。你不用主動出擊，反而該把自己調到低速檔——讓好事自然進來。強行工作反而會浪費這個時段的力量。',
    purposes: [
      '閉關整理思緒、做策略規劃',
      '接待主動來訪的客戶或朋友',
      '身體調養、冥想、閱讀、靜心',
    ],
  },
  '生門': {
    essence: '最有「財運」和「發展性」的時段',
    advantage: '這時段的能量偏向「產出、收成、增值」。你在這段時間啟動的事情，未來更容易長大變成實質的收入或發展。不要浪費在消耗型活動上——把它用在能「生根發芽」的事上。',
    purposes: [
      '談合作、洽談報價、投標',
      '拜訪潛在客戶、拓展業務',
      '投資決策、簽下長期合約',
    ],
  },
  '景門': {
    essence: '最有「曝光」和「文書」能量的時段',
    advantage: '這時段的能量擅長「讓別人看見你」。不管是面試、提案、演講、發文、考試——只要是需要別人聽你說話或看你作品的事，這時段的反饋會比平常好很多。',
    purposes: [
      '面試、簡報、公開演講',
      '發表文章、社群貼文、錄影',
      '考試、面試、資格審核',
    ],
  },
  '杜門': {
    essence: '最適合「隱密行動」的時段',
    advantage: '這時段的能量偏向「隱藏、策略、鎖定」。適合做「不能被打擾」的深度工作，或是需要保密進行的談判、策劃。強迫自己社交反而逆勢。',
    purposes: [
      '閉門寫作、深度思考、做決策',
      '隱密談判（不要張揚）',
      '處理敏感的財務或法律文件',
    ],
    avoid: '不適合開大型會議、社交應酬',
  },
  '傷門': {
    essence: '能量較剛、適合「正面對抗」的時段',
    advantage: '這時段的能量偏剛烈，適合需要魄力和衝勁的事。日常柔和的事情放別的時段做，這個時段留給「必須強勢」的場合——但要避開感情、健康、家務事。',
    purposes: [
      '打官司、跟人據理力爭',
      '運動訓練、體能挑戰',
      '討債、催款、處理違約',
    ],
    avoid: '不宜看病就醫、談感情、拜訪長輩',
  },
  '死門': {
    essence: '能量凝重，適合「結束與道別」',
    advantage: '這時段不是凶時，而是「收尾」能量最強。不要新開任何事，但是如果你有一些該結束的事情（道別、退租、處理身後事），這時段反而最順。',
    purposes: [
      '參加告別式、送行、處理遺物',
      '結束一段關係、退掉合約',
      '大掃除、斷捨離、整理舊物',
    ],
    avoid: '絕對不要新開任何事、結婚、搬新家',
  },
  '驚門': {
    essence: '能量不穩，但適合「官司與對質」',
    advantage: '這時段的能量偏向「動蕩、揭露、翻案」。不適合日常行事，但是如果你需要爭取權益、打官司、揭發真相，這時段的能量反而幫得上忙。',
    purposes: [
      '進法院、報案、出庭作證',
      '揭發不公、維權投訴',
      '處理糾紛、對質',
    ],
    avoid: '不宜談生意、簽約、約會',
  },
}

// 九星（用來微調優勢描述）
const JIUXING_FLAVOR: Record<string, string> = {
  '天蓬': '配合縝密的思考力',
  '天任': '配合穩紮穩打的執行力',
  '天沖': '配合大膽行動的勇氣',
  '天輔': '配合文才與教學能量',
  '天英': '配合公關魅力',
  '天芮': '配合學習與求教的好奇心',
  '天柱': '配合敏銳的察覺力',
  '天心': '配合謀略與決斷力',
  '天禽': '配合整合與協調能力',
}

// 八神（用來微調優勢描述）
const BASHEN_FLAVOR: Record<string, string> = {
  '值符': '有權威加持',
  '螣蛇': '需留意怪事或誤會',
  '太陰': '隱密而順利',
  '六合': '和合、人際圓融',
  '白虎': '偏剛烈、需謹慎',
  '玄武': '注意小人或欺瞞',
  '九地': '穩固踏實',
  '九天': '聲勢壯大、宣傳效果佳',
}

/**
 * 從 title 解析出主門、星、神
 * 支援兩種格式：
 *   - 有分隔符：「開門+天心+值符」「開門、天心、值符」
 *   - 連字串：「天輔開門」「天任休門」「開門天心值符」
 * v5.3.17 修：之前只支援 split，連字串（老闆截圖格式）全走 fallback
 */
function parseTitle(title: string): { bamen?: string; jiuxing?: string; bashen?: string } {
  const result: { bamen?: string; jiuxing?: string; bashen?: string } = {}
  if (!title) return result

  // 用 includes 掃描所有已知 keys（不依賴分隔符）
  for (const bamen of Object.keys(BAMEN_PLAIN)) {
    if (title.includes(bamen)) {
      result.bamen = bamen
      break
    }
  }
  for (const jiuxing of Object.keys(JIUXING_FLAVOR)) {
    if (title.includes(jiuxing)) {
      result.jiuxing = jiuxing
      break
    }
  }
  for (const bashen of Object.keys(BASHEN_FLAVOR)) {
    if (title.includes(bashen)) {
      result.bashen = bashen
      break
    }
  }
  return result
}

/**
 * 根據 title + direction 產出白話優勢（fallback 用）
 */
export function generatePlainAdvantage(title: string, direction?: string): string {
  const { bamen, jiuxing, bashen } = parseTitle(title)
  if (!bamen) {
    return '這是規劃師挑選出來的特殊能量時段，結合你個人命盤有加乘效果，往建議方向走會更順。'
  }
  const base = BAMEN_PLAIN[bamen]
  const parts: string[] = [base.advantage]

  const flavors: string[] = []
  if (jiuxing && JIUXING_FLAVOR[jiuxing]) flavors.push(JIUXING_FLAVOR[jiuxing])
  if (bashen && BASHEN_FLAVOR[bashen]) flavors.push(BASHEN_FLAVOR[bashen])
  if (flavors.length > 0) {
    parts.push(`同時${flavors.join('、')}，更能把握時機。`)
  }
  if (direction) {
    parts.push(`往${direction}方向行動，效果更明顯。`)
  }
  return parts.join('')
}

/**
 * 根據 title 產出最適合做什麼清單（fallback 用）
 */
export function generatePlainPurpose(title: string): string[] {
  const { bamen } = parseTitle(title)
  if (!bamen || !BAMEN_PLAIN[bamen]) {
    return [
      '把握這個時段做你想推動但一直卡關的事',
      '往建議方位走 500 公尺，靜坐 40 分鐘補運',
      '避開跟命理建議相反的方位',
    ]
  }
  return BAMEN_PLAIN[bamen].purposes
}

/**
 * 產出警示文字（例如死門/驚門這種特殊時段）
 */
export function getAvoidNote(title: string): string | undefined {
  const { bamen } = parseTitle(title)
  if (!bamen) return undefined
  return BAMEN_PLAIN[bamen]?.avoid
}

/**
 * Google Calendar 用的白話描述（取代原本命理依據）
 */
export function buildCalendarDescription(params: {
  plainAdvantage?: string
  plainPurpose?: string[]
  title: string
  direction: string
  angle?: string
  clientName?: string
}): string {
  // v5.3.75：行事曆內文強制用 AI 個人化版、不再 fallback 罐頭
  // 老闆明確要求：內文就是「坐這個盤對你的輔助」+ AI 寫的 bullets
  const { plainAdvantage, plainPurpose, direction, clientName } = params

  const lines: string[] = []
  lines.push(`【鑒源出門訣｜${clientName ?? ''}】`)
  lines.push('')
  lines.push(`方位：${direction}`)
  lines.push(`步行 500 公尺、停留 40 分鐘，朝${direction.replace(/\s.*/, '')}方向。`)
  lines.push('')
  // v5.10.410(E1/E2 人類視角審查 P1):plainAdvantage/plainPurpose 都缺時
  // 不再輸出孤兒標題「── 坐這個盤對你的輔助 ──」(舊報告實測 details 出現空段、廉價感)
  if (plainAdvantage || (plainPurpose && plainPurpose.length > 0)) {
    lines.push('── 坐這個盤對你的輔助 ──')
    if (plainAdvantage) lines.push(plainAdvantage)
    if (plainPurpose && plainPurpose.length > 0) {
      for (const p of plainPurpose) lines.push(`• ${p}`)
    }
    lines.push('')
  }
  lines.push('鑒源命理平台 jianyuan.life')
  return lines.join('\n')
}
