// ============================================================
// 提示詞合集 Prompt 5 — 免費工具頁 SEO Schema helper
// ============================================================
// app/tools/{bazi,ziwei,qimen}/page.tsx 用此 helper 注入 JSON-LD
// (SoftwareApplication + FAQPage + HowTo)。additive、純資料工廠;
// 各頁是否引用 = 該頁自行決定(改頁面 = P1 需 webapp-testing 驗證,
// 故本檔只提供 helper、不自動 wire)。
//
// GA4 event / Meta Pixel / Email gate = 需 GA4/Pixel id + Supabase
// free_tool_submissions 表(老闆/migration);本檔附事件常數供前端用。

export type FreeTool = 'bazi' | 'ziwei' | 'qimen'

const META: Record<FreeTool, { name: string; h1: string; faqs: [string, string][] }> = {
  bazi: {
    name: '免費八字排盤線上工具 含十神大運流年',
    h1: '免費八字排盤線上工具 含十神大運流年',
    faqs: [
      ['八字排盤要準備什麼資料?', '出生年月日、時辰(可選不確定)、出生城市,系統自動換算真太陽時。'],
      ['免費版和付費報告差在哪?', '免費版給排盤結果與基礎解讀;付費版用最多 14 套系統交叉、產出個人化深度報告。'],
      ['不知道出生時辰可以排嗎?', '可以,選「時辰不確定」,系統會以日柱為主提供可用解讀。'],
      ['排盤結果準嗎?', '排盤為確定性演算法(萬年曆級);解讀由引擎生成,僅供自我覺察參考。'],
    ],
  },
  ziwei: {
    name: '免費紫微斗數命盤 含 12 宮主星詳解',
    h1: '免費紫微斗數命盤 含 12 宮主星詳解',
    faqs: [
      ['紫微命盤怎麼看?', '先看命宮主星定基調,再看財帛、官祿、夫妻等宮位的星曜組合。'],
      ['需要農曆還是國曆?', '輸入國曆即可,系統自動轉農曆並處理閏月。'],
      ['12 宮都會顯示嗎?', '是,含命/兄弟/夫妻/子女/財帛/疾厄/遷移/僕役/官祿/田宅/福德/父母。'],
      ['和八字哪個準?', '兩者視角不同;鑑源付費報告會交叉多系統,降低單一系統偏誤。'],
    ],
  },
  qimen: {
    name: '免費奇門遁甲排盤 含九宮八神時家局',
    h1: '免費奇門遁甲排盤 含九宮八神時家局',
    faqs: [
      ['奇門遁甲排盤看什麼?', '看九宮的門/星/神/干組合,判斷此時此方的能量傾向。'],
      ['時家奇門是什麼?', '以「時辰」起局,適合擇時出行、行動決策(出門訣方案的核心)。'],
      ['鑑源用哪派?', '對外統稱古法奇門遁甲;排盤經 20 組 Windada 交叉驗證。'],
      ['免費版能擇吉嗎?', '免費版給單局排盤;擇吉(Top 吉時 + 補運)請見出門訣 E 系列方案。'],
    ],
  },
}

/** 產生三層 JSON-LD(放進 page.tsx 的 <script type="application/ld+json">) */
export function buildFreeToolJsonLd(tool: FreeTool, siteUrl = 'https://jianyuan.life') {
  const m = META[tool]
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: m.name,
        applicationCategory: 'LifestyleApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        url: `${siteUrl}/tools/${tool}`,
      },
      {
        '@type': 'FAQPage',
        mainEntity: m.faqs.map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
      {
        '@type': 'HowTo',
        name: `如何使用${m.name}`,
        step: [
          '輸入出生年月日',
          '選擇出生時辰(不確定可略)',
          '輸入出生城市(自動定位經緯度)',
          '送出取得排盤結果',
          '閱讀基礎解讀,需要深度分析點擊升級',
        ].map((t, i) => ({ '@type': 'HowToStep', position: i + 1, text: t })),
      },
    ],
  }
}

export function freeToolH1(tool: FreeTool): string {
  return META[tool].h1
}

// GA4 / Meta Pixel 事件常數(前端埋點用;id 由 env 提供,缺則 no-op)
export const FREE_TOOL_EVENTS = {
  view: 'view_free_tool',
  submit: 'submit_chart',
  result: 'view_result',
  upgrade: 'click_upgrade_cta',
  lead: 'Lead', // Meta Pixel(填 Email gate)
} as const
