// ============================================================
// 內容守門員 — 關鍵詞黑名單（Layer 1）
// ============================================================
// 用途：命理報告 AI 生成後，在儲存與交付前掃描
// 分類：政治 / 醫療 / 投資 / 極端命理 / 歧視仇恨 / 性 / 暴力
// 分級：
//   - 'block'（必擋）：直接阻斷報告交付，觸發 retry_with_guard
//   - 'warn'（警告）：不擋但記錄+通知 admin，需人工審核
//
// 維護原則：
//   - 只收「極度敏感或法律/品牌高風險」字眼
//   - 中性詞（如「離婚」「癌症」）只有搭配特定句式才會被抓
//   - 本清單為基礎版，實務觸發誤殺時從 FALSE_POSITIVE_WHITELIST 補救
// ============================================================

export type ModerationSeverity = 'block' | 'warn'

export type ModerationCategory =
  | 'politics'           // 政治敏感
  | 'medical'            // 醫療過度承諾
  | 'investment'         // 投資誘導
  | 'extreme_fortune'    // 極端命理（注定/不可改變/死亡時間）
  | 'discrimination'     // 歧視仇恨
  | 'sexual'             // 不當性內容
  | 'violence'           // 暴力
  | 'privacy'            // 隱私洩漏（其他客戶名字等）

export interface BlacklistItem {
  // 支援字串（完全比對）或正則（模糊匹配）
  pattern: string | RegExp
  category: ModerationCategory
  severity: ModerationSeverity
  /** 觸發理由（寫進 log 給 admin 看） */
  reason: string
}

// ────────────────────────────────────────────────────────────
// 1. 政治敏感詞（block）
//    命理報告本來就不該出現政治人物、爭議事件
// ────────────────────────────────────────────────────────────
const POLITICS: BlacklistItem[] = [
  // 兩岸政治人物（含歷史與現任，避免誤點）
  { pattern: '習近平', category: 'politics', severity: 'block', reason: '政治人物姓名' },
  { pattern: '毛澤東', category: 'politics', severity: 'block', reason: '政治人物姓名' },
  { pattern: '鄧小平', category: 'politics', severity: 'block', reason: '政治人物姓名' },
  { pattern: '江澤民', category: 'politics', severity: 'block', reason: '政治人物姓名' },
  { pattern: '胡錦濤', category: 'politics', severity: 'block', reason: '政治人物姓名' },
  { pattern: '李克強', category: 'politics', severity: 'block', reason: '政治人物姓名' },
  { pattern: '蔡英文', category: 'politics', severity: 'block', reason: '政治人物姓名' },
  { pattern: '賴清德', category: 'politics', severity: 'block', reason: '政治人物姓名' },
  { pattern: '馬英九', category: 'politics', severity: 'block', reason: '政治人物姓名' },
  { pattern: '韓國瑜', category: 'politics', severity: 'block', reason: '政治人物姓名' },
  { pattern: '蔣中正', category: 'politics', severity: 'warn', reason: '歷史政治人物' },
  { pattern: '蔣介石', category: 'politics', severity: 'warn', reason: '歷史政治人物' },

  // 香港政治
  { pattern: '李家超', category: 'politics', severity: 'block', reason: '政治人物姓名' },
  { pattern: '林鄭月娥', category: 'politics', severity: 'block', reason: '政治人物姓名' },

  // 美國政治
  { pattern: 'Trump', category: 'politics', severity: 'warn', reason: '政治人物（英文）' },
  { pattern: 'Biden', category: 'politics', severity: 'warn', reason: '政治人物（英文）' },
  { pattern: '川普', category: 'politics', severity: 'warn', reason: '政治人物中譯' },
  { pattern: '拜登', category: 'politics', severity: 'warn', reason: '政治人物中譯' },

  // 爭議事件
  { pattern: '六四', category: 'politics', severity: 'block', reason: '歷史爭議事件' },
  { pattern: '天安門事件', category: 'politics', severity: 'block', reason: '歷史爭議事件' },
  { pattern: '文化大革命', category: 'politics', severity: 'block', reason: '歷史爭議事件' },
  { pattern: '反送中', category: 'politics', severity: 'block', reason: '爭議事件' },
  { pattern: '太陽花學運', category: 'politics', severity: 'warn', reason: '爭議事件' },
  { pattern: '新疆再教育', category: 'politics', severity: 'block', reason: '爭議議題' },
  { pattern: '達賴喇嘛', category: 'politics', severity: 'warn', reason: '敏感宗教政治人物' },
  { pattern: '法輪功', category: 'politics', severity: 'block', reason: '敏感宗教議題' },

  // 主權/統獨
  { pattern: /台獨|台灣獨立/, category: 'politics', severity: 'block', reason: '主權議題' },
  { pattern: /港獨|香港獨立/, category: 'politics', severity: 'block', reason: '主權議題' },
  { pattern: /藏獨|西藏獨立/, category: 'politics', severity: 'block', reason: '主權議題' },
  { pattern: /疆獨|新疆獨立/, category: 'politics', severity: 'block', reason: '主權議題' },
  { pattern: /兩岸統一|一國兩制/, category: 'politics', severity: 'warn', reason: '政治立場' },

  // 政黨
  { pattern: /中國共產黨|中共/, category: 'politics', severity: 'warn', reason: '政黨名稱' },
  { pattern: '國民黨', category: 'politics', severity: 'warn', reason: '政黨名稱' },
  { pattern: '民進黨', category: 'politics', severity: 'warn', reason: '政黨名稱' },
  { pattern: '共產黨', category: 'politics', severity: 'warn', reason: '政黨名稱' },

  // 抗議選舉
  { pattern: /支持.{0,5}(總統|主席|黨)|投給/, category: 'politics', severity: 'block', reason: '政治傾向引導' },
]

