export interface PublicClaims {
  blog: {
    comparisonTable: string
    cta: string
  }
  social: {
    homeSubtitle: string
    homeContextBadge: string
    pricingCSubtitle: string
    pricingTrust: string
  }
  trust: {
    comparisonTitle: string
    comparisonSubtitle: string
    comparisonTooltip: string
    transportTitle: string
    transportSubtitle: string
    transportTooltip: string
    fulfillmentNotice: string
  }
  home: {
    zhTw: {
      tagline: string
      title: string
      description: string
      freeToolSubtitle: string
    }
    zhCn: {
      tagline: string
      title: string
      description: string
      freeToolSubtitle: string
    }
    en: {
      tagline: string
      title: string
      description: string
      freeToolSubtitle: string
    }
  }
  site: {
    title: string
    description: string
    socialDescription: string
    schemaDescription: string
    imageAlt: string
  }
  terms: {
    description: string
    service: string
    inputResponsibility: string
    limits: string
    fulfillment: string
  }
  methodology: {
    tagline: string
    taglineEn: string
    summary: string
    comparison: string
    limits: string
  }
  whitepaper: {
    title: string
    description: string
    purpose: string
    calculation: string
    variation: string
    dataLimits: string
    publication: string
  }
  privacy: {
    description: string
    freeToolAnalytics: string
    requestScope: string
    gdprTiming: string
    ccpaApplicability: string
  }
  tools: {
    nameMetadata: string
    qimenMetadata: string
    baziMetadata: string
    name: string
    qimen: string
    bazi: string
    ziwei: string
    baziInputFaq: string
    paidDifferenceFaq: string
    baziRepeatabilityFaq: string
    ziweiComparisonFaq: string
    qimenSchoolFaq: string
    baziDayBoundaryFaq: string
    birthLocationFaq: string
  }
}

export interface PublicClaimsEnglish {
  methodology: {
    summary: string
    comparison: string
    limits: string
  }
  terms: {
    service: string
    limits: string
  }
  trust: {
    comparisonTooltip: string
    fulfillmentNotice: string
  }
  blog: {
    cta: string
  }
  tools: {
    baziDayBoundaryFaq: string
    birthLocationFaq: string
  }
}

