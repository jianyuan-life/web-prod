// ============================================================
// 英文翻譯字典（繁體中文 → English）
// ============================================================
// 使用方式：LocaleContent.tsx 在 en 模式下、以 text-node 原文（繁體）
// 作為 key 查表；未命中者保留原文 + dev 環境 console.warn。
//
// 14 套命理系統專業名詞對照國際標準：
//   Bazi, Zi Wei Dou Shu, Qi Men Dun Jia, Feng Shui Xuan Kong,
//   Name Numerology, Western Astrology, Vedic Astrology, I Ching,
//   Human Design, Numerology, Nine Star Ki, Tarot,
//   Chinese Zodiac, Biorhythm
// ============================================================

// 報告方案名
export const EN_PLAN_NAMES: Record<string, string> = {
  '人生藍圖': 'Life Blueprint',
  '心之所惑': 'Inner Quest',
  '家族藍圖': 'Family Blueprint',
  '合否？': 'Compatibility Report',
  '合否': 'Compatibility Report',
  '事件擇吉': 'Event Direction Guide',
  '月度單盤': 'Monthly Direction',
  '月度精選': 'Weekly Fortune Boost',
  '年度全運': 'Annual Blueprint',
}

// 14 套系統名 / 派別 / 經典古籍
export const EN_SYSTEM_NAMES: Record<string, string> = {
  '八字命理': 'Bazi (Four Pillars of Destiny)',
  '八字': 'Bazi',
  '紫微斗數': 'Zi Wei Dou Shu (Purple Star Astrology)',
  '紫微': 'Zi Wei Dou Shu',
  '奇門遁甲': 'Qi Men Dun Jia',
  '奇門': 'Qi Men',
  '風水堪輿': 'Feng Shui Xuan Kong',
  '風水': 'Feng Shui',
  '西洋占星': 'Western Astrology',
  '姓名學': 'Name Numerology',
  '吠陀占星': 'Vedic Astrology (Lahiri Ayanamsa)',
  '吠陀': 'Vedic',
  '易經占卜': 'I Ching Divination',
  '易經': 'I Ching',
  '人類圖': 'Human Design',
  '數字能量學': 'Numerology',
  '古典占星': 'Nine Star Ki (Classical)',
  '塔羅牌': 'Tarot',
  '塔羅': 'Tarot',
  '生肖運勢': 'Chinese Zodiac',
  '生肖': 'Chinese Zodiac',
  '生物節律': 'Biorhythm',
  '南洋術數': 'Southeast Asian Numerology',
  // 派別
  '北派古法': 'Northern School (Classical)',
  '沈氏玄空': 'Shen Family Xuan Kong',
  '月家奇門古法': 'Classical Month-Family Qi Men',
  '時家奇門': 'Hour-Family Qi Men',
  '古法奇門遁甲': 'Classical Qi Men Dun Jia',
  // 經典古籍
  '《滴天髓》': 'Di Tian Sui',
  '《紫微斗數全書》': 'Complete Zi Wei Dou Shu',
  '《窮通寶鑑》': 'Qiong Tong Bao Jian',
  '《奇門遁甲統宗》': 'Qi Men Dun Jia Tong Zong',
  '《子平真詮》': 'Zi Ping Zhen Quan',
  '《青囊經》': 'Qing Nang Jing',
  '《沈氏玄空學》': 'Shen Family Xuan Kong Treatise',
  '《煙波釣叟歌》': 'Yan Bo Diao Sou Ge',
}

