import type { Metadata } from 'next'
import { PUBLIC_CLAIMS } from '@/lib/public-claims'

export const metadata: Metadata = {
  title: '使用條款',  // root layout template 會補「| 鑒源 JianYuan」、此處只寫純標題避免品牌名重複
  description: PUBLIC_CLAIMS.terms.description,
  alternates: { canonical: 'https://jianyuan.life/terms' },
  robots: { index: true, follow: true },
}

export default function TermsPage() {
  return (
    <article className="jy-page jy-reading-page py-20 max-w-3xl mx-auto px-6">
      <h1 className="text-3xl font-bold text-gradient-gold mb-8">使用條款</h1>
      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-text">
        <p><strong>最後更新：</strong>2026年3月31日</p>

        <h2 className="text-xl font-semibold text-white">1. 服務描述</h2>
        <p>{PUBLIC_CLAIMS.terms.service}</p>

        <h2 className="text-xl font-semibold text-white">2. 用戶責任</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>{PUBLIC_CLAIMS.terms.inputResponsibility}</li>
          <li>不得將報告用於非法目的</li>
          <li>不得嘗試逆向工程或破解系統</li>
          <li>不得轉售或商業性分發報告內容</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">3. 智慧財產權</h2>
        <p>報告內容的著作權歸本平台所有。用戶購買報告後獲得個人使用權，可以列印、分享給家人朋友，但不得用於商業用途。</p>

        <h2 className="text-xl font-semibold text-white">4. 免責聲明</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>{PUBLIC_CLAIMS.terms.limits}</li>
          <li>本服務不能預測未來、治療疾病或保證投資回報</li>
          <li>用戶應自行判斷是否採納報告中的建議</li>
          <li>健康問題請諮詢醫生，投資決策請諮詢專業理財顧問</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">5. 服務保證</h2>
        <p>{PUBLIC_CLAIMS.terms.fulfillment}依本頁所列條件<strong className="text-gold">不支援退款</strong>；以下情況仍有對應處理方式：</p>
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
    </article>
  )
}
