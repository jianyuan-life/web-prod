// v5.6.10 R4:退費政策獨立頁(IA Agent P0 / 對齊 TrustBar「7 天無條件退費」+ GDPR/CCPA 對應)
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '退費政策',
  description: '鑒源命理平台退費政策:7 天無條件退費承諾、報告生成失敗自動全額退款、爭議處理流程。',
  alternates: { canonical: 'https://jianyuan.life/refund' },
}

export default function RefundPolicyPage() {
  return (
    <div className="py-24">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-10">
          <div className="text-xs tracking-[0.3em] text-gold/60 mb-3">REFUND POLICY</div>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient-gold mb-3" style={{ fontFamily: 'var(--font-sans)' }}>
            退費政策
          </h1>
          <p className="text-text-muted text-sm">最後更新:2026-04-28 · v5.6.11</p>
        </div>

        {/* 核心承諾 */}
        <div className="glass rounded-2xl p-6 mb-8 border border-gold/30">
          <h2 className="text-lg font-bold text-cream mb-3 flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5 text-gold">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            鑒源 3 大退費承諾
          </h2>
          <ul className="space-y-2.5 text-sm text-text leading-relaxed">
            <li className="flex gap-2">
              <span className="text-gold mt-1 shrink-0">①</span>
              <div>
                <strong className="text-cream">7 天無條件退費</strong>:收到報告後 7 天內、若不滿意可申請全額退款、不需理由。
              </div>
            </li>
            <li className="flex gap-2">
              <span className="text-gold mt-1 shrink-0">②</span>
              <div>
                <strong className="text-cream">生成失敗自動退費</strong>:若系統自動重試 3 次後仍無法生成報告、24 小時內全額退款並 email 通知。
              </div>
            </li>
            <li className="flex gap-2">
              <span className="text-gold mt-1 shrink-0">③</span>
              <div>
                <strong className="text-cream">技術問題寬限</strong>:若因平台技術問題(網站故障 / Stripe 系統錯誤)導致重複扣款、無條件全額退款。
              </div>
            </li>
          </ul>
        </div>

        {/* 申請流程 */}
        <h2 className="text-xl font-bold text-cream mt-12 mb-4">如何申請退費</h2>
        <ol className="space-y-4 text-sm text-text leading-relaxed">
          <li className="glass rounded-xl p-5 border-l-2 border-gold/30">
            <div className="text-gold font-semibold mb-1">1. 寄信至 support@jianyuan.life</div>
            <div className="text-text-muted text-xs leading-loose">
              主旨:「退費申請 — [訂單編號]」<br />
              內文必含:訂單 Stripe session_id(可在 dashboard「我的報告」查看)、退費原因(7 天內可選填)、希望退款方式(原信用卡 / 改其他支付)
            </div>
          </li>
          <li className="glass rounded-xl p-5 border-l-2 border-gold/30">
            <div className="text-gold font-semibold mb-1">2. 客服 1 個工作日內回覆</div>
            <div className="text-text-muted text-xs leading-loose">
              我們會在收到信後 1 個工作日內回覆確認、若需要補充資訊會主動聯繫您。
            </div>
          </li>
          <li className="glass rounded-xl p-5 border-l-2 border-gold/30">
            <div className="text-gold font-semibold mb-1">3. Stripe 退款 5-10 個工作日入帳</div>
            <div className="text-text-muted text-xs leading-loose">
              退款由 Stripe 系統處理、款項將原路退回您的信用卡。國際信用卡入帳時間因發卡銀行而異(美國 / 台灣 / 香港 / 新加坡通常 5-10 個工作日)。
            </div>
          </li>
        </ol>

        {/* 退費條件細則 */}
        <h2 className="text-xl font-bold text-cream mt-12 mb-4">退費條件細則</h2>
        <div className="space-y-4 text-sm text-text">
          <div>
            <h3 className="text-gold font-semibold mb-2">✅ 100% 全額退款的情況</h3>
            <ul className="list-disc pl-5 space-y-1 text-text-muted text-[13px]">
              <li>下單後尚未生成報告(系統還在生成中、可隨時取消)</li>
              <li>報告生成失敗、系統自動重試 3 次仍無法完成</li>
              <li>收到報告 7 天內、客戶以任何理由申請退款</li>
              <li>因平台技術問題導致重複扣款、空白報告、無法閱讀</li>
              <li>未經授權的扣款(信用卡盜刷、家人誤購)</li>
            </ul>
          </div>

          <div>
            <h3 className="text-gold font-semibold mb-2">⚠️ 部分退款的情況</h3>
            <ul className="list-disc pl-5 space-y-1 text-text-muted text-[13px]">
              <li>家族藍圖 G15:已生成的成員報告不可退、未生成的可全額退</li>
              <li>合否方案 R:已支付加人費($19/人)若該人未提交資料、可退</li>
              <li>使用優惠碼 / 推薦積分折抵的訂單:退實際支付金額、積分恢復</li>
            </ul>
          </div>

          <div>
            <h3 className="text-gold font-semibold mb-2">❌ 不予退款的情況</h3>
            <ul className="list-disc pl-5 space-y-1 text-text-muted text-[13px]">
              <li>已收到報告超過 7 天(出門訣 E1 / E2 適用日期已過)</li>
              <li>客戶提供錯誤出生資料導致報告偏差(可重生但不退費)</li>
              <li>滥用退費政策(短期內反覆下單退款、Stripe 風險審核)</li>
              <li>已主動分享報告連結給多人(視為已使用、不可退)</li>
            </ul>
          </div>
        </div>

        {/* GDPR/CCPA 連結 */}
        <div className="glass rounded-xl p-5 mt-12 border border-gold/20">
          <h3 className="text-cream font-semibold mb-2 text-sm">退費後的個人資料處理</h3>
          <p className="text-text-muted text-xs leading-relaxed">
            退費完成後、若您希望同時刪除帳號與所有相關資料、請參閱{' '}
            <Link href="/privacy" className="text-gold underline">隱私政策第 9 條「帳號刪除自助路徑」</Link>。
            符合 GDPR Art.17(被遺忘權)與 CCPA 刪除權規範。
          </p>
        </div>

        {/* 聯絡資訊 */}
        <div className="text-center mt-12 pt-8 border-t border-gold/10">
          <p className="text-sm text-text-muted mb-4">退費或其他疑問請聯繫</p>
          <a href="mailto:support@jianyuan.life" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gold/10 border border-gold/30 text-gold hover:bg-gold/20 transition-colors text-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M4 4h16c1 0 2 1 2 2v12c0 1-1 2-2 2H4c-1 0-2-1-2-2V6c0-1 1-2 2-2z" />
              <polyline points="22 6 12 13 2 6" />
            </svg>
            support@jianyuan.life
          </a>
          <p className="text-xs text-text-muted/70 mt-3">回覆時間:1 個工作日內(週末 / 假日順延)</p>
        </div>
      </div>
    </div>
  )
}
