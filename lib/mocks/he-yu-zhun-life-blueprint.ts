// v5.10.203 Sprint 1 step 5 — 何宥諄人生藍圖 mock 資料(minimum demo)
//
// Sprint 1:minimum schema-compatible mock(hero / card5 / actions2026 + 各 section minimum 一條)
// Sprint 2+:加完整 17 sections(insight5cards / consensusMatrix / daYun / talentsTop5 / risksTop5...)
//
// 用途:Feature Flag 啟用後、訪問 /report/life-blueprint/he-yu-zhun 看 demo render
import type { LifeBlueprintReport } from '@/types/report-schemas'

export const mockHeYuZhunLifeBlueprint: LifeBlueprintReport = {
  meta: {
    id: 'he-yu-zhun',
    hash: 'demo-hash-mock',
    engineVersion: 'v5.10.203',
    name: '何宥諄',
    gender: 'M',
    birthDate: '2018-08-15T13:30:00+08:00',
    birthPlace: '台北市',
    reportDate: '2026-05-13',
    durationShort: 8,
    durationFull: 47,
    isChild: true,
    sect: {
      ziwei: '中州派+三合派+飛星派補充',
      bazi: '子平派',
      vedic: 'Parashari+Jaimini',
      western: '現代心理派Placidus',
      hd: 'Ra Uru Hu',
    },
  },
  hero: {
    title: '太陽之火',
    subtitle: '一份照亮自己也溫暖他人的命格',
    icon: 'sun',
    keyword: ['熱情', '領導', '創造'],
  },
  actions2026: {
    q1q2: { label: '啟動', color: 'green', text: '上半年是新挑戰啟動的好時機、勇敢去嘗試新事物' },
    fullYear: { label: '持續·留意覺察', color: 'amber', text: '保持自我覺察、避免過度燃燒' },
    q3q4: { label: '整合', color: 'violet', text: '下半年整合上半年的學習、收成成果' },
  },
  card5: {
    title: '太陽之火',
    subtitle: '丙火日主、生於申月、得地支午火支援',
    bazi: {
      year: '戊戌',
      month: '庚申',
      day: '丙子',
      hour: '乙未',
      dayMaster: '丙',
    },
    ziwei: {
      palaceStar: '紫微',
      palace: '寅',
    },
    talentsTop3: ['熱情創造', '領導魅力', '溫暖他人'],
    challengesTop3: ['容易過度燃燒', '需學會休息', '情緒起伏較大'],
  },
  insight3steps: {
    step1: {
      title: '核心性格',
      content: '何宥諄是個天生的太陽型人格、丙火日主代表光明、熱情、創造力強。他天生有領導力、能溫暖周圍的人、但需學習如何不過度燃燒自己。',
    },
    step2: {
      dashboard: { personality: 88, action: 92, cultivation: 65 },
      tags: ['精力充沛', '行動派', '需學覺察'],
      trapWarning: '⚠ 注意:過度行動可能導致身心疲憊、需定期休息與內觀',
    },
    step3: {
      priorityActions: [
        { date: '2026-Q1', type: '工作', text: '啟動新專案、發揮創造力' },
        { date: '2026-Q2', type: '檢查', text: '中期回顧、確認方向' },
        { date: '2026-Q3', type: '覆盤', text: '下半年整合、收成階段' },
      ],
      successMetrics: ['新專案啟動 ✓', '保持每週 1 次自我覺察', '不過度疲勞'],
    },
  },
  insight5cards: [
    { icon: '🌞', title: '創造力', subtitle: '丙火天賦', detail: '天生的創造者、適合開創新事物' },
    { icon: '👑', title: '領導力', subtitle: '紫微入命', detail: '自然有領導氣質、能感染他人' },
    { icon: '❤️', title: '熱情溫暖', subtitle: '陽火本質', detail: '熱心助人、是團體中的太陽' },
    { icon: '⚡', title: '行動力', subtitle: '陽刃格', detail: '想到就做、執行力強' },
    { icon: '🎯', title: '專注力', subtitle: '紫微守護', detail: '能在關鍵時刻全神貫注' },
  ],
  natalOverview: {
    ziwei12palaces: [
      { palace: '命宮', mainPalace: true, bigFour: true, stars: ['紫微'], ganzhi: '丙寅' },
      { palace: '兄弟', mainPalace: false, bigFour: false, stars: ['天機'], ganzhi: '乙丑' },
      // ... 其他 10 宮、Sprint 2 補
    ],
    daily: { date: '2026-05-13', element: '木', tip: '今日適合啟動新計畫' },
  },
  yearEnergy12: [
    { month: 1, score: 65 }, { month: 2, score: 72 }, { month: 3, score: 80 },
    { month: 4, score: 85 }, { month: 5, score: 90 }, { month: 6, score: 75 },
    { month: 7, score: 60 }, { month: 8, score: 55 }, { month: 9, score: 70 },
    { month: 10, score: 88 }, { month: 11, score: 92 }, { month: 12, score: 78 },
  ],
  daYun: [
    {
      seq: 1,
      ageRange: '8-17',
      years: '2026-2035',
      ganZhi: '辛酉',
      tenGod: '正財',
      energy: 75,
      theme: '學習與成長',
      strategy: '重視學業、培養興趣、累積天賦',
      keyYears: [
        { year: '2028', ganZhi: '戊申', note: '10 歲關鍵成長年' },
        { year: '2032', ganZhi: '壬子', note: '14 歲青春期挑戰' },
      ],
    },
    // Sprint 2 補後 5-7 步大運
  ],
  consensusMatrix: {
    dimensions: ['財運', '事業/天賦', '感情/人際', '健康/體質', '人際/貴人', '學業/智力', '心靈/成長'],
    systems: ['八字', '紫微', '奇門', '風水', '姓名', '西占', '吠陀', '易經', '人類圖', '塔羅', '數字', '古占', '生肖', '節律'],
    grid: Array(7).fill(null).map(() => Array(14).fill(0).map(() => Math.floor(Math.random() * 6))), // mock 7×14 0-5
    consensus: [
      { level: 'high', pct: 65 },
      { level: 'mid', pct: 25 },
      { level: 'low', pct: 10 },
    ],
  },
  talentsTop5: [
    { title: '創造力強', supportSystems: ['八字', '紫微', '人類圖'], confidence: 5, manifestation: '能想出別人想不到的點子', howToAmplify: '多接觸藝術、保持好奇心' },
    { title: '領導魅力', supportSystems: ['紫微', '西占', '吠陀'], confidence: 5, manifestation: '自然吸引他人關注', howToAmplify: '在班上爭取小組長角色' },
    { title: '行動力快', supportSystems: ['八字', '人類圖', '節律'], confidence: 4, manifestation: '想到就做', howToAmplify: '搭配計畫、不只衝動' },
    { title: '溫暖陽光', supportSystems: ['八字', '生肖', '塔羅'], confidence: 4, manifestation: '讓人感到溫暖', howToAmplify: '主動關心同學' },
    { title: '專注力佳', supportSystems: ['紫微', '吠陀'], confidence: 3, manifestation: '想專注時能很專注', howToAmplify: '減少電子產品干擾' },
  ],
  risksTop5: [
    { title: '過度燃燒', supportSystems: ['八字', '節律'], confidence: 5, triggerTime: '7-9 月', prevention: '定期休息、不挑戰自己極限' },
    { title: '情緒起伏', supportSystems: ['西占', '塔羅'], confidence: 4, triggerTime: '青春期', prevention: '學習情緒覺察、找信任的人傾訴' },
    { title: '太強勢', supportSystems: ['紫微', '生肖'], confidence: 3, triggerTime: '小組合作時', prevention: '練習聆聽、不只主導' },
    { title: '身體勞累', supportSystems: ['八字', '節律'], confidence: 3, triggerTime: '考試季', prevention: '充足睡眠、規律運動' },
    { title: '完美主義', supportSystems: ['西占'], confidence: 2, triggerTime: '長大後', prevention: '允許自己不完美' },
  ],
  planStages: {
    immediate: [{ action: '啟動 2026 新計畫', why: '太陽火能量足', how: '寫下 3 個目標、1 月內開始', deadline: '2026-01-31' }],
    short: [{ action: '每週自我覺察', alignment: '配合丙火需要平衡', checkpoint: '每月最後一天回顧' }],
    long: [{ action: '培養領導才能', alignment: '紫微入命使命', outcome: '5 年後成為團隊核心' }],
  },
  luckyParams: {
    colors: ['紅色', '橘色', '金色'],
    numbers: [1, 6, 9],
    directions: ['南方', '東南方'],
    hours: ['9-11 點', '14-16 點'],
    plants: ['向日葵', '紅玫瑰', '橘色菊花'],
    avoid: ['過度熬夜', '冰冷飲食', '長時間獨處'],
    protectStars: ['天魁', '天鉞'],
    talents: ['創造', '領導', '溫暖'],
  },
  practices5: [
    {
      title: '太陽冥想',
      commandRecipe: '每日清晨 5 分鐘、面向東方、想像太陽在心中升起',
      painPoint: '容易過度燃燒、忘記休息',
      vision: '保持內在能量穩定、不被外境耗盡',
      steps: ['坐姿放鬆深呼吸 1 分鐘', '想像金色太陽在胸口', '感謝今日有的能量'],
      obstacle: '剛開始可能覺得無聊、堅持 21 天就會喜歡',
    },
    // Sprint 2 補另外 4 條
  ],
  oneLiner: '你是一束溫暖的光、勇敢照亮自己也照亮別人。',
  letterFinal: {
    retrospect: '回顧過去:你已經是個閃亮的小太陽',
    present: '現在:好好做自己、不需證明什麼',
    future: '未來:繼續做溫暖的光、世界因你更明亮',
    declaration: '我是太陽之火、我願意照亮自己也照亮他人。',
  },
  appendix14Systems: [
    { system: '八字', finding: '丙火日主、申月生、調候用神為甲木' },
    { system: '紫微', finding: '紫微入命寅宮、命格貴重' },
    // Sprint 2 補另外 12 系統
  ],
}