// ────────────────────────────────────────────────────────────
// 2. 醫療過度承諾（block）
//    命理不能替代就醫，不能保證治癒
// ────────────────────────────────────────────────────────────
const MEDICAL: BlacklistItem[] = [
  { pattern: /保證治癒|一定能好|一定會好|絕對治好/, category: 'medical', severity: 'block', reason: '醫療過度承諾' },
  { pattern: /能治癌|可治癌|治療癌症|治好癌症/, category: 'medical', severity: 'block', reason: '醫療不實承諾' },
  { pattern: /不用看醫生|不用就醫|不需看醫/, category: 'medical', severity: 'block', reason: '勸阻就醫' },
  { pattern: /替代(醫療|治療|就醫)/, category: 'medical', severity: 'block', reason: '勸阻就醫' },
  { pattern: /停藥|停止服藥|不要吃藥/, category: 'medical', severity: 'block', reason: '勸阻服藥' },
  { pattern: /絕症必(癒|好)|絕症可治/, category: 'medical', severity: 'block', reason: '醫療不實承諾' },
  { pattern: /命理治病|命盤治療|八字治病/, category: 'medical', severity: 'block', reason: '命理不能替代治療' },
  { pattern: /包(治|好|癒)/, category: 'medical', severity: 'block', reason: '醫療不實承諾' },
  { pattern: /神奇療效|靈丹妙藥/, category: 'medical', severity: 'warn', reason: '醫療誇大' },
  { pattern: /(保證|一定|絕對).{0,5}(治好|痊癒|康復|不復發)/, category: 'medical', severity: 'block', reason: '醫療過度承諾' },
  { pattern: /必定(痊癒|康復|好轉)/, category: 'medical', severity: 'block', reason: '醫療過度承諾' },
  { pattern: /戒斷.*(保證|一定|絕對)/, category: 'medical', severity: 'warn', reason: '醫療承諾' },
  { pattern: /跳樓|上吊|自縊|割腕|自盡|自殘/, category: 'medical', severity: 'block', reason: '自傷內容' },
  { pattern: /尋短|了結生命|結束生命|自我了斷/, category: 'medical', severity: 'block', reason: '自傷內容' },

  // 精神疾病
  { pattern: /憂鬱症.*(保證|一定|絕對).{0,5}(好|痊癒)/, category: 'medical', severity: 'block', reason: '精神疾病承諾' },
  { pattern: /精神病.*(一定|保證).{0,5}(好|治癒)/, category: 'medical', severity: 'block', reason: '精神疾病承諾' },
]

