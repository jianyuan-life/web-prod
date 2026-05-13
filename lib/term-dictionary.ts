// v5.10.251 命理術語字典(供 TermTooltip wire 使用、Codex+Gemini P0 dead component wire #2)
//
// 用途:
//   - 統一管理 14 套命理系統的常見術語定義
//   - TermTooltip 的 definition + source 來源
//   - 未來可擴 export 到 /faq、/whitepaper、/blog 共用
//
// 設計原則:
//   - 客觀定義(不夾派別觀點)
//   - 出處明確標派別 + 古籍
//   - 中文繁體、簡短可讀(50-200 字)
//
// 對應:
//   - 對應 lesson #122 wire dead components(本檔配合 components/report/shared/TermTooltip.tsx)
//   - Sprint 2.x 完成 markdown parser 後、可 hook 進報告 body 自動 wrap

export interface TermDefinition {
  term: string
  definition: string
  source: string // 派別 + 古籍出處
  system: '八字' | '紫微' | '奇門' | '西占' | '吠陀' | '人類圖' | '靈數' | '姓名' | '易經' | '生肖' | '其他'
}

export const TERM_DICTIONARY: Record<string, TermDefinition> = {
  // 八字術語
  '命主': {
    term: '命主',
    definition: '八字中代表一個人「核心自我」的天干、即「日柱天干」(日主)。命理推演時、所有十神關係皆以命主為基準。',
    source: '子平派《滴天髓》',
    system: '八字',
  },
  '日主': {
    term: '日主',
    definition: '同「命主」、八字日柱的天干。決定五行強弱、用神取捨、十神配置的基準。',
    source: '子平派《淵海子平》',
    system: '八字',
  },
  '用神': {
    term: '用神',
    definition: '八字命局中「能調節五行平衡」的關鍵五行或十神。用神到位、命局通暢;用神受傷、運勢起伏。',
    source: '子平派《子平真詮·論用神》',
    system: '八字',
  },
  '喜神': {
    term: '喜神',
    definition: '輔助用神發揮的五行或十神。例:用神是水時、生水的金為喜神。',
    source: '子平派',
    system: '八字',
  },
  '忌神': {
    term: '忌神',
    definition: '剋制用神或破壞命局平衡的五行或十神。命局忌神當道時需化解、避免。',
    source: '子平派',
    system: '八字',
  },
  '十神': {
    term: '十神',
    definition: '八字中以日主為中心、與其他天干地支的關係:比肩、劫財、食神、傷官、偏財、正財、七殺、正官、偏印、正印。',
    source: '子平派《淵海子平》',
    system: '八字',
  },
  '建祿格': {
    term: '建祿格',
    definition: '八字格局之一、月令地支為日主的祿位(同五行陽性)。主性格自立、行動力強、適合創業或專業領域。',
    source: '子平派《子平真詮》',
    system: '八字',
  },
  '偏印格': {
    term: '偏印格',
    definition: '八字格局、月令地支偏印當令。主思維獨特、學習力強、對神秘學/技術/心理有特別緣分、但易孤僻。',
    source: '子平派',
    system: '八字',
  },

  // 紫微術語
  '命宮': {
    term: '命宮',
    definition: '紫微斗數十二宮之首、代表先天性格、人生主軸。命宮主星決定一個人的核心氣質。',
    source: '中州派《紫微斗數全書》',
    system: '紫微',
  },
  '三方四正': {
    term: '三方四正',
    definition: '紫微斗數中、命宮 + 對宮 + 三合位、共 4 宮的星曜組合。判斷一個人格局時、需綜合三方四正的星曜。',
    source: '中州派',
    system: '紫微',
  },
  '四化': {
    term: '四化',
    definition: '紫微斗數中、十干引動的「化祿、化權、化科、化忌」四種能量轉化。流年/大限四化決定動態運勢。',
    source: '飛星派',
    system: '紫微',
  },
  '紫微天府': {
    term: '紫微天府',
    definition: '紫微斗數北斗主星「紫微」+ 南斗主星「天府」。雙主星格局穩重、主領導力與享受並存。',
    source: '中州派',
    system: '紫微',
  },
  '天梁': {
    term: '天梁',
    definition: '紫微南斗第二星、屬土、化氣為蔭。主貴人庇蔭、長壽、化解災厄。坐命主性格穩重、有正義感。',
    source: '《紫微斗數全書·諸星問答論》',
    system: '紫微',
  },

  // 奇門術語
  '奇門遁甲': {
    term: '奇門遁甲',
    definition: '中華古代擇吉/占事/兵法的整合術數。以 9 宮 8 門 9 星 8 神排盤、推演事件吉凶與最佳時機方位。',
    source: '《煙波釣叟賦》《奇門五總龜》',
    system: '奇門',
  },
  '出門訣': {
    term: '出門訣',
    definition: '奇門遁甲應用之一、推算特定事件(面試/簽約/出行)的最佳時辰與方位。鑒源 E 系列方案產品。',
    source: '王松茂《奇門遁甲心悟》',
    system: '奇門',
  },
  '紫白擇方': {
    term: '紫白擇方',
    definition: '玄空風水擇日法、用九紫白星推算每日吉方。鑒源用於補強奇門出門訣的方位選擇。',
    source: '《紫白賦》',
    system: '奇門',
  },

  // 人類圖術語
  '生產者': {
    term: '生產者',
    definition: '人類圖 4 種類型之一、世界 70% 人屬此型。策略「等待回應」、做事憑「薦骨直覺」、找對方向能源源不絕。',
    source: 'Ra Uru Hu《人類圖通識》',
    system: '人類圖',
  },
  '顯示者': {
    term: '顯示者',
    definition: '人類圖類型、世界 9% 人屬此型。策略「告知後再行動」、能獨立發起、推動變革。',
    source: 'Ra Uru Hu',
    system: '人類圖',
  },
  '情緒權威': {
    term: '情緒權威',
    definition: '人類圖內在權威之一、世界 50% 人屬此型。決策需「等情緒清明」(高峰低谷後的中性點)、衝動易後悔。',
    source: 'Ra Uru Hu',
    system: '人類圖',
  },

  // 西占術語
  '上升': {
    term: '上升星座',
    definition: '西洋占星出生時東方地平線上升起的星座。代表外在形象、給人第一印象、生命前 30 年的人格面具。',
    source: '希臘占星',
    system: '西占',
  },
  '宿曜': {
    term: '宿曜',
    definition: '吠陀占星 27 個月亮宿位之一、根據出生時月亮所在位置推命。決定核心性格與業力課題。',
    source: '《Brihat Parashara Hora Shastra》',
    system: '吠陀',
  },

  // 靈數術語
  '命運數': {
    term: '命運數',
    definition: '靈數學西式版本、出生年月日全部數字相加至個位數。代表此生主要使命與課題。',
    source: '畢達哥拉斯靈數系統',
    system: '靈數',
  },
  '靈魂數': {
    term: '靈魂數',
    definition: '靈數中由生日「日」推算的數字。代表內在動機、靈魂渴望、潛意識驅動力。',
    source: '畢達哥拉斯',
    system: '靈數',
  },
}

/**
 * 從字典查術語、找不到回 undefined
 */
export function getTerm(term: string): TermDefinition | undefined {
  return TERM_DICTIONARY[term]
}

/**
 * 列出某系統所有術語(供詞彙表頁用)
 */
export function getTermsBySystem(system: TermDefinition['system']): TermDefinition[] {
  return Object.values(TERM_DICTIONARY).filter((t) => t.system === system)
}