// 通用 UI / 導航 / CTA / 頁腳
export const EN_UI: Record<string, string> = {
  // Brand & nav
  '鑒源': 'JianYuan',
  '鑑源': 'JianYuan',
  '系統介紹': 'Systems',
  '方案定價': 'Pricing',
  '免費速算': 'Free Tools',
  '登入': 'Sign In',
  '免費註冊': 'Sign Up Free',
  '我的報告': 'My Reports',
  '登出': 'Sign Out',
  '知識': 'Blog',
  '研究部落格': 'Research Blog',
  '十四大系統': 'The Fourteen Systems',
  '十四套系統': 'fourteen systems',
  '十四個維度': 'fourteen dimensions',
  '十四大命理系統': 'Fourteen Metaphysical Systems',
  '十四套系統交叉驗證': 'Cross-validated by 14 Systems',
  '核心系統': 'Core',
  '補充系統': 'Supplementary',
  '參考系統': 'Reference',
  '核心': 'Core',
  '補充': 'Suppl.',
  '參考': 'Ref.',

  // Hero
  '也許你正在尋找一個答案': 'Perhaps you are searching for an answer',
  '用十四個維度，重新認識你自己': 'Rediscover yourself through fourteen dimensions',
  '你來到這裡，不是因為迷信，而是因為你想為自己的人生': 'You came here not out of superstition, but because you want to',
  '找到一個更清晰的方向。讓我們陪你，看見那個真實的自己。': 'find a clearer direction for your life. Let us walk with you, to see your true self.',
  '探索完整方案': 'Explore All Plans',
  '人已體驗': 'have tried it',
  '不需註冊': 'No signup required',
  '完全免費': 'Completely free',
  '不需信用卡': 'No credit card',
  '不需付費': 'No payment',

  // Empathy section
  '也許你正在經歷一段不容易的時光。': 'Perhaps you are going through a difficult time.',
  '也許你對自己的方向感到困惑，': 'Perhaps you feel confused about your direction,',
  '對未來有些不確定，甚至有些焦慮。': 'uncertain about the future, even a little anxious.',
  '你來到這裡，本身就是一種勇氣。': 'Coming here is itself an act of courage.',
  '命理不是算命，不是迷信——': 'Metaphysics is not fortune-telling, not superstition —',
  '它是一面鏡子，幫助你': 'it is a mirror, helping you',
  '看見自己本來的樣子': 'see who you truly are',
  '而鑒源，想做的是': 'and what JianYuan wants to do is',
  '陪你一起照這面鏡子': 'look into that mirror together with you',

  // Free tools hero block
  '30 秒，免費看見你的命格密碼': '30 seconds to see your destiny code, free',
  '只需姓名、生日、性別，即刻獲得八字排盤 + AI 深度分析': 'Just your name, birth date and gender — instant Bazi chart + deep AI analysis',
  '立即免費體驗': 'Try Free Now',

  // Trust indicators
  '命理系統': 'Metaphysical systems',
  '東西方完整覆蓋': 'Covering both Eastern and Western traditions',
  '條專業規則': 'professional rules',
  '源自《滴天髓》《窮通寶鑑》等經典古籍': 'from classics such as Di Tian Sui and Qiong Tong Bao Jian',
  '隱私保護': 'Privacy protected',
  '資料加密傳輸與儲存': 'Encrypted transmission and storage',
  '8 種方案任你選擇': '8 plans to choose from',
  '起': 'from',

  // Differences
  '差異': 'Difference',
  '市面上的命理服務，和鑒源有什麼不同？': 'How is JianYuan different from other metaphysics services?',
  '傳統命理師': 'Traditional Metaphysicians',
  '鑒源命理': 'JianYuan',
  '免費算命網站': 'Free Fortune Sites',
  '推薦': 'Recommended',
  '只用 1-2 套系統': 'Use only 1–2 systems',
  '結論因人而異，難以驗證': 'Inconsistent conclusions, hard to verify',
  '收費 $100-$300 美金': 'Charges $100–$300 USD',
  '等待 3-7 天出結果': '3–7 day turnaround',
  '人為偏見影響判斷': 'Human bias affects judgement',
  '最多 14 套系統交叉分析': 'Up to 14 systems cross-analyzed',
  '44,421+ 條規則客觀運算': '44,421+ rules applied objectively',
  '最低 $29 美金起': 'Starting from $29 USD',
  '報告約 30-60 分鐘完成': 'Report ready in ~30–60 minutes',
  '規則驅動，排盤可驗證': 'Rule-driven, charts are verifiable',
  '套公式的罐頭回覆': 'Formulaic canned responses',
  '千篇一律的描述': 'Cookie-cutter descriptions',
  '沒有個人化深度': 'No personal depth',
  '無法回答「為什麼」': 'Cannot answer "why"',
  '沒有行動建議': 'No actionable advice',

  // Four advantages
  '核心優勢': 'Core Advantages',
  '四個理由，讓命理真正有用': 'Four reasons why metaphysics becomes truly useful',
  '不只是算命，而是一次對自己的深度認識': 'Not just fortune-telling — a deep understanding of yourself',
  '14 系統交叉驗證': '14-System Cross-Validation',
  '不是「某位老師說」，而是十四套東西方命理系統的共識。三層加權架構確保結論經得起推敲。':
    'Not "what one master said" — but consensus across fourteen Eastern and Western systems. A three-tier weighted architecture ensures every conclusion stands up to scrutiny.',
  '古籍 + 科技雙引擎': 'Classics + Technology Dual Engine',
  '44,421+ 條規則源自《滴天髓》《紫微斗數全書》《窮通寶鑑》等經典，由分析引擎整合成有深度的個人化報告。':
    '44,421+ rules distilled from classics such as Di Tian Sui, Complete Zi Wei Dou Shu and Qiong Tong Bao Jian, integrated by an analysis engine into a deeply personalized report.',
  '不只看命，更能行動': 'Know Your Fate — Then Act on It',
  '特色「出門訣」：源自《煙波釣叟歌》的千年擇吉術，25 層評分體系精算吉時方位，涵蓋三吉門、九遁、天地盤干生剋，套入個人年命宮，讓命理從了解走向行動。':
    'Our signature Direction Guide: a 1,000-year-old Qi Men day-picking art from the classic Yan Bo Diao Sou Ge. A 25-layer scoring system evaluates auspicious hours and directions — covering the three auspicious gates, nine escapes, heaven-earth stem interactions — cross-checked with your personal Life Palace. Turns understanding into action.',
  '有溫度的陪伴': 'Companionship with Warmth',
  '每份報告不只有數據，更有理解與共情。命理是自我對話的過程，而我們想陪你走這段路。':
    'Every report carries not only data but understanding and empathy. Metaphysics is a process of self-dialogue — and we want to walk that path with you.',

  // Systems section (note: · is U+00B7 MIDDLE DOT rendered from &middot;)
  '東方古典智慧 · 西方占星體系': 'Eastern Classical Wisdom · Western Astrological Systems',
  '東方古典智慧·西方占星體系': 'Eastern Classical Wisdom · Western Astrological Systems',
  '東方古典智慧': 'Eastern Classical Wisdom',
  '西方占星體系': 'Western Astrological Systems',
  '植根經典 · 融合科技': 'Rooted in Classics · Powered by Technology',
  '植根經典·融合科技': 'Rooted in Classics · Powered by Technology',
  '植根經典': 'Rooted in Classics',
  '融合科技': 'Powered by Technology',
  '每套系統各司其職，交叉驗證給你最完整的答案':
    'Each system plays a distinct role — cross-validation gives you the most complete answer',

  // System descriptions
  '看清你天生的性格底色、一生的高峰低谷期，以及事業、感情、財運的先天優勢與功課':
    'Reveal your innate personality, the peaks and troughs of your life, and your natural strengths and lessons in career, relationships and wealth.',
  '從事業、感情、財運、健康等十二個人生面向，看清你一生的發展方向與每個階段的重點':
    'Across twelve life domains — career, relationships, wealth, health — see your lifelong direction and the focus of each life stage.',
  '找到最適合你行動的時機與方向——什麼時候出手、往哪走，讓決策不再靠猜':
    'Find the right timing and direction for action — when to act, where to go — so decisions are no longer guesswork.',
  '了解你的居住環境如何影響你的運勢，以及可以做哪些簡單調整來改善':
    'Understand how your living environment shapes your fortune, and the simple adjustments that improve it.',
  '透過太陽、月亮、上升星座，看見你的外在表現、內在需求，以及人生不同階段的成長主題':
    'Through Sun, Moon and Ascendant, see your outer expression, inner needs, and the growth themes of each life stage.',
  '解讀你的名字帶給你的能量——它如何影響你的人際、事業，以及別人對你的第一印象':
    'Decode the energy your name carries — how it shapes your relationships, career, and the first impression others form.',
  '來自印度千年智慧的第二視角，用不同的座標系統交叉驗證你的人生軌跡':
    'A second perspective from India’s thousand-year tradition — a different coordinate system cross-validating your life trajectory.',
  '用最古老的智慧回答你最當下的困惑——一事一問，直指核心':
    'The most ancient wisdom answering your most immediate question — one matter, one question, straight to the core.',
  '發現你的能量運作方式——什麼時候該主動、什麼時候該等待，怎麼做決定最不後悔':
    'Discover how your energy operates — when to initiate, when to wait, how to decide with least regret.',
  '從你的出生日期解讀天賦、空缺與今年的成長主題——簡單卻深刻':
    'Read from your birth date your gifts, gaps and this year’s growth theme — simple yet profound.',
  '用中國傳統天文觀測法，從另一個角度驗證你的命格特質與流年走向':
    'Using Chinese classical astronomical observation, verify your destiny traits and annual trends from another angle.',
  '映照你潛意識的鏡子——看見你內心深處已經知道、但還沒說出口的答案':
    'A mirror to your subconscious — see the answer your heart already knows but has not yet spoken.',
  '今年的太歲關係如何？哪些月份要特別留意、哪些月份適合大展拳腳':
    'How stands your Tai Sui this year? Which months call for caution, which ones invite bold action?',
  '精算你的體力、情緒、思維三大週期，找到每個月狀態最好的日子':
    'Precisely calculate your three cycles — physical, emotional, intellectual — to find your best days each month.',
  '融合東南亞多元文化的命理智慧，提供獨特的跨文化驗證視角':
    'Drawing on Southeast Asia’s multicultural wisdom for a unique cross-cultural validation perspective.',

  // Classics section
  '源流': 'Origins',
  '本系統的分析框架建立在數十部命理經典之上——': 'Our analytical framework is built upon dozens of metaphysical classics —',
  '八字取法《滴天髓》《窮通寶鑑》《子平真詮》，': 'Bazi draws from Di Tian Sui, Qiong Tong Bao Jian and Zi Ping Zhen Quan;',
  '紫微參照《紫微斗數全書》《太微賦》，': 'Zi Wei follows the Complete Zi Wei Dou Shu and Tai Wei Fu;',
  '奇門依據《奇門遁甲統宗》《煙波釣叟歌》，': 'Qi Men is based on Qi Men Dun Jia Tong Zong and Yan Bo Diao Sou Ge;',
  '風水根植《青囊經》《沈氏玄空學》。': 'Feng Shui is rooted in Qing Nang Jing and Shen Family Xuan Kong Treatise.',
  '每一條分析規則，皆有典籍出處，絕非憑空推演。': 'Every analytical rule has a classical source — never fabricated out of thin air.',

  // Process
  '流程': 'Process',
  '五步完成命格分析': 'Five Steps to Your Destiny Report',
  '壹': 'I', '貳': 'II', '參': 'III', '肆': 'IV', '伍': 'V',
  '免費體驗': 'Free Trial',
  '輸入出生資料，即時查看八字排盤與性格分析': 'Enter your birth data for an instant Bazi chart and personality analysis',
  '選擇方案': 'Choose a Plan',
  '8 種方案，從個人到家庭，從 $29 起': '8 plans from personal to family — starting at $29',
  '填寫資料': 'Provide Your Data',
  '姓名、出生日期時間、性別，簡單三步': 'Name, birth date/time and gender — just three simple steps',
  '深度分析': 'Deep Analysis',
  '專業規則逐系統交叉分析': 'Professional rules cross-analyzed across every system',
  '查看報告': 'Read Your Report',
  '線上閱讀 + PDF 永久保存，隨時回顧': 'Read online + permanent PDF — revisit anytime',

  // Pricing section on home
  '方案': 'Plans',
  '選擇適合您的方案': 'Choose the plan that fits you',
  '從 $29 起，每份報告都包含網頁展示 + PDF 永久保存': 'From $29 — every report includes a web view + permanent PDF',
  '還有家庭、關係、出門訣方案': 'There are also Family, Relationship, and Direction Guide plans',
  '查看全部 8 種方案與詳細介紹': 'View all 8 plans in detail',

  // Direction guide promo
  '鑒源特色': 'JianYuan Signature',
  '奇門遁甲出門訣 — 讓命理真正落地': 'Qi Men Dun Jia Direction Guide — metaphysics put into practice',
  '命理分析告訴你「你是誰」，出門訣告訴你「怎麼做」。 源自《煙波釣叟歌》與《奇門遁甲統宗》的千年擇吉術， 系統以 25 層評分體系精算每個時辰八方位的能量——三吉門、三奇、八神、九星旺衰、天地盤干生剋、九遁格局， 再套入您的個人年命宮驗證，找出最適合您的吉時、方位與信心指數。 在指定時間朝吉方走出 500 公尺，靜坐接氣 40 分鐘，讓天時地利的能量灌注到您身上。':
    'Metaphysics tells you who you are; the Direction Guide tells you how to act. Drawing on a 1,000-year-old day-picking art from Yan Bo Diao Sou Ge and Qi Men Dun Jia Tong Zong, a 25-layer scoring system evaluates the energy of every two-hour period across all eight directions — three auspicious gates, three wonders, eight spirits, nine stars, heaven-earth stem interactions, nine escapes — and cross-checks it against your personal Life Palace to find your best time, direction and confidence level. At the appointed hour, walk 500m toward the auspicious direction and sit in meditation for 40 minutes to draw in the timing of heaven and earth.',
  '命理分析告訴你「你是誰」，出門訣告訴你「怎麼做」。源自《煙波釣叟歌》與《奇門遁甲統宗》的千年擇吉術，系統以 25 層評分體系精算每個時辰八方位的能量——三吉門、三奇、八神、九星旺衰、天地盤干生剋、九遁格局，再套入您的個人年命宮驗證，找出最適合您的吉時、方位與信心指數。在指定時間朝吉方走出 500 公尺，靜坐接氣 40 分鐘，讓天時地利的能量灌注到您身上。':
    'Metaphysics tells you who you are; the Direction Guide tells you how to act. Drawing on a 1,000-year-old day-picking art from Yan Bo Diao Sou Ge and Qi Men Dun Jia Tong Zong, a 25-layer scoring system evaluates the energy of every two-hour period across all eight directions — three auspicious gates, three wonders, eight spirits, nine stars, heaven-earth stem interactions, nine escapes — and cross-checks it against your personal Life Palace to find your best time, direction and confidence level. At the appointed hour, walk 500m toward the auspicious direction and sit in meditation for 40 minutes to draw in the timing of heaven and earth.',
  '探索出門訣': 'Explore Direction Guides',
  '事件擇吉 $59': 'Event Direction $59',
  '月度單盤 $29': 'Monthly Direction $29',

  // Founder section
  '為什麼是鑒源': 'Why JianYuan',

  // Testimonials
  '用戶心聲': 'Voices of Our Users',
  '使用情境': 'Scenarios',
  '以下為示範情境，展示鑒源報告可以如何幫助您': 'These are illustrative scenarios showing how a JianYuan report can help',

  // FAQ section
  '常見問題': 'FAQ',
  '您可能想知道': 'You might be wondering',
  '鑒源的命理分析準確嗎？': 'Is JianYuan’s analysis accurate?',
  '報告多久可以收到？': 'How soon will I receive the report?',
  '需要提供什麼資料？': 'What information do I need to provide?',
  '14套系統會不會互相矛盾？': 'Do the 14 systems ever contradict each other?',
  '付款安全嗎？': 'Is payment secure?',
  '可以退款嗎？': 'Can I get a refund?',
  '什麼是出門訣？怎麼用？': 'What is the Direction Guide and how is it used?',
  '報告是繁體還是簡體？': 'Is the report in Traditional or Simplified Chinese?',
  '報告會不會讓我更焦慮？': 'Will the report make me more anxious?',

  // FAQ 答案（home + pricing 共用 — 皆為 text-node 整段輸出）
  '排盤計算使用確定性算法（如壽星天文曆、Swiss Ephemeris），結果可重複驗證，與專業命理軟體一致。分析解讀基於數十部經典古籍提煉的專業規則，經引擎精密計算整合成個人化報告。鑒源最多用十四套系統交叉分析——當多數系統得出相同結論時，可信度遠高於單一系統的判斷。':
    'Chart calculations use deterministic algorithms (Shouxing Astronomical Calendar, Swiss Ephemeris) and are reproducible, matching professional metaphysics software. Interpretation is grounded in professional rules distilled from dozens of classical texts, precisely integrated by our engine into a personalized report. JianYuan cross-analyzes with up to fourteen systems — when the majority agree, reliability far exceeds any single system’s judgement.',
  '鑒源的排盤計算使用確定性算法（壽星天文曆、Swiss Ephemeris），排盤結果可重複驗證，與專業命理軟體一致。分析解讀基於數十部經典古籍提煉的專業規則。我們最多用十四套系統交叉分析——當多數系統得出相同結論時，可信度遠高於單一系統。':
    'JianYuan uses deterministic algorithms (Shouxing Astronomical Calendar, Swiss Ephemeris); chart results are reproducible and match professional metaphysics software. Interpretation draws on professional rules distilled from dozens of classical texts. We cross-analyze with up to fourteen systems — when the majority agree, reliability far exceeds any single system.',
  '付款後系統自動開始運算。個人報告（人生藍圖、心之所惑）約 30 分鐘完成；出門訣需排算數百個時辰，約需 40 分鐘以上。完成後會立即寄送 Email 通知，您也可以在儀表板即時查看分析進度。':
    'After payment, the system starts calculating automatically. Personal reports (Life Blueprint, Inner Quest) take about 30 minutes; Direction Guides compute hundreds of time-periods and take 40+ minutes. You’ll receive an email as soon as it’s ready, and can see real-time progress on your dashboard.',
  '個人報告（人生藍圖、心之所惑）約 30 分鐘；家族藍圖和合否根據人數而定；出門訣因需精密計算整月或整年的盤面能量，完成時間約 5-40 分鐘不等。付款後系統全自動運算，完成後即可於網頁上查看。':
    'Personal reports (Life Blueprint, Inner Quest) take about 30 minutes; Family Blueprint and Compatibility depend on number of members; Direction Guides take 5–40 minutes depending on the scope. Everything runs automatically after payment; the web page displays your report as soon as it’s complete.',
  '姓名、出生日期、出生時間（時辰）、性別。出生時間越精確，分析越準確。如果不確定出生時間，可以選擇最接近的時辰，部分不依賴時辰的系統仍可正常分析。':
    'Name, birth date, birth time (hour), and gender. The more precise your birth time, the more accurate the analysis. If unsure, pick the nearest two-hour period — systems that don’t rely on birth time will still work normally.',
  '不同系統觀察的角度不同，偶有差異屬正常。這正是鑒源的核心價值——我們用三層加權架構進行交叉驗證，取各系統共識作為最終結論。單一系統只有一個觀點，十四套系統交叉驗證才能得到更全面、更可靠的結論。':
    'Different systems look at things from different angles — minor divergences are normal. That is precisely JianYuan’s core value: we use a three-tier weighted architecture for cross-validation and take the consensus as the final conclusion. A single system offers only one perspective; fourteen systems together yield a more comprehensive, reliable answer.',
  '所有付款透過國際知名的 Stripe 安全系統處理，支援信用卡和各種支付方式。您的信用卡資訊完全由 Stripe 處理，不會經過鑒源伺服器。Stripe 已通過 PCI DSS Level 1 認證，是全球最高等級的支付安全標準。':
    'All payments are processed by the internationally recognized Stripe. Your credit card information is handled entirely by Stripe and never passes through JianYuan’s servers. Stripe holds PCI DSS Level 1 certification — the highest global payment-security standard.',
  '透過 Stripe（PCI DSS Level 1 認證）處理，支援 Visa、Mastercard、AMEX 等主流信用卡。您的卡號不會經過鑒源伺服器，全程加密。':
    'Processed by Stripe (PCI DSS Level 1 certified), supporting Visa, Mastercard, AMEX and more. Your card number never passes through JianYuan’s servers — encrypted end-to-end.',
  '報告為虛擬數位內容，一旦開始生成即消耗運算資源，因此生成後不支持退款。如果報告品質有任何問題，請聯繫 support@jianyuan.life，我們會為您免費重新生成，確保您獲得滿意的分析結果。':
    'Reports are virtual digital content; once generation begins, compute resources are consumed, so refunds are not supported after generation. If there is any quality issue, please contact support@jianyuan.life — we will regenerate it free of charge to ensure your satisfaction.',
  '報告為虛擬數位內容，一旦開始生成即消耗大量運算資源，因此生成後不支持退款。如果報告品質有任何問題，請聯繫 support@jianyuan.life，我們會免費重新生成。':
    'Reports are virtual digital content; once generation begins, significant compute resources are consumed, so refunds are not supported after generation. For any quality issue, contact support@jianyuan.life and we will regenerate it free of charge.',
  '出門訣源自奇門遁甲的千年擇吉術，古籍《煙波釣叟歌》記載：「吉門吉方即行，凶門凶方即止。」我們的系統以 25 層評分體系（三吉門、三奇、八神、九星旺衰、天地盤干生剋、九遁格局等）精算每個時辰八方位的能量，再套入您的個人年命宮驗證。使用方法：在報告推薦的吉時準時出門，朝吉方走 500 公尺以上，到達後面朝吉方靜坐接氣 40 分鐘。如有重要事（面試、簽約、談判），接氣後直接前往，效果最強。支援 15 種事件分類（求財、事業、感情、考試、談判、婚姻等），報告附帶 Google Calendar 一鍵新增。':
    'The Direction Guide comes from the thousand-year-old day-picking art of Qi Men Dun Jia. The classic Yan Bo Diao Sou Ge says: "When gates and directions are auspicious, proceed; when inauspicious, stop." Our system uses a 25-layer scoring scheme (three auspicious gates, three wonders, eight spirits, nine stars, heaven-earth stem interactions, nine escapes, etc.) to evaluate the energy of every two-hour period across all eight directions, then cross-checks with your personal Life Palace. How to use: go out on time at the recommended auspicious hour, walk at least 500m toward the auspicious direction, then sit facing that direction for 40 minutes. If you have an important matter (interview, signing, negotiation), proceed directly afterward for maximum effect. 15 event categories are supported (wealth, career, relationships, exams, negotiation, marriage, etc.) and the report includes one-click Google Calendar invitations.',
  '根據您使用網站時的語言設定自動決定。網站右上角可隨時切換繁簡體，報告會以您選擇的語言版本生成。':
    'Determined automatically by your website language setting. You can switch between Traditional/Simplified Chinese (and English) from the top right at any time; the report will be generated in your chosen language.',
  '不會。鑒源的報告融合正向心理學框架，所有分析都以「理解自己、找到方向」為目標，而非製造恐懼。我們不說「命中注定」「今年大凶」這類話。即使命盤中有挑戰的面向，我們也會用你聽得懂的語言解釋它的意義，並給出具體可行的方向。每份報告的最後都有一段「寫給你的話」，是鑒源團隊用心為你寫的個人化寄語。':
    'No. JianYuan reports are built on a positive-psychology framework — all analysis aims at "understanding yourself and finding direction", not creating fear. We don’t use phrases like "fate-bound" or "this year is catastrophic". Even when the chart reveals challenging aspects, we explain their meaning in language you can understand and give concrete, actionable direction. Every report ends with "A Letter to You" — a personalized message carefully written for you by the JianYuan team.',
  '「人生藍圖」是全面分析——動用十四套系統涵蓋性格、事業、財運、感情、健康、大運等所有面向。「心之所惑」則聚焦在你最在乎的一個問題，精選最相關的系統深入剖析。':
    'Life Blueprint is a full analysis — deploying all fourteen systems to cover personality, career, wealth, relationships, health, and major life cycles. Inner Quest focuses on the single question you care most about, using only the most relevant systems for a deep dive.',
  '人生藍圖和心之所惑有什麼差別？': 'What’s the difference between Life Blueprint and Inner Quest?',
  '四個出門訣方案怎麼選？': 'How do I choose among the four Direction Guide plans?',
  'E1 事件擇吉（$59）針對單一重要事件推 Top3 吉時；E2 月度單盤（$29）當月購買當月執行、晦日 21:00 前截止；E3 月度精選（$89）主題精選用神、4 週共 8 個吉時；E4 年度全運（$279）年盤＋12 月盤全年佈局、立春前 30 天限時。':
    'E1 Event Direction Guide ($59) picks Top3 auspicious hours for one important event; E2 Monthly Direction ($29) must be purchased and executed in the same lunar month, cut-off at 21:00 on the last lunar day; E3 Weekly Fortune Boost ($89) picks a theme and gives 8 auspicious hours across 4 weeks; E4 Annual Blueprint ($279) covers a full year with an annual chart plus 12 monthly charts, sold only in the 30 days before Lichun.',
  '不確定出生時間怎麼辦？': 'What if I’m not sure of my birth time?',
  '可以選擇最接近的時辰。即使時間不完全精確，十四套系統中有多套不依賴精確時辰（如姓名學、數字能量學、生肖運勢等），仍能提供有價值的分析。':
    'Pick the nearest two-hour period. Even without a precise time, many of the fourteen systems — such as Name Numerology, Numerology, and Chinese Zodiac — do not depend on an exact hour and still yield valuable analysis.',
  '出門訣為什麼不提供「隔天」替代方案？': 'Why doesn’t the Direction Guide offer a "next-day" alternative?',
  '古法奇門遁甲「一時一盤」，每個時辰的盤面能量不同，隔天就是完全不同的能量組合。若錯過推薦的吉時，只能等待下一個系統推薦的時窗。':
    'In classical Qi Men Dun Jia, "each hour is its own chart" — every two-hour period has unique energy, and the next day is an entirely different combination. If you miss the recommended auspicious hour, simply wait for the next window the system identifies.',

  // Pricing guide block
  '第一次體驗：': 'First time here: ',
  '先去': 'start with ',
  '看效果，再選「心之所惑」（$39）聚焦你最在乎的問題。': 'to see how it feels, then pick Inner Quest ($39) to focus on the question you care most about.',
  '全面了解自己：': 'Understand yourself fully: ',
  '「人生藍圖」（$89）完整分析人生各面向，最超值。': 'Life Blueprint ($89) gives a complete analysis across every life dimension — best value.',
  '有特定困惑：': 'Have a specific concern: ',
  '「心之所惑」（$39）聚焦一個面向深入剖析。': 'Inner Quest ($39) zooms in on one dimension for a deep analysis.',
  '全家分析：': 'Whole-family analysis: ',
  '每位家人先各自購買「人生藍圖」（$89），再加購「家族藍圖」（$59）做家庭互動分析。':
    'Each family member first purchases Life Blueprint ($89), then add Family Blueprint ($59) for a family-interaction analysis.',
  '感情/合夥：': 'Romance / partnership: ',
  '「合否？」（$59）兩人命理交叉分析，看你們合不合。': 'Compatibility Report ($59) — a two-person cross-analysis to see how well you match.',
  '單一重要事件：': 'Single important event: ',
  '「事件擇吉」（$59）針對一個事件推出 Top3 吉時方案。': 'Event Direction Guide ($59) — Top 3 auspicious times for one event.',
  '每月補運：': 'Monthly fortune boost: ',
  '先試「月度單盤」（$29）當月執行，認可後升級「月度精選」（$89）持續補運。':
    'Start with Monthly Direction ($29) for one month; once satisfied, upgrade to Weekly Fortune Boost ($89) for ongoing boost.',
  '全年擇吉：': 'Year-long day-picking: ',
  '「年度全運」（$279）立春前 30 天限時販售，全年重要決策一次搞定。':
    'Annual Blueprint ($279) — limited to the 30 days before Lichun, handling every major decision of the year at once.',

  // Final CTA
  '開始': 'Begin',
  '知命者不惑，識運者不憂': 'Those who know fate are not troubled; those who read fortune are not anxious',
  '用 30 秒做一次免費命理速算，': 'Take 30 seconds for a free quick reading,',
  '看看十四套系統如何解讀你的命格密碼。': 'and see how fourteen systems decode your destiny.',
  '開始認識你自己': 'Begin Knowing Yourself',
  '我已經準備好了': 'I’m Ready',

  // Pricing page
  '方案與定價': 'Plans & Pricing',
  '個人、家庭、關係、出門訣共四大類別，從了解自己到採取行動，每份報告在網頁上展示，永久保存於您的帳號中。':
    'Four categories — Personal, Family, Relationship and Direction Guide. From self-understanding to action, every report is displayed online and permanently stored in your account.',
  '購買前需先': 'Please ',
  '或': ' or ',
  '個人命格分析': 'Personal Destiny Analysis',
  '了解自己，掌握人生方向': 'Understand yourself, take charge of your life',
  '家庭與關係': 'Family & Relationships',
  '家人之間的命格交織與互動': 'The interplay of destinies among family members',
  '古法奇門遁甲擇吉出門訣': 'Classical Qi Men Dun Jia Direction Guides',
  '什麼是出門訣？': 'What is a Direction Guide?',
  '古法奇門遁甲記載：「吉門吉方即行，凶門凶方即止。」天地能量每兩小時輪轉一次，八方吉凶隨之改變。 出門訣的本質——在對的時間，走向對的方位，讓天時地利的能量灌注到您身上。':
    'Classical Qi Men Dun Jia states: "When gates and directions are auspicious, proceed; when inauspicious, stop." The energy of heaven and earth rotates every two hours, and the fortunes of the eight directions change accordingly. The essence of the Direction Guide: at the right time, walk toward the right direction, drawing in the energy of heaven and earth.',
  '鑑源的出門訣引擎採用古法 25 層評分體系——三吉門旺衰、三奇配門、八神吉凶、九星旺衰、天地盤干五行生剋、 九遁格局、28 種吉凶格局判斷、神煞方位過濾——每一層都有古籍理論支撐。 最終套入您的個人年命宮交叉驗證，確保推薦的每個吉時都是專屬於您的。':
    'JianYuan’s Direction Guide engine uses a classical 25-layer scoring system — strength of the three auspicious gates, pairing of the three wonders, the eight spirits, strength of the nine stars, the five-element interactions between heaven and earth stems, the nine-escape formations, 28 auspicious/inauspicious patterns, and spirit-direction filters — each layer grounded in classical theory. Finally, results are cross-checked with your personal Life Palace, ensuring every recommended hour is unique to you.',
  '操作方式：': 'How to use:',
  '1. 在推薦的吉時準時出門，朝吉方走出 500 公尺以上': '1. At the recommended hour, walk at least 500m in the auspicious direction',
  '2. 到達後面朝吉方靜坐 40 分鐘，放鬆接氣': '2. Upon arrival, sit facing the auspicious direction for 40 minutes to absorb the energy',
  '3. 接氣完成後，可直接前往辦重要的事，效果最強': '3. After absorbing the energy, head directly to your important matter — the effect is strongest then',
  '4. 每個推薦附帶信心等級＋行事曆邀約一鍵加入': '4. Every recommendation includes a confidence level and one-click calendar invitation',
  '方案比較': 'Plan Comparison',
  '一目了然，找到最適合你的方案': 'See at a glance which plan fits you best',
  '出門訣比較': 'Direction Guide Comparison',
  '四個出門訣方案，覆蓋從單事件到全年的擇吉需求':
    'Four Direction Guide plans covering needs from single events to a full year',
  '不確定選哪個？': 'Not sure which to choose?',
  '購買前您可能想知道的事': 'What you might want to know before purchasing',
  '最超值': 'Best Value',
  '最熱門': 'Most Popular',
  '立春前 30 天限時': 'Limited: 30 days before Lichun',
  '立春前限時': 'Limited before Lichun',
  '適合：': 'Fits you if: ',

  // Whitepaper page
  'For Professionals · 給專業人士看的研究': 'For Professionals · Research for experts',
  '鑑源命理學術白皮書': 'JianYuan Metaphysics Research Whitepaper',
  '14 系統交叉驗證方法論與工業級排盤引擎技術報告': '14-System Cross-Validation Methodology and Industrial-Grade Chart Engine Technical Report',
  '版本 v1.0 · 2026 年 4 月 17 日 · 鑑源命理研究部門編纂': 'Version v1.0 · 17 April 2026 · Compiled by the JianYuan Metaphysics Research Department',
  '下載 PDF（免費提供，21 頁）': 'Download PDF (free, 21 pages)',
  '線上閱讀摘要': 'Read Summary Online',
  '為什麼寫這份白皮書？': 'Why this whitepaper?',
  '命理服務長期面臨四個工程學上的挑戰：排盤基礎不一致、規則隱性化、報告模板化、精度不透明。 市面多數平台未公開其排盤結果與權威文獻的一致率，使用者無從判斷可靠度。':
    'Metaphysics services have long faced four engineering challenges: inconsistent chart fundamentals, implicit rules, templated reports, and opaque precision. Most platforms do not publish the consistency rate between their charts and authoritative literature, leaving users unable to judge reliability.',
  '本白皮書記錄鑑源命理研究部門為了將東方命理系統產品化、工業化、可驗證化所採用的研究方法、 排盤引擎架構與驗證流程。我們主張的差異不在「比古人更準」或「AI 取代師父」，而來自工程方法論：':
    'This whitepaper documents the research methods, chart-engine architecture, and verification processes the JianYuan Metaphysics Research Department uses to productize, industrialize, and validate Eastern metaphysical systems. Our claimed differentiation is not "more accurate than the ancients" or "AI replaces masters" — it comes from an engineering methodology:',
  '規則導向、交叉驗證、回歸測試、誠實揭露限制': 'Rule-driven, cross-validated, regression-tested, and transparent about limitations',
  '本文件適合命理從業人員、媒體與記者、技術投資人、學術研究者閱讀。所有數字、案例、引用皆可追溯到 GitHub 公開倉庫的驗證腳本與驗證報告。':
    'This document is intended for metaphysics practitioners, media and journalists, technology investors, and academic researchers. All numbers, cases, and citations can be traced to the verification scripts and reports in our public GitHub repository.',
  '關鍵數據摘要': 'Key Metrics',
  '以上所有數值皆可於白皮書附錄 B 的引擎精度實測表中追溯到對應的驗證腳本（例如': 'All values above can be traced to the corresponding verification scripts in Appendix B of the whitepaper (e.g. ',
  '），並由鑑源命理研究部門公開於 GitHub 倉庫。': '), which are published by the JianYuan Research Department on GitHub.',
  '白皮書目錄': 'Whitepaper Contents',
  // Whitepaper TOC items
  '摘要（Executive Summary）': 'Executive Summary',
  '研究背景與動機': 'Background and Motivation',
  '研究方法論：規則導向 + 交叉驗證 + 回歸測試':
    'Methodology: Rule-Driven + Cross-Validation + Regression Testing',
  '14 系統整合理論：權重分配與衝突仲裁':
    '14-System Integration Theory: Weighting and Conflict Arbitration',
  '八字引擎驗證：12 位中港台客戶 + 真太陽時校正':
    'Bazi Engine Validation: 12 Clients in Greater China + True Solar Time Correction',
  '紫微斗數引擎驗證：16 位客戶 3-way 驗證 + 5 個歷史 bug 修復':
    'Zi Wei Dou Shu Engine Validation: 16 Clients, 3-Way Verification, 5 Historical Bug Fixes',
  '奇門遁甲引擎：Windada 20 組 + 365 天快照':
    'Qi Men Dun Jia Engine: 20 Windada Cases + 365-Day Snapshot',
  '產品化實踐：從古籍到 AI 的轉譯流程':
    'Productization Practice: From Classics to AI Translation Pipeline',
  '未來研究方向：多語言、多派別、多系統拓展':
    'Future Directions: Multilingual, Multi-School, Multi-System Expansion',
  '附錄 A：40+ 權威來源清單（古籍、現代教材、開源軟體）':
    'Appendix A: 40+ Authoritative Sources (Classics, Modern Texts, Open-Source Software)',
  '附錄 B：引擎精度實測表': 'Appendix B: Engine Precision Measurement Table',
  '加人': 'Add person',
  '人': ' person',
  '如何引用': 'How to Cite',
  '媒體、合作、學術交流': 'Media, Partnership, Academic Exchange',
  '歡迎同業、學界、媒體查證、質疑、並提供改進意見。研究部門對白皮書的每項數據負責，且保留未來版本修訂權。':
    'We welcome verification, challenge, and suggestions from peers, academia, and media. The Research Department stands behind every data point in this whitepaper and reserves the right to revise future versions.',
  '聯繫研究部門': 'Contact the Research Department',
  '支援信箱：support@jianyuan.life': 'Support email: support@jianyuan.life',
  '返回首頁': 'Back to Home',
  '查看服務方案': 'View Plans',

  // Whitepaper metrics
  '整合系統數量': 'Systems integrated',
  '14 套': '14 systems',
  '八字 / 紫微 / 奇門 / 西洋占星 / 吠陀 / 人類圖 / 姓名學 / 易經 / 塔羅 / 數字命理 / 風水 / 生肖 / 古典命理 / 生物節律':
    'Bazi / Zi Wei Dou Shu / Qi Men Dun Jia / Western Astrology / Vedic / Human Design / Name Numerology / I Ching / Tarot / Numerology / Feng Shui / Chinese Zodiac / Classical / Biorhythm',
  '計算引擎總行數': 'Total engine lines of code',
  '16,090 行': '16,090 lines',
  'Python 程式碼，含 266 個 raw_data 欄位': 'Python code, including 266 raw_data fields',
  '規則來源盤點': 'Rule inventory',
  '44,421+ 條': '44,421+ rules',
  '源自數十部經典古籍與現代學者教材': 'From dozens of classical texts and modern scholarly sources',
  '權威來源引用': 'Authoritative citations',
  '40+ 個': '40+',
  '古籍 18 部、現代學者 22 位、開源軟體 11 個': '18 classics, 22 modern scholars, 11 open-source projects',
  '八字驗證案例': 'Bazi validation cases',
  '12 位': '12 clients',
  '中港台完整客戶案例，四柱一致率（排除流派差異）100%': 'Complete cases from mainland China, HK, Taiwan — four-pillars consistency (excluding school differences) 100%',
  '紫微驗證案例': 'Zi Wei validation cases',
  '16 位': '16 clients',
  '3-way 驗證：引擎 vs 手算 vs iztro；核心欄位一致率 100%': '3-way validation: engine vs. hand calc vs. iztro; core fields consistency 100%',
  '奇門 Windada 驗證': 'Qi Men Windada validation',
  '20 組 + 365 天': '20 cases + 365 days',
  'v3.5 引擎局數一致率 100%，八門 97.2%': 'v3.5 engine ju consistency 100%, eight gates 97.2%',
  '基礎回歸測試': 'Base regression tests',
  '161 項': '161 items',
  '每次排盤引擎修改前後必跑，確保不破壞舊行為': 'Run before and after every chart-engine change to guarantee backward compatibility',
  '出門訣專項測試': 'Direction Guide tests',
  '34 項': '34 items',
  '涵蓋評分系統、品質閘門、詞彙清洗': 'Covers scoring, quality gates, and terminology cleaning',
  '節氣時刻精度': 'Solar term precision',
  '分鐘級': 'Minute-level',
  '紫金山天文台官方節氣時刻表（lunar_python 底層）': 'Purple Mountain Observatory official solar-term timetable (lunar_python backend)',
  '行星位置精度': 'Planetary position precision',
  '弧秒級': 'Arcsecond-level',
  'Swiss Ephemeris DE431（NASA JPL 星曆表）': 'Swiss Ephemeris DE431 (NASA JPL ephemeris)',
  '姓名學筆畫庫': 'Kangxi stroke dictionary',
  '102,998 字': '102,998 characters',
  'Unicode Unihan 官方康熙筆畫資料': 'Official Unicode Unihan Kangxi strokes',

  // Footer
  '命理服務': 'Services',
  '免費命理速算': 'Free Quick Reading',
  '隱私政策': 'Privacy Policy',
  '使用條款': 'Terms of Service',
  '聯繫我們': 'Contact Us',
  '回到源頭 · 看清本質': 'Back to the source · See the essence',
  '本服務融合傳統命理學與現代科技，分析結果僅供參考，不構成任何醫療、投資或法律建議。':
    'This service combines traditional metaphysics with modern technology; the results are for reference only and do not constitute medical, investment, or legal advice.',
  '了解更多': 'Learn More',
  '命理知識': 'Metaphysics Blog',
  '版權所有': 'All rights reserved',

  // Common misc
  '歡迎回來': 'Welcome Back',
  '建立帳號': 'Create Account',
  '電子信箱': 'Email',
  '密碼': 'Password',
  '還沒有帳號？': 'Don’t have an account? ',
  '已經有帳號？': 'Already have an account? ',
  '姓名': 'Name',
  '請輸入您的全名': 'Please enter your full name',
  '出生年': 'Birth Year',
  '月': 'Month',
  '日': 'Day',
  '出生時辰': 'Birth Hour',
  '性別': 'Gender',
  '男': 'Male',
  '女': 'Female',
  '開始命理分析': 'Start Analysis',
  '深度分析中，請稍候...': 'Deep analysis in progress, please wait...',
  '八字命理速算': 'Bazi Quick Reading',
  '紫微斗數速算': 'Zi Wei Quick Reading',
  '姓名學速算': 'Name Quick Reading',

  // Various short labels
  '最多 14 套系統同時分析': 'Up to 14 systems analyzed together',
  '付款由 Stripe 安全處理。報告平均需 30 分鐘以上，出門訣需 40 分鐘以上。':
    'Payment securely processed by Stripe. Reports typically take 30+ minutes; Direction Guides take 40+ minutes.',
}