// ────────────────────────────────────────────────────────────
// 3. 投資誘導（block）
//    命理不能保證財富，不能給投資建議
// ────────────────────────────────────────────────────────────
const INVESTMENT: BlacklistItem[] = [
  { pattern: /穩賺不賠|保證獲利|保證賺錢|保證盈利/, category: 'investment', severity: 'block', reason: '投資過度承諾' },
  { pattern: /必漲|必跌|保證.{0,3}漲|保證.{0,3}跌/, category: 'investment', severity: 'block', reason: '投資預測承諾' },
  { pattern: /零風險|無風險.*投資/, category: 'investment', severity: 'block', reason: '投資風險不實' },
  { pattern: /(一定|絕對|肯定).{0,5}(賺|獲利|盈利|發財)/, category: 'investment', severity: 'block', reason: '投資過度承諾' },
  { pattern: /包賺|包獲利/, category: 'investment', severity: 'block', reason: '投資過度承諾' },
  { pattern: /內線消息|老鼠倉|黑馬股/, category: 'investment', severity: 'block', reason: '違規投資術語' },
  { pattern: /(買|投資|持有).{0,5}(股票|加密貨幣|虛擬貨幣|期貨|外匯).{0,10}(必|保證|一定).{0,3}(賺|漲)/, category: 'investment', severity: 'block', reason: '具體投資建議' },
  { pattern: /比特幣必漲|以太坊必漲|.{1,6}幣必漲/, category: 'investment', severity: 'block', reason: '加密貨幣預測' },
  { pattern: /(購買|投入)全部(身家|財產|積蓄)/, category: 'investment', severity: 'block', reason: '勸誘 all-in' },
  { pattern: /借錢(投資|買股|炒作)/, category: 'investment', severity: 'block', reason: '勸誘借貸投資' },
  { pattern: /槓桿.{0,5}(到底|放大到最大)/, category: 'investment', severity: 'block', reason: '勸誘高槓桿' },
  { pattern: /買.{1,10}必然(發財|致富)/, category: 'investment', severity: 'block', reason: '投資過度承諾' },
  { pattern: /包.{1,3}(發財|致富|中獎|中大獎)/, category: 'investment', severity: 'block', reason: '投資過度承諾' },
  { pattern: /十倍股|百倍股|千倍幣/, category: 'investment', severity: 'warn', reason: '投機誇大' },
  { pattern: /快速致富|快速賺大錢|短時間暴富/, category: 'investment', severity: 'warn', reason: '投機誇大' },
  { pattern: /博彩必贏|賭博必贏|六合彩.{0,3}(必中|一定中)/, category: 'investment', severity: 'block', reason: '賭博引誘' },
]

