// v5.10.210 — heart-doubts mock(何宣逸 minimum)
//
// Sprint 1:對齊 HeartDoubtsReport schema、用於 Beta whitelist 訪問 demo
// Sprint 2+:真實 paid_reports parse 後替換
import type { HeartDoubtsReport } from '@/types/report-schemas'

export const MOCK_HEART_DOUBTS_HE_XUAN_YI: HeartDoubtsReport = {
  meta: {
    id: 'he-xuan-yi',
    hash: 'mock-hash-002',
    engineVersion: 'v5.10.197',
    name: '何宣逸',
    birthDate: '1985-10-23T08:00:00+08:00',
    reportDate: '2026-05-13',
    durationShort: 8,
    durationFull: 11,
  },
  score: {
    grade: 'B+',
    value: 79,
    percentile: 35, // Top 35%
    challengeLevel: '低',
    systemsCount: 14,
    indicatorDots: 5,
  },
  bazi: {
    year: '乙丑',
    month: '丙戌',
    day: '庚子',
    hour: '己卯',
    dayMaster: '庚',
    elements: { '木': 2, '火': 1, '土': 3, '金': 1, '水': 1 },
    insight: '日主庚金、生於戌月得令、火土偏旺、五行缺木水(略缺)、需金水調候、水木通關。',
  },
  question: {
    topic: '事業',
    icon: '💼',
    raw: '我今年是否該換新工作?還是續留目前公司等待升遷?',
  },
  evidence: [
    { system: '紫微', finding: '命宮天府坐辰、化權入命、適合穩定中求變、不宜大跳' },
    { system: '八字', finding: '今年丙午流年、火生土、印星旺、利進修非利動職' },
    { system: '吠陀', finding: '太陽落第十宮 Capricorn、需累積 7 年才見領導格' },
    { system: '人類圖', finding: '5/1 投射者、需被邀請、不宜主動跳槽' },
    { system: '西占', finding: '木星過第十宮 Pisces、適合學新技能但不換軌道' },
    { system: '易經', finding: '艮卦九三:艮其限、列其夤、厲薰心 — 不宜大動' },
    { system: '生肖', finding: '丑年生人、丙午年合化合、貴人運中等' },
    { system: '數字', finding: '生命靈數 8、今年 4 年(物質穩定年)、不宜冒險' },
    { system: '塔羅', finding: '命牌 Justice、需衡量利弊、不衝動' },
    { system: '奇門', finding: '今年生門落坎、利穩固本位、不利遠行/換境' },
    { system: '節律', finding: '個人年 5(轉變但不顛覆)、職場關係仍重要' },
    { system: '風水', finding: '辦公位現坐西朝東、利知識/教學、不利改朝換代' },
  ],
  toc: { qi: 1, cheng: 7, zhuan: 2, he: 4 },
  answer: {
    conclusion: '建議續留、用今年累積資歷與人脈、明年(2027 丁未)再行動。',
    condition: '前提:目前公司能給你新挑戰 / 學習空間、薪資不需馬上跳。',
    paragraphs: [
      '七大系統共識:今年是「累積年」不是「跳躍年」、適合深耕、不宜大動。',
      '紫微化權入命、表示有「升遷潛力」但需「等待」 — 主動跳槽容易遇貴人撤、被動接受 offer 較利。',
      '八字今年印旺(學習)、若公司能讓你進修或帶新人、就是好年;若停滯、底下會浮躁。',
      '吠陀說 7 年累積期、若你已累積 5-6 年、剩 1-2 年是關鍵;不要在最後一公里換軌。',
      '若你必須動、最佳時機是 2026 Q4(11-12 月)、不是 2026 上半年。',
    ],
  },
  chapters: {
    one_deep: {
      quickSummary: '深入解析:命格怎麼看「換工作」這件事。',
      body: ['你的命格不是「攻擊型」、是「累積型」。', '攻擊型適合創業 / 跳槽、累積型適合深耕。', '硬把累積型推去攻擊、會卡關。'],
    },
    bond: {
      quickSummary: '為什麼「換工作」這件事卡在你身上特別敏感:',
      body: ['日主庚金、需「磨」才出鋒、跳槽 = 重新磨、累積成本歸零。', '紫微化權入命、表示「在原位升」比「換位」更利。'],
    },
    flowYear: {
      quickSummary: '今年(2026 丙午)的能量、被火土印星推、容易急、容易做衝動決定。',
      body: ['七殺臨命、感覺有壓力、但實際是「考驗」不是「絕路」。', '建議:每月最後一週做決策回顧、不要當天衝動。'],
    },
    bestPlan: {
      short: { title: '短期(現在到 7 月):備戰期', actions: ['請主管列出明年升遷 KPI', '跟 HR 一對一聊發展路徑', '記下每月成就'] },
      mid: { title: '中期(7-10 月):觀察期', actions: ['若主管未答覆 KPI / 路徑、開始低調 networking', '更新 LinkedIn、被動接 offer', '評估外部市場行情'] },
      long: { title: '長期(10 月後):決策期', actions: ['若內部 OK、續留;若卡關、Q4 接 offer', '不要 2027 上半年再動(流年不利)'] },
    },
    timing: [
      { period: '2026 5-7 月', action: '備戰、不行動', reason: '丙午流年印旺、利累積', note: '勿衝動更新履歷' },
      { period: '2026 8-10 月', action: '觀察、低調', reason: '七殺旺、需冷靜', note: '心情起伏大、勿做決定' },
      { period: '2026 11-12 月', action: '若必要、行動', reason: '年底申子辰水局、利動', note: '簽約前必查公司財務' },
    ],
    risks: [
      { title: '被火印推、衝動跳槽', detail: '今年印星旺、容易覺得「現在換、可以更好」、實際是錯覺' },
      { title: '面試表現失常', detail: '七殺臨命、面試容易緊張、多練習模擬' },
      { title: '薪資反向跳水', detail: '今年丁未流月(8 月)薪資談判易吃虧' },
    ],
    practice: [
      {
        title: '每月最後一週「換工作意願評分」',
        purpose: '避免衝動決策、量化記錄情緒波動',
        bond: '你的命格易被流年情緒推、需 metrics anchored',
        duration: '每月最後一週、5 分鐘',
        tool: 'Notion / Excel',
        scene: '辦公室或家裡',
        content: '寫下「本月想換工作的次數 0-10、原因 3 條、若換可得到什麼、若不換失去什麼」',
        milestone: '連續 6 個月評分穩定 4-6 分 = 累積期 OK、繼續;連續 3 個月 ≥ 8 分 = 認真考慮',
        recovery: '若某月暴衝、寫信給未來 6 個月後的自己、不寄出、放抽屜',
        difficulty: { easy: '只記分數', mid: '加原因', hard: '加未來信' },
      },
    ],
  },
  root: {
    quickSummary: '為什麼你會卡在「該不該換」這件事:',
    body: ['你的命格屬「需邀請才動」型(人類圖 5/1 投射者)、主動跳槽違背能量設計。', '你需要的不是「換」、是「被認可」 — 在原位被看見、比換新位子實際。'],
  },
  caveats: [
    { title: '七殺流年、勿與主管硬碰', bond: '今年丙午、火剋金、若跟主管衝突易吃虧', remedy: '有不滿用書面、不口頭' },
    { title: '勿被獵頭話術說動', bond: '5/1 投射者易被「特殊性」打動', remedy: '收 offer 後 sleep on it 7 天' },
  ],
  way: {
    quickSummary: '怎麼走出來:',
    body: ['第一步:跟主管直接談明年發展(不問「要不要升」、問「往哪走」)。', '第二步:同時被動接洽 1-2 家、不主動投履歷。', '第三步:用行動評估、不用情緒評估、評分維度寫下來。'],
  },
  goods: [
    { title: '化權入命', support: '紫微 + 八字', howToUse: '善用「主動權威」、做 SME(Subject Matter Expert)、不做萬金油' },
    { title: '印星旺', support: '八字', howToUse: '今年是學習年、報名一個高階課程、明年用得上' },
  ],
  improvements: [
    {
      title: '把「換不換」變「進不進」',
      whyYou: '你不是討厭工作、是怕原地踏步;進修就解這個焦慮',
      steps: ['列出 3 個你想學的硬技能', '本月註冊一門線上課', '每週 3 小時、不缺席'],
      ifNot: '繼續每月內耗、決策疲勞',
      ifDo: '6 個月後你會「知道自己在進步」、跳不跳變次要',
      bestTime: '本月底前完成註冊',
    },
  ],
  letter: {
    quickSummary: '寫給你的話:',
    body: [
      '宣逸、你不是「不夠好」、是「太想證明」。',
      '今年命格給你的不是「跳板」、是「土壤」。',
      '深紮根的樹、暴風雨來時不倒;急著移植的樹、風一吹就斷。',
      '相信你的累積、相信時間、相信庚金需要磨。',
    ],
  },
}