// 創辦人段落（長內容）— 逐段翻譯，精確 key
export const EN_FOUNDER: Record<string, string> = {
  '我是個極度重視邏輯與數據的人。': 'I am someone who deeply respects logic and data.',
  '身為金融從業者，我做的每一個決定，都需要依據、推理，以及完整的分析。':
    'As a finance professional, every decision I make requires evidence, reasoning, and complete analysis.',
  '所以，如果有一天我告訴你——命理改變了我的人生軌跡，':
    'So if one day I tell you that metaphysics changed the trajectory of my life,',
  '請相信，那不會是一句沒有根據的玄學。':
    'please believe — it will not be an ungrounded mystical claim.',
  '30 歲之前，我改過三次名字。': 'Before the age of 30, I had changed my name three times.',
  '前兩次，並不是我能選擇的；直到第三次，我決定把人生的方向，握在自己手裡。':
    'The first two were not my choice; the third time I decided to take the direction of my own life into my own hands.',
  '改名不是一件簡單的事。從證件、銀行到所有資料，每一個細節都必須重新調整。 也因此，我格外謹慎——找了':
    'Changing one’s name is no small matter. From identity documents to banks to every record, every detail has to be redone. So I was especially careful — I consulted',
  '改名不是一件簡單的事。從證件、銀行到所有資料，每一個細節都必須重新調整。也因此，我格外謹慎——找了':
    'Changing one’s name is no small matter. From identity documents to banks to every record, every detail has to be redone. So I was especially careful — I consulted',
  '改名不是一件簡單的事。從證件、銀行到所有資料，每一個細節都必須重新調整。': 'Changing one’s name is no small matter. From identity documents to banks to every record, every detail has to be redone.',
  '也因此，我格外謹慎——找了': 'So I was especially careful — I consulted',
  '六位命理老師': 'six metaphysicians',
  '， 花了將近': ', spending nearly',
  '三萬多元': 'NT$30,000+',
  '，只為了做一件事：': ', just to do one thing:',
  '驗證': 'verify',
  '。': '.',
  '但結果，卻讓我開始動搖。': 'But the results made me waver.',
  '每一位老師，都能把名字說得頭頭是道。 上一位說「很好」，下一位卻說「不行」。標準不一致，答案也沒有終點。 那一刻我才明白——這些建議的核心，從來不是「適不適合你」， 而是「讓你再花一次錢」。':
    'Every master could justify a name with eloquence. One said "excellent", the next said "no good". Standards varied, answers never converged. In that moment I realized — the core of their advice was never "does this suit you", but "make you pay again".',
  '從台幣 3,600 到 8,000，我都試過。': 'I tried prices from NT$3,600 to NT$8,000.',
  '最終，我沒有採用任何一位老師的方案。':
    'In the end, I adopted none of their proposals.',
  '因為我開始懷疑的，不只是名字，而是——':
    'Because what I began to doubt was not just the name, but —',
  '我是不是把人生的選擇，交給了別人？':
    'have I handed the choices of my own life over to someone else?',
  '於是我花了兩個多月，閱讀了十多本姓名學專著，研究了六大門派的理論體系， 最後自己為自己改了名。':
    'So I spent over two months reading a dozen treatises on name studies, researching six major schools of thought — and eventually renamed myself.',
  '於是我花了兩個多月，閱讀了十多本姓名學專著，研究了六大門派的理論體系，最後自己為自己改了名。':
    'So I spent over two months reading a dozen treatises on name studies, researching six major schools of thought — and eventually renamed myself.',
  '改名前：': 'Before the rename:',
  '23 歲拿到百萬年薪，26 歲負債兩百萬，收入銳減一半，差點破產。 30 歲還在數著銀行餘額過日子。最好的朋友曾對我說——':
    'At 23 I earned a seven-figure salary; at 26 I was NT$2 million in debt, income halved, almost bankrupt. At 30 I was still counting my bank balance to get by. My best friend once said to me —',
  '23 歲拿到百萬年薪，26 歲負債兩百萬，收入銳減一半，差點破產。30 歲還在數著銀行餘額過日子。最好的朋友曾對我說——':
    'At 23 I earned a seven-figure salary; at 26 I was NT$2 million in debt, income halved, almost bankrupt. At 30 I was still counting my bank balance to get by. My best friend once said to me —',
  '你不是沒有能力，而是真的比較倒楣而已。':
    'You’re not lacking ability — you’re just genuinely unlucky.',
  '改名後：': 'After the rename:',
  '30 到 35 歲，被挖角到中國、再到香港。遇到了另一半，成了家、生了孩子。 從負債兩百多萬，到收入翻了數倍，豐衣足食。':
    'From 30 to 35, I was recruited to mainland China, then to Hong Kong. I met my partner, built a family, had a child. From NT$2m+ debt, income multiplied several times over — a life of plenty.',
  '30 到 35 歲，被挖角到中國、再到香港。遇到了另一半，成了家、生了孩子。從負債兩百多萬，到收入翻了數倍，豐衣足食。':
    'From 30 to 35, I was recruited to mainland China, then to Hong Kong. I met my partner, built a family, had a child. From NT$2m+ debt, income multiplied several times over — a life of plenty.',
  '大概率': 'High probability',
  '八成是因為我夠努力': 'eighty percent is because I worked hard enough',
  '。 但總有那關鍵的兩成——運勢、時機、生不逢時——不是努力就能改變的。':
    '. But there is always that critical twenty percent — fortune, timing, being out of one’s era — that effort alone cannot change.',
  '在我的認知中，命理是經過數理驗算後找出大概率趨勢的一門學問。 它的目標從來不是逆天改命，而是一個':
    'In my understanding, metaphysics is a discipline that identifies high-probability trends through mathematical verification. Its goal is never to defy fate, but to be',
  '自我對話的過程': 'a process of self-dialogue',
  '—— 更了解自己，才能更完善地發揮自己的天賦。':
    '— to understand yourself better, and so to develop your gifts more fully.',
  '這就是鑒源的初衷。': 'This is the original intention of JianYuan.',
  '回到源頭，看清本質。把選擇的權力，交還給你自己。':
    'Return to the source, see the essence. Hand the power of choice back to you.',
  '鑒源創辦人': 'Founder of JianYuan',
  // Testimonial helper labels
  '台北': 'Taipei', '香港': 'Hong Kong', '深圳': 'Shenzhen',
  '新加坡': 'Singapore', '台中': 'Taichung', '溫哥華': 'Vancouver',
  '陳先生': 'Mr. Chen', '王女士': 'Ms. Wang', '李先生': 'Mr. Li',
  '張小姐': 'Ms. Chang', '林先生': 'Mr. Lin', '黃女士': 'Ms. Huang',
  // Testimonial bodies
  '之前花了三千多找老師看八字，結論就兩頁紙。鑒源的報告十幾頁，十四套系統逐一分析，而且每個結論都說明了依據。最關鍵的是大運分析，直接點出了我 37-42 歲是事業黃金期，我正好在猶豫要不要創業。':
    'I spent NT$3,000+ on a master who gave me a two-page Bazi reading. JianYuan’s report is dozens of pages — fourteen systems analyzed one by one, each conclusion with its reasoning. The most crucial part was the luck-cycle analysis, which pointed out that 37–42 is my career golden window. I was just agonizing over whether to start a business.',
  '幫全家四口人做了分析。我跟老公的合婚分析很精準——報告說我們在財務觀念上容易有摩擦，確實如此。更驚喜的是孩子的天賦分析，報告建議的學習方向跟孩子實際的興趣完全吻合。':
    'I had the analysis done for our family of four. The marriage compatibility for my husband and me was spot-on — the report said our biggest friction is around financial values, and it truly is. Even more impressive was the children’s aptitude analysis — the recommended learning direction matched our child’s real interests exactly.',
  '本來半信半疑，先試了免費速算，性格分析準到我懷疑是不是有人偷看我的日記。後來花 $39 買了「心之所惑」問財運，報告不只告訴我運勢走向，還具體建議了投資時機和要避開的月份。':
    'I was skeptical at first, so I tried the free quick reading — the personality analysis was so accurate I wondered if someone had read my diary. Then I spent $39 on Inner Quest for wealth. The report didn’t just tell me the trend — it named concrete investment timing and months to avoid.',
  '面試前買了出門訣，按照建議在吉時出門，當天狀態出奇的好，最後拿到了 offer。但最讓我意外的是報告裡那段「寫給你的話」——它說我一直害怕的不是失敗，而是成功之後不知道怎麼面對。讀到那裡我愣了很久，覺得被完全看透了。':
    'I bought the Direction Guide before my interview, followed the recommended hour, and my state that day was unexpectedly great — I got the offer. But what surprised me most was the "Letter to You" section — it said what I really fear is not failure, but not knowing how to face success. I sat there stunned for a long time, feeling completely seen through.',
  '跟女友交往兩年一直在猶豫要不要結婚。報告不只分析了我們的相容性，還點出我在感情裡總是害怕「不夠好」所以不敢承諾。那段話讓我紅了眼眶——原來我猶豫的不是她對不對，而是我配不配。看完報告那天晚上就決定買戒指了。':
    'I had been dating my girlfriend for two years, hesitating about marriage. The report not only analyzed our compatibility but also pointed out that in relationships I always fear being "not good enough", so I can’t commit. That line made my eyes well up — my hesitation was never about whether she was right, but whether I was worthy. That very night I decided to buy the ring.',
  '移民後事業一直不順，看了很多命理都說「再等等」。鑒源的報告不一樣——它沒有叫我等，而是告訴我「你的命格其實更適合自由業，你一直在用不適合的方式生活」。讀完整份報告的感覺像是被一個很懂你的老朋友聊了一整夜。現在已經開始籌備自己的工作室了。':
    'Since immigrating, my career had been stuck. Many metaphysicians said "just wait". JianYuan’s report was different — it didn’t tell me to wait. It said "your chart actually suits self-employment — you’ve been living in a way that doesn’t fit you". Reading the report felt like spending a whole night with an old friend who truly understands you. I’ve now started preparing my own studio.',
  // Pricing comparison table headers
  '功能': 'Feature',
  '項目': 'Item',
  '事件 E1': 'Event E1',
  '月度 E2': 'Monthly E2',
  '週度 E3': 'Weekly E3',
  '年度 E4': 'Annual E4',
  '分析系統數': 'Number of systems',
  '精選相關系統': 'Selected relevant systems',
  '精選關係系統': 'Selected relationship systems',
  '14套': '14 systems',
  '性格天賦分析': 'Personality & talent analysis',
  '事業財運分析': 'Career & wealth analysis',
  '感情婚姻分析': 'Relationship & marriage analysis',
  '大運流年走勢': 'Major cycles & annual trends',
  '專項問題深度剖析': 'Deep dive on a specific question',
  '多人互動分析': 'Multi-person interaction analysis',
  '家庭動力學': 'Family dynamics',
  'PDF 完整報告': 'Full PDF report',
  '報告字數': 'Report length',
  '5,000字+': '5,000+ words',
  '30,000字+': '30,000+ words',
  '8,000字+': '8,000+ words',
  '每人8,000字+': '8,000+ words per person',
  '聚焦選定面向': 'Focused on selected dimension',
  '單面向': 'Single dimension',
  // Direction guide compare table
  '對象': 'Target',
  '吉時數': 'Auspicious hours',
  '主題用神': 'Theme / yongshen',
  '時間單位': 'Time unit',
  '年命宮驗證': 'Life palace cross-check',
  '行事曆邀約': 'Calendar invite',
  '販售限制': 'Sale window',
  '單一事件': 'Single event',
  '當月補運': 'Current-month boost',
  '整月持續': 'Whole-month ongoing',
  '整年佈局': 'Full-year planning',
  '主吉方 1 盤': '1 chart for main direction',
  '8 個（4 週 ×2）': '8 (4 weeks × 2)',
  '年盤＋12 月盤': 'Annual + 12 monthly charts',
  '自由描述': 'Free description',
  '無': 'None',
  '可選 1-3 個': '1–3 selectable',
  '時盤（兩小時）': 'Hour chart (2h)',
  '月盤': 'Monthly chart',
  '時盤（8 個）': 'Hour charts (8)',
  '年盤＋月盤': 'Annual + monthly',
  '隨時': 'Anytime',
  '晦日 21:00 前當月': 'Before 21:00 on last lunar day, same month',
  '立春前 30 天限時': 'Limited: 30 days before Lichun',
  // Plans features lists
  '加人': 'Add person',
  '每套系統僅 $6.4': '~$6.4 per system',
  '針對單一重要事件、Top3 吉時': 'For a single important event, Top 3 auspicious hours',
  '單次購買、當月執行': 'One-time purchase, executed within the month',
  '4 週×每週 Top2＝8 吉時、持續補運最佳': '4 weeks × Top 2 each week = 8 hours, optimal ongoing boost',
  '年盤＋12 月盤、立春前 30 天限時販售': 'Annual + 12 monthly charts, sold only in the 30 days before Lichun',

  // Smaller phrases (plan feature bullets)
  '命格名片——一眼看清你是誰': 'Destiny Card — see who you are at a glance',
  '性格天賦+行為模式深度解析': 'Personality, gifts & behavior patterns deeply analyzed',
  '事業方向+財運走向+投資風格': 'Career direction, wealth trajectory, investment style',
  '感情婚姻+人際貴人分析': 'Relationships, marriage & supportive connections',
  '健康養生+大運走勢': 'Health & major luck-cycle outlook',
  '2026 流年重點月份提醒': '2026 annual key-month alerts',
  '刻意練習——具體可執行的改善計劃': 'Deliberate Practice — concrete, executable improvement plan',
  '網頁重點版+PDF 完整版（30,000字+）': 'Web highlights + full PDF (30,000+ words)',
  '可選：財運/事業/感情/健康/學業/搬家': 'Choose: Wealth / Career / Relationships / Health / Study / Moving',
  '用 200 字描述你的困惑': 'Describe your concern in 200 words',
  '精選相關系統聚焦你的問題深度分析': 'Relevant systems selected for a focused, in-depth analysis of your question',
  '具體可行的建議與行動方向': 'Concrete, actionable recommendations and direction',
  '需先完成每位成員的「人生藍圖」': 'Each member must first complete a Life Blueprint',
  '家族能量圖譜（五行互補/衝突分析）': 'Family energy map (five-element complementarity / conflict analysis)',
  '每對成員互動關係深度解析': 'Deep analysis of the interaction between each pair of members',
  '親子教養 / 夫妻相處具體建議': 'Concrete parenting / spousal-relationship recommendations',
  '家運走勢+共同行動指南': 'Family fortune trajectory + shared action guide',
  '寫給這個家的話': 'A letter to this family',
  '含兩人分析（每加1人+$19）': 'Includes two-person analysis (+$19 per extra person)',
  '合盤分析+互動建議': 'Combined-chart analysis + interaction suggestions',
  '對方可只提供年月日': 'Partner may provide only year/month/day',
  '描述你的關係問題（200字）': 'Describe your relationship question (200 words)',
  '好的/注意/改善 三大建議': 'Three pillars of advice: Strengths / Cautions / Improvements',

  // E1-E4 features
  '描述事件背景＋期望結果（200 字）': 'Describe event background + desired outcome (200 words)',
  '14 類事件精準匹配＋自由描述 AI 分類': 'Precise match across 14 event types + free-description AI categorization',
  '25 層古法評分（門/星/神/干/格局/神煞）': '25-layer classical scoring (gates / stars / spirits / stems / formations / spirit-directions)',
  '個人年命宮交叉驗證': 'Personal Life Palace cross-check',
  'Top3 吉時＋方位度數＋信心等級': 'Top 3 auspicious hours + directions in degrees + confidence level',
  '行事曆邀約一鍵加入': 'One-click calendar invitation',
  '農曆月份精算（立春／節氣換月）': 'Lunar-month calculation (Lichun / solar-term based)',
  '奇門紫白擇日派四層架構': 'Qi Men Purple-White Day-Picking School, four-tier architecture',
  '《沈氏玄空學》《地理辨正》《紫白訣》古籍背書': 'Backed by Shen Family Xuan Kong Treatise, Di Li Bian Zheng, Zi Bai Jue',
  '紫白飛星月+年吉星並集擇方': 'Purple-White monthly + annual auspicious stars, union-selected direction',
  '晦日 21:00 前購買即算當月': 'Purchase before 21:00 on the last lunar day to count as this month',
  '選 1-3 個主題（事業／財運／感情／健康／學業／貴人／化解小人／家庭）':
    'Select 1–3 themes (career / wealth / relationships / health / study / mentors / countering adversaries / family)',
  '每週 2 個 Top 吉時、共 8 個時窗': '2 Top auspicious hours per week, 8 windows total',
  '主題用神（值符／天心／開門等）對應評分': 'Theme-matched yongshen scoring (Zhi-Fu / Tian-Xin / Kai-Men, etc.)',
  '古法占事派正統：用神佔 60%': 'Classical Zhan-Shi-Pai orthodoxy: yongshen weighs 60%',
  '年盤古法排盤（全陰遁、立春換年）': 'Classical annual chart (all Yin-Dun, Lichun-based year change)',
  '12 個月盤（每月主吉方＋吉時）': '12 monthly charts (main direction + hours per month)',
  '全年主吉方／忌方總覽': 'Full-year overview of main / forbidden directions',
  '行事曆邀約（全年吉時一次匯入）': 'Calendar invitation (all annual hours imported at once)',
  '立春前 30 天限時販售、錯過等明年': 'Sold only in the 30 days before Lichun — miss it, wait a year',
  // Home page small phrases
  '鑒源 · JianYuan': 'JianYuan',
  '不需註冊 · 不需付費 · 完全免費': 'No signup · No payment · Completely free',
  '不需註冊 · 不需信用卡 · 完全免費': 'No signup · No credit card · Completely free',
  '還有家庭、關係、出門訣方案 ·': 'We also offer Family, Relationship and Direction Guide plans · ',
  // Empathy section assembled line
  '你來到這裡，本身就是一種勇氣。 命理不是算命，不是迷信—— 它是一面鏡子，幫助你':
    'Coming here is itself an act of courage. Metaphysics is not fortune-telling, not superstition — it is a mirror, helping you',
  '。 而鑒源，想做的是': '. And what JianYuan wants to do is',
}