// ────────────────────────────────────────────────────────────
// 4. 極端命理（block）
//    命理報告應該留有餘地，不說死、不斷言
// ────────────────────────────────────────────────────────────
const EXTREME_FORTUNE: BlacklistItem[] = [
  // 死亡預言
  { pattern: /你會死於/, category: 'extreme_fortune', severity: 'block', reason: '死亡預言' },
  { pattern: /你將死/, category: 'extreme_fortune', severity: 'block', reason: '死亡預言' },
  { pattern: /你的死亡時間/, category: 'extreme_fortune', severity: 'block', reason: '死亡預言' },
  { pattern: /死亡日期/, category: 'extreme_fortune', severity: 'block', reason: '死亡預言' },
  { pattern: /壽命.{0,5}(只剩|僅剩|最多)/, category: 'extreme_fortune', severity: 'block', reason: '壽命預言' },
  { pattern: /活不過.{1,10}歲/, category: 'extreme_fortune', severity: 'block', reason: '壽命預言' },
  { pattern: /命不久矣|命將盡|命在旦夕/, category: 'extreme_fortune', severity: 'block', reason: '壽命預言' },
  { pattern: /早死|短命|夭折/, category: 'extreme_fortune', severity: 'warn', reason: '負面壽命預言' },

  // 關係死刑
  { pattern: /注定(會|要|將).{0,3}離婚/, category: 'extreme_fortune', severity: 'block', reason: '婚姻死刑' },
  { pattern: /一定會離婚|必定離婚|百分百離婚/, category: 'extreme_fortune', severity: 'block', reason: '婚姻死刑' },
  { pattern: /你們.{0,3}不可能(在一起|結婚|白頭)/, category: 'extreme_fortune', severity: 'block', reason: '關係死刑' },
  { pattern: /注定孤獨終老|注定單身一輩子/, category: 'extreme_fortune', severity: 'block', reason: '關係死刑' },
  { pattern: /這輩子嫁不出去|這輩子娶不到/, category: 'extreme_fortune', severity: 'block', reason: '關係死刑' },

  // 事業/財富死刑
  { pattern: /你這輩子.{0,5}(窮|沒錢|不會有錢|不會發達)/, category: 'extreme_fortune', severity: 'block', reason: '事業死刑' },
  { pattern: /你一輩子.{0,5}(失敗|沒出息|成不了)/, category: 'extreme_fortune', severity: 'block', reason: '事業死刑' },
  { pattern: /注定.{0,3}失敗/, category: 'extreme_fortune', severity: 'block', reason: '命運死刑' },
  { pattern: /永遠.{0,3}(翻不了身|沒機會)/, category: 'extreme_fortune', severity: 'block', reason: '命運死刑' },

  // 絕症預言
  { pattern: /你會得癌症|你一定得癌|必得絕症/, category: 'extreme_fortune', severity: 'block', reason: '疾病預言' },
  { pattern: /你會中風|你會癱瘓|你會失明/, category: 'extreme_fortune', severity: 'block', reason: '疾病預言' },

  // 前世業力（高風險用語）
  { pattern: /前世業障深重|前世孽緣深/, category: 'extreme_fortune', severity: 'warn', reason: '業力負面用語' },
  { pattern: /必須.{0,5}(消業|化解業障).{0,5}(否則|不然)/, category: 'extreme_fortune', severity: 'warn', reason: '業力恐嚇' },

  // 不可改變
  { pattern: /不可能改變/, category: 'extreme_fortune', severity: 'warn', reason: '命定論' },
  { pattern: /一切都是天意.*無法改變/, category: 'extreme_fortune', severity: 'warn', reason: '命定論' },

  // 恐嚇式付費
  { pattern: /必須.{0,5}(化解|破解).{0,5}才能/, category: 'extreme_fortune', severity: 'warn', reason: '恐嚇式推銷' },
  { pattern: /不.{0,3}(化解|消除).{0,5}大禍/, category: 'extreme_fortune', severity: 'block', reason: '恐嚇式推銷' },
]

// ────────────────────────────────────────────────────────────
// 5. 歧視與仇恨（block）
// ────────────────────────────────────────────────────────────
const DISCRIMINATION: BlacklistItem[] = [
  // 性別歧視
  { pattern: /女人就是|女的就是|女人都是/, category: 'discrimination', severity: 'warn', reason: '性別刻板印象' },
  { pattern: /男人就該|男人都是|男的都是/, category: 'discrimination', severity: 'warn', reason: '性別刻板印象' },
  { pattern: /女人活該|女人沒用|女人不如/, category: 'discrimination', severity: 'block', reason: '性別歧視' },
  { pattern: /男人活該|男人沒用/, category: 'discrimination', severity: 'block', reason: '性別歧視' },
  { pattern: /(女|男)性.{0,5}(低人一等|劣等|次等)/, category: 'discrimination', severity: 'block', reason: '性別歧視' },

  // 地域歧視
  { pattern: /(大陸人|中國人|台灣人|香港人|日本人|韓國人).{0,5}(都是|就是).{0,3}(壞|低劣|惡心|下賤)/, category: 'discrimination', severity: 'block', reason: '地域歧視' },
  { pattern: /支那|台巴子|426|689/, category: 'discrimination', severity: 'block', reason: '地域仇恨語' },

  // 種族歧視
  { pattern: /黑鬼|尼哥|Nigger|nigga/i, category: 'discrimination', severity: 'block', reason: '種族歧視語' },
  { pattern: /白豬|黃皮|黃種.{0,3}(低劣|賤)/, category: 'discrimination', severity: 'block', reason: '種族歧視語' },
  { pattern: /(黑人|白人|亞洲人).{0,5}(低劣|次等|劣等|下賤)/, category: 'discrimination', severity: 'block', reason: '種族歧視' },

  // 宗教歧視
  { pattern: /佛教是邪教|基督教是邪教|道教是迷信/, category: 'discrimination', severity: 'block', reason: '宗教歧視' },
  { pattern: /穆斯林.{0,5}(都是|就是).{0,3}(恐怖份子|壞)/, category: 'discrimination', severity: 'block', reason: '宗教歧視' },

  // 性傾向歧視
  { pattern: /同性戀.{0,5}(變態|不正常|病|死)/, category: 'discrimination', severity: 'block', reason: '性傾向歧視' },
  { pattern: /(Gay|Lesbian).{0,3}(變態|不正常)/i, category: 'discrimination', severity: 'block', reason: '性傾向歧視' },

  // 身障歧視
  { pattern: /(殘廢|殘疾).{0,3}(沒用|廢物|該死)/, category: 'discrimination', severity: 'block', reason: '身障歧視' },
  { pattern: /智障|白痴|腦殘/, category: 'discrimination', severity: 'warn', reason: '貶抑性用語' },

  // 年齡歧視
  { pattern: /老人.{0,3}(沒用|廢物|該死)/, category: 'discrimination', severity: 'block', reason: '年齡歧視' },

  // 階級歧視
  { pattern: /窮人.{0,5}(活該|低人一等|該死)/, category: 'discrimination', severity: 'block', reason: '階級歧視' },
  { pattern: /窮酸|屌絲|下等人/, category: 'discrimination', severity: 'warn', reason: '貶抑性用語' },

  // 仇恨鼓動
  { pattern: /去死|該死|活該去死/, category: 'discrimination', severity: 'warn', reason: '仇恨語' },
  { pattern: /殺光.{0,5}(人|族|黨)/, category: 'discrimination', severity: 'block', reason: '煽動暴力' },
]

