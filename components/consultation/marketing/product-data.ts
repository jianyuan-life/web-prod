export type ConsultationProductCode = 'C' | 'G15'

type ProductCard = {
  title: string
  body: string
}

type ProductDeliverable = ProductCard & {
  marker: string
}

type ProductStep = ProductCard & {
  number: string
}

type ProductFaq = {
  question: string
  answer: string
}

export type ConsultationProduct = {
  code: ConsultationProductCode
  slug: string
  eyebrow: string
  title: string
  lead: string
  description: string
  price: number
  currency: 'USD'
  priceNote: string
  prerequisite?: string
  ctaLabel: string
  checkoutLabel: string
  heroNotes: readonly string[]
  forWhom: readonly ProductCard[]
  deliverables: readonly ProductDeliverable[]
  process: readonly ProductStep[]
  boundaries: readonly string[]
  faqs: readonly ProductFaq[]
}

export const CONSULTATION_PRODUCTS = {
  C: {
    code: 'C',
    slug: 'life-blueprint',
    eyebrow: 'C · 人生藍圖',
    title: '把散落的人生線索，整理成一份能採取行動的個人報告。',
    lead: '不是替你下結論，而是把你反覆遇到的選擇、關係與壓力模式攤開來看。',
    description:
      '人生藍圖以 14 套命理系統交叉參照，將重複訊號、互相矛盾之處與資料限制分開呈現，再把專門術語翻成日常問題、可觀察線索與下一步。',
    price: 89,
    currency: 'USD',
    priceNote: '一次性費用；包含線上閱讀與可下載的完整報告。',
    ctaLabel: '建立我的人生藍圖',
    checkoutLabel: '前往填寫資料',
    heroNotes: ['按人生階段調整重點', '結論與依據分開閱讀', '保留不確定與相反訊號'],
    forWhom: [
      {
        title: '正站在轉折點',
        body: '工作、關係、居住地或家庭角色正在改變，需要先釐清自己真正要處理的問題。',
      },
      {
        title: '總在同一處卡住',
        body: '某些衝突、拖延或過度承擔反覆出現，想用新的角度辨認觸發點與可調整空間。',
      },
      {
        title: '不想只聽一句吉凶',
        body: '希望看見推論脈絡、不同系統的共識與分歧，也保留自己判斷的權利。',
      },
      {
        title: '想把理解變成練習',
        body: '比起抽象形容，更需要能放進日程、對話與決策流程的分階段行動設計。',
      },
    ],
    deliverables: [
      {
        marker: '01',
        title: '重點先讀',
        body: '先掌握當前較重要的課題、可運用的優勢，以及現在不必急著處理的事。',
      },
      {
        marker: '02',
        title: '主題閱讀導航',
        body: '依工作、關係、金錢與生活節奏分段閱讀，先從眼前最需要的主題開始。',
      },
      {
        marker: '03',
        title: '深入閱讀的主題章節',
        body: '從內在動機、壓力反應、溝通方式、職涯環境到資源使用，逐段說明情境與例外。',
      },
      {
        marker: '04',
        title: '人生階段與時間視角',
        body: '依實際年齡與當前人生階段調整主題、閱讀者、規劃長度與不宜使用的建議。',
      },
      {
        marker: '05',
        title: '分階段行動清單',
        body: '把洞察改寫成可觀察、可調整的小步驟，並提供回顧問題，不要求一次改變所有事情。',
      },
      {
        marker: '06',
        title: '14 系統排盤速覽',
        body: '集中查看各系統的主要排盤結果；遇到資料不足或訊號分歧時，正文會保留限制。',
      },
    ],
    process: [
      {
        number: '01',
        title: '填寫可核對的基本資料',
        body: '提供出生日期、時間、地點與目前最關心的生活主題；不確定的資訊可以直接註明。',
      },
      {
        number: '02',
        title: '完成排盤與資料檢查',
        body: '系統先處理排盤與欄位一致性，再把可用事實與需要保留的未知分開。',
      },
      {
        number: '03',
        title: '交叉整理共識與矛盾',
        body: '同一主題由不同系統互相對照；不硬湊一致，也不把單一訊號包裝成定論。',
      },
      {
        number: '04',
        title: '閱讀、標記、帶回生活驗證',
        body: '先讀摘要，再依需要深入章節；把有感與不符合的部分都留下，作為後續反思材料。',
      },
    ],
    boundaries: [
      '命理在這裡是反思與人生諮詢工具，不保證改運，也不替你決定重大人生選擇。',
      '內容不能取代醫療、法律、財務或心理健康專業服務；涉及急迫風險時，請先尋求合資格的專業協助。',
      '出生時間不明或資料有缺口時，相關結論會降低確定性並清楚標示，不用猜測補齊。',
      '報告描述的是可供觀察的傾向與情境，不把人格、關係或未來寫成不可改變的命運。',
    ],
    faqs: [
      {
        question: '我需要懂命理術語嗎？',
        answer: '不需要。主體以日常語言、生活情境與具體問題撰寫；需要追查時，再到依據附錄查看系統訊號。',
      },
      {
        question: '不知道準確出生時間，還能做嗎？',
        answer: '可以先如實填寫已知範圍。對時間敏感的內容會標為限制，不會把未知資訊寫成確定事實。',
      },
      {
        question: '這份報告會告訴我該不該離職、結婚或投資嗎？',
        answer: '不會替你下指令。報告會整理決策時容易忽略的需求、風險與提問，實際選擇仍應結合現實資料與合適的專業意見。',
      },
      {
        question: '內容可以一次讀完嗎？',
        answer: '可以，但不必勉強。先讀重點，再按工作、關係、金錢或生活節奏選擇章節，適合分次回看。',
      },
    ],
  },
  G15: {
    code: 'G15',
    slug: 'family-blueprint',
    eyebrow: 'G15 · 家族藍圖',
    title: '看見一家人如何彼此影響，而不是替誰貼上標籤。',
    lead: '把個人的需求、壓力反應與溝通節奏放進同一張家庭地圖，找出更可行的相處方式。',
    description:
      '這份家庭報告以 2–8 份已完成的人生藍圖為基礎，沿用 14 套命理系統的個人排盤結果，重新整理家庭中的互動循環、資源分配與可練習的對話。',
    price: 59,
    currency: 'USD',
    priceNote: '家族整合分析的一次性費用；每位成員的人生藍圖需另行完成。',
    prerequisite: '開始前，需在同一帳戶中選擇 2–8 份已完成的人生藍圖。',
    ctaLabel: '整理我們的家族藍圖',
    checkoutLabel: '選擇家庭成員',
    heroNotes: ['每位成員都有獨立視角', '不判定誰對誰錯', '把衝突改寫成可談的需要'],
    forWhom: [
      {
        title: '溝通常卡在同一個循環',
        body: '一開口就變成追問、退縮、防衛或沉默，希望先看懂各自如何被觸發。',
      },
      {
        title: '家庭角色正在轉換',
        body: '迎接新成員、孩子成長、照顧長輩或重新分工，需要更新彼此的期待與界線。',
      },
      {
        title: '想把責備改成理解',
        body: '願意理解每個人的保護方式與限制，並把「誰有問題」換成「我們可以怎麼合作」。',
      },
      {
        title: '需要一份共同語言',
        body: '希望家庭會議不再只有情緒與舊帳，而是有清楚題目、輪流發言與下一步。',
      },
    ],
    deliverables: [
      {
        marker: '01',
        title: '家庭全景摘要',
        body: '先看一家人目前最重要的共同課題、可調度資源，以及不應被簡化成個人責任的問題。',
      },
      {
        marker: '02',
        title: '成員視角卡',
        body: '保留每個人的需求、壓力訊號與偏好，不會依性別或排序指定父母角色。',
      },
      {
        marker: '03',
        title: '成員互動分析',
        body: '逐組整理容易互相理解與容易誤讀之處，避免只用一段總評概括整個家庭。',
      },
      {
        marker: '04',
        title: '衝突循環拆解',
        body: '把觸發點、表面行為、未說出口的需要與可能的修復入口連成可討論的流程。',
      },
      {
        marker: '05',
        title: '家庭溝通模式',
        body: '整理容易升高衝突或讓人退縮的溝通方式，並提出可嘗試的改善方向。',
      },
      {
        marker: '06',
        title: '共同練習建議',
        body: '從一項可共同觀察的小改變開始，保留例外情境與需要外部協助的界線。',
      },
    ],
    process: [
      {
        number: '01',
        title: '先完成人生藍圖',
        body: '每位要納入分析的成員都要有一份已完成的人生藍圖，避免用家人的描述代替本人資料。',
      },
      {
        number: '02',
        title: '選擇 2–8 位家庭成員',
        body: '只可選擇同一帳戶內可使用的報告；姓名與身分資料以已完成報告為準。',
      },
      {
        number: '03',
        title: '整理互動，不猜測角色',
        body: '先保留每個人自己的事實，再分析雙人與全家的互動；不從性別、順序或文章內容推測家庭角色。',
      },
      {
        number: '04',
        title: '共同閱讀與選一件事練習',
        body: '先由每個人確認自己的段落，再挑一個最需要改善的循環，建立可以回顧的家庭約定。',
      },
    ],
    boundaries: [
      '命理在這裡是家庭反思與諮詢工具，不保證改運，也不把任何成員判定為問題來源。',
      '內容不能取代醫療、法律、財務、心理健康或家事調解專業服務；暴力、虐待或立即安全風險應優先尋求在地支援。',
      '未成年人專屬的內容與監護流程尚未開放，目前不接受新增或納入未成年人報告。',
      '報告不會依性別或排序指定父母角色，也不以命理推論診斷人格、創傷或心理疾病。',
      '家族藍圖提供共同語言與觀察方向，不替任何人裁決爭議、安排義務或要求關係繼續。',
    ],
    faqs: [
      {
        question: '為什麼要先完成人生藍圖？',
        answer: '家庭分析需要先尊重每位成員自己的資料與脈絡。以已完成的個人報告作基礎，能降低把他人想像成某種角色的風險。',
      },
      {
        question: '可以放幾位家庭成員？',
        answer: '每份家族藍圖可選擇 2–8 份同一帳戶內已完成的人生藍圖。家族藍圖費用不包含個別人生藍圖。',
      },
      {
        question: '小孩可以納入嗎？',
        answer: '目前不開放。未成年人需要獨立的內容安全、閱讀方式與監護流程；這些流程完成驗證前，不會接受新增或納入未成年人報告。',
      },
      {
        question: '報告會判斷誰比較適合當主導者嗎？',
        answer: '不會。報告聚焦於情境、需要、分工與溝通條件，不從性別、排行或命理訊號指定權力位置。',
      },
      {
        question: '如果家中有嚴重衝突，這份報告能解決嗎？',
        answer: '它可以提供整理問題的語言，但不能替代安全計畫、心理治療、法律意見或專業家事調解。若有暴力或立即風險，請先尋求在地緊急與專業支援。',
      },
    ],
  },
} as const satisfies Record<ConsultationProductCode, ConsultationProduct>