// 單一合併的英文字典（text-node 級，key = 繁體原文去首尾空白）
// 注意：順序遵循較長 phrase 優先，避免短字先命中
const merged: Record<string, string> = {}
for (const dict of [EN_PLAN_NAMES, EN_SYSTEM_NAMES, EN_UI, EN_FOUNDER]) {
  for (const [k, v] of Object.entries(dict)) {
    if (!(k in merged)) merged[k] = v
  }
}

export const EN_DICTIONARY: Readonly<Record<string, string>> = merged

// 按 key 長度排序（降冪）——子字串替換時較長 phrase 優先命中，避免短字先被換掉
// 只收「至少含 1 個中文字」的 key，避免標點或英文短字誤替換
const SORTED_KEYS: ReadonlyArray<string> = Object.keys(EN_DICTIONARY)
  .filter(k => /[一-鿿]/.test(k))
  .sort((a, b) => b.length - a.length)

// 輔助：將 text-node 原文翻譯為英文
// 策略：
//   1. 先做精確整句命中（原文 trim，保留前後空白）
//   2. 再做「空白折行正規化後」的精確命中（JSX 多行文字常會帶大量空白）
//   3. 否則做「按長度降冪的子字串全替換」——命中率高時幾乎整段變英文
//   4. 全未命中 → 回傳 null（呼叫端保留中文原文 + dev warn）
function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function translateToEn(text: string): string | null {
  const key = text.trim()
  if (!key) return null
  // 1. 完整命中
  if (EN_DICTIONARY[key]) {
    const leading = text.match(/^\s*/)?.[0] ?? ''
    const trailing = text.match(/\s*$/)?.[0] ?? ''
    return leading + EN_DICTIONARY[key] + trailing
  }
  // 2. 正規化空白後再查
  const normKey = normalizeWhitespace(text)
  if (EN_DICTIONARY[normKey]) {
    const leading = text.match(/^\s*/)?.[0] ?? ''
    const trailing = text.match(/\s*$/)?.[0] ?? ''
    return leading + EN_DICTIONARY[normKey] + trailing
  }
  // 3. 子字串替換（按長度降冪）— 必須含中文才做（避免純英數字被替換）
  if (!/[一-鿿]/.test(text)) return null
  let out = text
  let replaced = false
  for (const k of SORTED_KEYS) {
    if (out.includes(k)) {
      out = out.split(k).join(EN_DICTIONARY[k])
      replaced = true
    }
  }
  if (replaced) return out
  return null
}

// 統計字典大小（給覆蓋率驗證用）
export const EN_DICT_SIZE = Object.keys(EN_DICTIONARY).length