// ────────────────────────────────────────────────────────────
// 6. 不當性內容（block）
// ────────────────────────────────────────────────────────────
const SEXUAL: BlacklistItem[] = [
  { pattern: /性交|做愛|上床|肏|幹炮|性愛/, category: 'sexual', severity: 'block', reason: '露骨性內容' },
  { pattern: /陰莖|陰道|陽具|肉棒|肉穴/, category: 'sexual', severity: 'block', reason: '生殖器露骨描寫' },
  { pattern: /高潮|射精|性高潮|達到高潮/, category: 'sexual', severity: 'block', reason: '露骨性內容' },
  { pattern: /援交|賣淫|嫖妓|找小姐/, category: 'sexual', severity: 'block', reason: '性交易' },
  { pattern: /未成年.*性|兒童.*(色情|性)/, category: 'sexual', severity: 'block', reason: '未成年性內容（嚴重違法）' },
  { pattern: /強姦|強暴|性侵/, category: 'sexual', severity: 'warn', reason: '性暴力用語（教育與暴力情境可能需要）' },
  { pattern: /戀童癖/, category: 'sexual', severity: 'block', reason: '未成年性內容' },
  { pattern: /成人片|A片|色情片|三級片/, category: 'sexual', severity: 'warn', reason: '色情引用' },
  { pattern: /(他|她|你).{0,5}非常.{0,3}(騷|淫蕩|浪)/, category: 'sexual', severity: 'block', reason: '性貶抑' },
]

// ────────────────────────────────────────────────────────────
// 7. 暴力內容（block / warn）
// ────────────────────────────────────────────────────────────
const VIOLENCE: BlacklistItem[] = [
  { pattern: /殺了.{0,3}(他|她|你|對方|配偶|老公|老婆)/, category: 'violence', severity: 'block', reason: '鼓動殺害' },
  { pattern: /教你.{0,5}(殺人|下毒|謀殺)/, category: 'violence', severity: 'block', reason: '教唆犯罪' },
  { pattern: /(買|製作|使用)槍.{0,3}(殺|傷)/, category: 'violence', severity: 'block', reason: '武器暴力' },
  { pattern: /炸彈.{0,3}(製作|使用)/, category: 'violence', severity: 'block', reason: '爆裂物製作' },
  { pattern: /下毒|投毒/, category: 'violence', severity: 'warn', reason: '毒害用語' },
  { pattern: /虐待.{0,3}(小孩|兒童|動物)/, category: 'violence', severity: 'block', reason: '虐待未成年/動物' },
  { pattern: /家暴.{0,5}(合理|應該|有理)/, category: 'violence', severity: 'block', reason: '合理化暴力' },
]