export const PUBLIC_CLAIMS = {
  blog: {
    comparisonTable: `| 閱讀方式 | 可用資料 | 限制 |
|:---|:---|:---|
| 生肖流年 | 出生年份 | 只是傳統粗略分類，不能代表個人經驗 |
| 八字命盤 | 出生年月日時與曆法設定 | 出生時間與流派設定不同，解讀可能改變 |
| 多種傳統框架並列 | 依方案與資料完整度 | 可整理重複與分歧，但不會因看法較多就變成實證結論 |`,
    cta:
      '免費速算工具可先看排盤基礎項目。人生藍圖會依資料完整度並列整理多種傳統框架，並標示重複訊號、不同看法與限制。',
  },
  social: {
    homeSubtitle: '多種傳統框架 · 並列參照',
    homeContextBadge: '差異與限制清楚標示',
    pricingCSubtitle: '多種傳統框架並列參照',
    pricingTrust: '傳統框架差異清楚標示',
  },
  trust: {
    comparisonTitle: '多角度參照',
    comparisonSubtitle: '差異與限制清楚標示',
    comparisonTooltip: '不同傳統框架可能出現相近或相反看法，報告保留差異而不寫成確定事實。',
    transportTitle: '連線保護',
    transportSubtitle: '網站以 HTTPS 提供服務',
    transportTooltip: '出生資料與報告的使用方式請參閱隱私政策。',
    fulfillmentNotice:
      '報告為個人化數位內容，付款後即開始處理排盤與報告生成，依電子商品條件不支援主觀不滿意退款；生成失敗會自動重試最多 3 次，若仍失敗由客服協助。',
  },
  home: {
    zhTw: {
      tagline: '從不同傳統角度整理線索，一份報告幫你看見脈絡',
      title: '多種傳統框架並列參照',
      description:
        '鑒源依方案與資料完整度，整理八字、紫微斗數、奇門遁甲等傳統框架的可用線索，標示重複訊號、不同看法與資料限制，供你自我理解與反思。',
      freeToolSubtitle: '依輸入資料排盤 + 脈絡整理 + 個人化傳統解讀',
    },
    zhCn: {
      tagline: '从不同传统角度整理线索，一份报告帮你看见脉络',
      title: '多种传统框架并列参照',
      description:
        '鉴源依方案与资料完整度，整理八字、紫微斗数、奇门遁甲等传统框架的可用线索，标示重复信号、不同看法与资料限制，供你自我理解与反思。',
      freeToolSubtitle: '依输入资料排盘 + 脉络整理 + 个人化传统解读',
    },
    en: {
      tagline: 'Traditional lenses brought together, with differences and limits made clear',
      title: 'Traditional frameworks, viewed side by side',
      description:
        'JianYuan organizes available observations from Bazi, Zi Wei Dou Shu, Qi Men Dun Jia and other traditional frameworks according to your plan and input completeness. It surfaces recurring themes, differing interpretations and data limits for self-reflection.',
      freeToolSubtitle: 'Chart based on your inputs + context + personalized traditional interpretation',
    },
  },
  site: {
    title: '鑒源 JianYuan — 傳統命理框架整理與自我反思',
    description:
      '鑒源依方案與資料完整度，整理八字、紫微斗數、奇門遁甲等傳統框架的線索，並說明差異與限制，作為自我反思參考。',
    socialDescription:
      '從不同傳統框架整理線索，同時說明資料限制與流派差異，作為自我理解與反思的參考。',
    schemaDescription:
      '依資料完整度整理多種傳統命理框架線索，並標示差異與限制的自我反思平台。',
    imageAlt: '鑒源 JianYuan — 傳統命理框架整理與自我反思',
  },
  terms: {
    description:
      '鑒源（JianYuan）使用條款：服務依輸入資料整理傳統命理框架線索，內容僅供自我反思與娛樂參考。',
    service:
      '鑒源依方案與資料完整度，整理可用的傳統命理框架線索。內容僅供自我反思與娛樂參考，不構成醫療、投資、法律或其他專業建議。',
    inputResponsibility:
      '提供真實且完整的出生資料；時間、地點或曆法選擇不完整時，可用項目與解讀會受影響。',
    limits:
      '內容屬於傳統詮釋，不是實證預測，也不保證特定結果或事件會發生。',
    fulfillment:
      '鑒源報告為個人化數位商品，付款後即開始處理排盤與報告生成，並依本頁所列條件提供失敗重試與錯誤更正。',
  },
  methodology: {
    tagline: '從不同傳統角度整理線索，也把差異與限制說清楚',
    taglineEn: 'Different traditional lenses, with differences and limits made clear.',
    summary:
      '鑒源會依方案與資料完整度計算可用項目，並列出重複訊號、不同看法與資料限制。',
    comparison:
      '不同方法可能得到相近或相反的解讀；相近不代表事實已被證明，相反也不代表其中一方必然錯誤。',
    limits:
      '內容屬於傳統詮釋，不是實證預測，也不保證特定結果或事件會發生。',
  },
  whitepaper: {
    title: '排盤方法與資料限制說明',
    description:
      '說明鑒源如何依輸入資料排盤、哪些設定可能改變結果，以及傳統詮釋與實證預測的界線。',
    purpose:
      '這一頁說明網站如何把出生資料轉成命盤、哪些設定會改變結果，以及如何閱讀 AI 輔助整理的傳統解讀。',
    calculation:
      '排盤程式會依輸入資料與本站目前採用的曆法、換日、時區及流派設定計算；版本或設定不同時，盤面可能不同。',
    variation:
      '不同流派對換日、閏月、安星、起局與筆畫的定義不盡相同。本站會說明採用的設定，不把其中一種方法寫成唯一答案。',
    dataLimits:
      '出生日期、時間、地點或曆法選擇不完整時，可用項目會減少，相關宮位、時柱或週期解讀也可能改變。',
    publication:
      '公開數字若沒有對應版本、測試範圍與可重現資料，容易造成誤解，因此本頁暫不列精度百分比、規則總數或案例數。',
  },
  privacy: {
    description:
      '說明鑒源收集哪些資料、如何使用資料，以及你可以如何提出存取、更正或刪除要求。',
    freeToolAnalytics:
      '送出的資料會用於本次排盤與 AI 輔助解讀。若你同意分析或行銷 Cookie，網站也會記錄頁面瀏覽及部分工具完成事件，用於改善體驗及衡量服務成效；表單內容不會放入這些事件參數。',
    requestScope:
      '你可以來信要求存取、更正或刪除個人資料；我們會先核對身分，再依適用法律及依法必須保留的紀錄範圍處理。',
    gdprTiming:
      '收到資料權利要求後，我們會在一個月內回覆。若要求複雜或數量眾多，可能再延長最多兩個月，並會在收到要求後的第一個月內告知延長與理由。',
    ccpaApplicability:
      '若 CCPA / CPRA 適用於本服務及你的個案，我們會依適用規定處理知情、更正、刪除及拒絕出售或分享等要求。',
  },
  tools: {
    nameMetadata:
      '免費姓名學速算，依 Unicode Unihan 筆畫資料呈現五格與三才；異體字、偏旁寫法及未收錄字需另行核對。',
    qimenMetadata:
      '免費奇門遁甲排盤，依本站採用的起局與寄宮設定呈現九星、八門、八神；不同流派可能有不同盤面。',
    baziMetadata:
      '免費八字排盤，依輸入的日期、時間、地點與本站曆法設定呈現四柱、五行及十神；資料不完整會影響結果。',
    name:
      '筆畫查詢以 Unicode Unihan 的 kTotalStrokes 資料為基礎，不等同所有姓名學流派採用的康熙筆畫。異體字、偏旁寫法、未收錄字與簡繁轉換可能需要人工核對；查不到筆畫時，不應把 0 畫視為有效結果。',
    qimen:
      '盤面依本站目前採用的起局、換日與寄宮規則呈現；不同門派、時區或時間設定可能得到不同結果，因此不保證每一宮位與格局判斷都和其他來源一致。',
    bazi:
      '結果依你提供的出生日期、時間、地點、曆法與本站換日設定計算。出生時間不確定時，時柱及相關解讀會受影響；不同流派也可能採用其他換日或強弱判定方法。',
    ziwei:
      '紫微斗數高度依賴出生時辰與曆法設定；時辰不確定時，命宮、主星與宮位解讀都可能改變。閏月、安星與四化規則也有流派差異。',
    baziInputFaq:
      '請提供出生年月日、已知時間範圍與出生城市；不確定時請如實標示，系統會依可用資料與本站設定排盤。',
    paidDifferenceFaq:
      '免費版提供排盤與基礎解讀；付費報告依方案與資料完整度，並列整理可用的傳統框架，並標示重複、分歧與限制。',
    baziRepeatabilityFaq:
      '在相同輸入、曆法、流派設定與程式版本下，排盤結果應可重複；解讀屬於傳統詮釋，不是實證預測。',
    ziweiComparisonFaq:
      '八字與紫微斗數採用不同傳統框架，可能出現相近或相反的解讀；不應把其中一種寫成唯一答案。',
    qimenSchoolFaq:
      '本站對外統稱古法奇門遁甲，盤面依目前採用的起局、換日與寄宮設定呈現；不同門派或設定可能得到不同盤面。',
    baziDayBoundaryFaq:
      '本站目前採用早子時設定，將 23:00–01:00 列入隔天日柱。也有流派將 23:00–00:00 與 00:00–01:00 分開處理；換日設定不同時，日柱與後續解讀可能不同。',
    birthLocationFaq:
      '出生地點會用於確定時區與可用的經緯度設定。必填資料不完整時，系統應停止處理而不套用其他地點；地點或時間範圍不確定時，時柱與相關解讀可能改變。',
  },
} as const satisfies PublicClaims

