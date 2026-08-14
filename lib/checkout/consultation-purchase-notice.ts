export type ConsultationPurchasePlan = 'C' | 'G15'

export type ConsultationPurchaseNotice = {
  eyebrow: string
  title: string
  introduction: string
  deliverables: readonly string[]
  beforeContinuing: readonly string[]
  timing: string
}

export const CONSULTATION_PURCHASE_NOTICES: Record<ConsultationPurchasePlan, ConsultationPurchaseNotice> = {
  C: {
    eyebrow: '人生藍圖 · 一次性委託',
    title: '開始前，先確認這份服務適合您',
    introduction: '下一步會先填寫出生資料並核對金額；送出資料後，才會前往 Stripe 完成付款。',
    deliverables: [
      '十四套命理系統交叉對照；若不同系統出現歧異，報告會保留差異，不硬湊成單一答案。',
      '內容涵蓋核心性格、關係互動、工作與學習、資源運用，以及目前人生階段可採取的行動。',
      '完成後可在「我的報告」分段閱讀，也可下載 PDF 保存；篇幅以有效內容為準，不用重複文字湊數。',
    ],
    beforeContinuing: [
      '請準備正確的國曆出生日期、出生時間與出生城市；不知道確切時辰時，報告可用範圍會受影響。',
      '命理詮釋是理解自己與整理選擇的參考，不是醫療、法律或財務建議，也不保證特定結果。',
    ],
    timing: '完成付款且資料齊全後開始生成。長篇報告通常需要 30 分鐘以上；完成後會寄信通知，不必停留在頁面等待。',
  },
  G15: {
    eyebrow: '家族藍圖 · 一次性委託',
    title: '開始前，先確認成員與授權',
    introduction: '下一步會從您的帳號選擇 2 至 8 份已完成的人生藍圖，補充家庭關係與諮詢目標；核對後才前往 Stripe 付款。',
    deliverables: [
      '以已完成的人生藍圖為基礎，整理每位成員的差異、互補處、常見摩擦與可實行的溝通方式。',
      '家庭角色只依您提供的關係說明，不會用性別、年齡或選取順序猜測誰是父母、伴侶或主要照顧者。',
      '完成後可在「我的報告」循序閱讀，也可下載 PDF；家庭人數愈多，內容與交叉關係會相應增加。',
    ],
    beforeContinuing: [
      '每位成員都必須是成年人，並明確同意本次分析；未成年人專屬流程尚未開放。',
      '請先確認每位成員的人生藍圖出生資料正確，再寫明成員關係與這次最想改善的真實情境。',
      '命理詮釋可用來開啟對話，不可取代家庭治療、醫療、法律或財務專業意見。',
    ],
    timing: '完成付款且成員資料齊全後開始生成。家庭人數與交叉關係較多時會需要更長時間；完成後會寄信通知。',
  },
}

export const CONSULTATION_SERVICE_GUARANTEES = [
  '付款由 Stripe 處理；鑒源不會接收或保存您的完整卡片資料。',
  '若生成失敗，系統會自動重試；仍未完成時，客服會協助補開，不會再次扣款。',
  '若出生資料被明顯讀錯，可免費重新生成；若系統重複扣款，會退回多收金額。',
  '若屬未經授權的扣款，可提供 Stripe 交易紀錄提出申訴。',
] as const

export const CONSULTATION_REFUND_SUMMARY =
  '個人化數位報告開始生成後，不因主觀喜好辦理退費；內容明顯錯誤、重複扣款與未經授權扣款，依上列服務保障處理。'