// ────────────────────────────────────────────────────────────
// 8. 合併所有清單
// ────────────────────────────────────────────────────────────
export const MODERATION_BLACKLIST: BlacklistItem[] = [
  ...POLITICS,
  ...MEDICAL,
  ...INVESTMENT,
  ...EXTREME_FORTUNE,
  ...DISCRIMINATION,
  ...SEXUAL,
  ...VIOLENCE,
]

// ────────────────────────────────────────────────────────────
// 誤殺白名單：命理報告常見合法用語，但可能觸發 pattern
// 在掃描前先把這些片段「抹掉」再走黑名單
// ────────────────────────────────────────────────────────────
export const FALSE_POSITIVE_WHITELIST: RegExp[] = [
  // 命理常見討論（合理語境）
  /離婚.{0,5}(機率|風險|傾向|議題|議題上|課題)/g,
  /(健康|身心).{0,5}(注意|風險|議題|課題)/g,
  /(投資|理財).{0,5}(建議.{0,5}保守|以保守為主|謹慎評估|風險管理)/g,
  /癌症.{0,5}(家族史|體質|防範)/g,
  // 命理術語
  /業力.{0,5}(課題|功課|成長)/g,
]

/**
 * 將白名單命中處抹除，避免誤殺
 */
export function stripWhitelistedFragments(content: string): string {
  let cleaned = content
  for (const pattern of FALSE_POSITIVE_WHITELIST) {
    cleaned = cleaned.replace(pattern, '')
  }
  return cleaned
}

/**
 * 依黑名單掃描內文，回傳命中清單
 * @param content 待掃描文字（建議先用 stripWhitelistedFragments 清過）
 * @returns 每項命中含分類、嚴重度、匹配片段、上下文
 */
export interface BlacklistHit {
  category: ModerationCategory
  severity: ModerationSeverity
  reason: string
  pattern: string      // 可讀的 pattern 描述
  matchedText: string  // 實際命中文字
  snippet: string      // 上下文片段（用於 admin 審查）
}

export function scanBlacklist(content: string): BlacklistHit[] {
  const hits: BlacklistHit[] = []
  const cleaned = stripWhitelistedFragments(content)

  for (const item of MODERATION_BLACKLIST) {
    const pattern = item.pattern
    if (typeof pattern === 'string') {
      const idx = cleaned.indexOf(pattern)
      if (idx !== -1) {
        hits.push({
          category: item.category,
          severity: item.severity,
          reason: item.reason,
          pattern,
          matchedText: pattern,
          snippet: extractSnippet(cleaned, idx, pattern.length),
        })
      }
    } else {
      // 正則：使用全域 flag 避免 stateful 問題
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g')
      let match: RegExpExecArray | null
      let safetyCounter = 0
      while ((match = re.exec(cleaned)) !== null && safetyCounter < 50) {
        hits.push({
          category: item.category,
          severity: item.severity,
          reason: item.reason,
          pattern: pattern.source,
          matchedText: match[0],
          snippet: extractSnippet(cleaned, match.index, match[0].length),
        })
        safetyCounter++
        // 防止 zero-width match 卡住
        if (match[0].length === 0) re.lastIndex++
      }
    }
  }
  return hits
}

/**
 * 擷取命中片段的上下文（前後各 40 字）
 */
function extractSnippet(content: string, index: number, length: number): string {
  const start = Math.max(0, index - 40)
  const end = Math.min(content.length, index + length + 40)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < content.length ? '…' : ''
  return prefix + content.slice(start, end) + suffix
}

/**
 * 依 category 聚合命中結果
 */
export function summarizeHits(hits: BlacklistHit[]): {
  blocked: boolean
  blockCount: number
  warnCount: number
  byCategory: Record<ModerationCategory, { block: number; warn: number }>
} {
  const byCategory: Record<string, { block: number; warn: number }> = {}
  let blockCount = 0
  let warnCount = 0
  for (const h of hits) {
    if (!byCategory[h.category]) byCategory[h.category] = { block: 0, warn: 0 }
    if (h.severity === 'block') {
      byCategory[h.category].block++
      blockCount++
    } else {
      byCategory[h.category].warn++
      warnCount++
    }
  }
  return {
    blocked: blockCount > 0,
    blockCount,
    warnCount,
    byCategory: byCategory as Record<ModerationCategory, { block: number; warn: number }>,
  }
}
