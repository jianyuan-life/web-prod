import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '隱私政策 — 鑒源 JianYuan',
  description: '鑒源（JianYuan）隱私政策：說明我們如何收集、使用及保護您的個人資料。',
  alternates: { canonical: 'https://jianyuan.life/privacy' },
  robots: { index: true, follow: true },
}

export default function PrivacyPage() {
  return (
    <div className="py-20 max-w-3xl mx-auto px-6">
      <h1 className="text-3xl font-bold text-gradient-gold mb-8">隱私政策</h1>
      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-text">
        <p><strong>最後更新：</strong>2026年3月31日</p>

        <h2 className="text-xl font-semibold text-white">1. 收集的資料</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>帳號資訊：Email、姓名</li>
          <li>出生資料：日期、時間、地點、性別（用於命理計算）</li>
          <li>支付資訊：由 Stripe 安全處理，本平台不存儲信用卡號</li>
          <li>使用數據：IP 位址、設備資訊、瀏覽記錄</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">2. 資料用途</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>生成個人化命理分析報告</li>
          <li>發送報告完成通知和服務更新</li>
          <li>改善服務品質和用戶體驗</li>
          <li>我們<strong>不會</strong>出售您的個人資料給任何第三方</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">3. 資料存儲與安全</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>資料存儲於 Supabase（AWS 新加坡區域）</li>
          <li>傳輸加密：TLS 1.3</li>
          <li>存儲加密：AES-256</li>
          <li>定期安全審計和漏洞掃描</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">4. 第三方服務</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Stripe：支付處理</li>
          <li>報告分析引擎（資料匿名化處理）</li>
          <li>Resend：郵件發送</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">5. 您的權利</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>存取：</strong>您可以隨時下載所有個人資料</li>
          <li><strong>修正：</strong>您可以編輯個人資料和出生資料</li>
          <li><strong>刪除：</strong>您可以要求刪除帳號和所有相關資料</li>
          <li><strong>攜帶：</strong>您可以匯出資料（JSON 格式）</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">6. Cookie 政策</h2>
        <p>我們使用必要的 Cookie 來維持登入狀態。分析 Cookie 為可選，需要您的明確同意。</p>

        <h2 className="text-xl font-semibold text-white">7. 聯繫我們</h2>
        <p>隱私相關問題請聯繫：<a href="mailto:support@jianyuan.life" className="text-gold">support@jianyuan.life</a></p>
      </div>
    </div>
  )
}