export const PUBLIC_CLAIMS_EN = {
  methodology: {
    summary:
      'JianYuan calculates the items available for each plan based on data completeness, then lists recurring signals, differing interpretations and data limits.',
    comparison:
      'Different methods may produce similar or opposing interpretations. Agreement does not prove a claim, and disagreement does not make either method automatically wrong.',
    limits:
      'The content is a traditional interpretation, not an evidence-based prediction, and it does not guarantee that any particular outcome or event will occur.',
  },
  terms: {
    service:
      'JianYuan organizes observations available from traditional metaphysical frameworks according to the selected plan and data completeness. The content is for self-reflection and entertainment only; it is not medical, investment, legal or other professional advice.',
    limits:
      'The content is a traditional interpretation, not an evidence-based prediction, and it does not guarantee that any particular outcome or event will occur.',
  },
  trust: {
    comparisonTooltip:
      'Traditional frameworks may offer similar or opposing views. The report preserves those differences instead of presenting them as established facts.',
    fulfillmentNotice:
      'Reports are personalized digital content. Chart processing and report generation begin after payment. Subjective dissatisfaction is not refundable under the digital-content terms; failed generation is retried up to three times, followed by customer-service assistance if needed.',
  },
  blog: {
    cta:
      'Use the free quick-reading tools to review basic chart items first. Life Blueprint organizes several traditional frameworks according to data completeness and identifies recurring signals, differing views and limitations.',
  },
  tools: {
    baziDayBoundaryFaq:
      'This site currently uses an early-Zi-hour day boundary, assigning 23:00–01:00 to the following day pillar. Some schools split 23:00–00:00 and 00:00–01:00; different day-boundary settings can change the day pillar and subsequent interpretation.',
    birthLocationFaq:
      'Birthplace is used to determine the available time-zone and coordinate settings. If required information is missing, processing should stop instead of substituting another location. An uncertain place or time range can change the hour pillar and related interpretation.',
  },
} as const satisfies PublicClaimsEnglish
