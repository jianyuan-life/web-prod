import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '使用條款 — 鑒源 JianYuan',
  description: '鑒源（JianYuan）使用條款：使用本服務即表示您同意以下條款，命理分析僅供參考，不構成任何醫療、投資或法律建議。',
  alternates: { canonical: 'https://jianyuan.life/terms' },
  robots: { index: true, follow: true },
}

export default function TermsPage() {
  return (
    <div className="py-20 max-w-3xl mx-auto px-6">
      <h1 className="text-3xl font-bold text-gradient-gold mb-8">使用條款</h1>
      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-text">
        <p><strong>最後更新：</strong>2026年3月31日</p>

        <h2 className="text-xl font-semibold text-white">1. 服務描述</h2>
        <p>鑒源系統是一個整合東西方十四大命理系統的命理分析平台。本服務提供的所有分析結果<strong>僅供參考和娛樂用途</strong>，不構成任何醫療、投資、法律或其他專業建議。</p>

        <h2 className="text-xl font-semibold text-white">2. 用戶責任</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>提供真實準確的出生資料以獲得最佳分析結果</li>
          <li>不得將報告用於非法目的</li>
          <li>不得嘗試逆向工程或破解系統</li>
          <li>不得轉售或商業性分發報告內容</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">3. 智慧財產權</h2>
        <p>報告內容的著作權歸本平台所有。用戶購買報告後獲得個人使用權，可以列印、分享給家人朋友，但不得用於商業用途。</p>

        <h2 className="text-xl font-semibold text-white">4. 免責聲明</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>命理分析基於傳統理論和科技化精算，不保證100%準確</li>
          <li>本服務不能預測未來、治療疾病或保證投資回報</li>
          <li>用戶應自行判斷是否採納報告中的建議</li>
          <li>健康問題請諮詢醫生，投資決策請諮詢專業理財顧問</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">5. 服務保證</h2>
        <p>鑒源報告為個人化數位商品、付款後即開始精密計算(14 套命理系統運算 + AI 整合)、依國際電子商品慣例<strong className="text-gold">不支援退款</strong>。為維護所有客戶的服務品質、我們提供以下保證:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>生成失敗自動重試:</strong>系統自動重試最多 3 次、若仍失敗 24 小時內客服協助補開新單</li>
          <li><strong>內容明顯錯誤:</strong>(如出生資料解讀錯誤)免費重新生成、不再扣款</li>
          <li><strong>系統重複扣款:</strong>因平台技術問題導致重複扣款、無條件退回多扣金額</li>
          <li><strong>未經授權扣款:</strong>信用卡盜刷 / 家人誤購、提供 Stripe 交易紀錄即可申訴退回</li>
        </ul>
        <p className="mt-2 text-sm text-text-muted">下單前請仔細確認方案內容、出生資料、付款金額。對於主觀不滿意 / 已查看報告等情況、依電子商品慣例不退費。如有任何疑慮、請先試用<a href="/tools/bazi" className="text-gold">免費速算</a>或閱讀<a href="/faq" className="text-gold">常見問題</a>。</p>

        <h2 className="text-xl font-semibold text-white">6. 管轄法律</h2>
        <p>本條款受香港特別行政區法律管轄。任何爭議應先通過友好協商解決，協商不成的提交香港國際仲裁中心仲裁。</p>

        <h2 className="text-xl font-semibold text-white">7. 聯繫方式</h2>
        <p>如有任何問題，請聯繫：<a href="mailto:support@jianyuan.life" className="text-gold">support@jianyuan.life</a></p>
      </div>
    </div>
  )
}
