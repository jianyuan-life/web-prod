import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '隱私政策',  // root layout template 會補「| 鑒源 JianYuan」、此處只寫純標題避免品牌名重複
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
        <p>我們使用三類 Cookie:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>必要 Cookie</strong>(無法關閉):維持登入狀態、結帳流程、安全性</li>
          <li><strong>分析 Cookie</strong>(預設關閉、需明確同意):Google Analytics 4 匿名統計、改善網站體驗</li>
          <li><strong>行銷 Cookie</strong>(預設關閉、需明確同意):Meta Pixel 衡量廣告成效</li>
        </ul>
        <p>您可以隨時透過頁面下方 Cookie banner 或瀏覽器設定調整偏好。我們使用 Google Consent Mode v2、預設拒絕分析與行銷 Cookie、直到您明確同意。</p>

        <h2 className="text-xl font-semibold text-white">7. GDPR 條款(歐洲經濟區用戶)</h2>
        <p>若您位於歐盟、歐洲經濟區、英國、瑞士、本服務依《一般資料保護規則》(GDPR)及對應在地法令處理您的個人資料。</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>資料控制者(Data Controller):</strong>鑒源 JianYuan(jianyuan.life 經營者)</li>
          <li><strong>聯絡窗口:</strong><a href="mailto:support@jianyuan.life" className="text-gold">support@jianyuan.life</a>(可索取資料保護聯絡人 DPO 詳細資訊)</li>
          <li><strong>處理依據(Lawful Basis):</strong>(a) 履行契約必要(報告生成 / 客服)(b) 您的明確同意(分析與行銷 Cookie / 行銷郵件)(c) 合法利益(防詐欺 / 服務改善)</li>
          <li><strong>跨境傳輸法律基礎:</strong>資料存於 Supabase AWS 新加坡區、跨境傳輸採用歐盟標準契約條款(SCC、Standard Contractual Clauses)2021/914 模組二。</li>
          <li><strong>您的 GDPR 權利:</strong>存取(Art.15)、更正(Art.16)、刪除(Art.17、被遺忘權)、限制處理(Art.18)、資料攜帶(Art.20)、反對處理(Art.21)、撤回同意(Art.7-3)。</li>
          <li><strong>申訴權:</strong>若您認為我們處理方式違反 GDPR、可向您所在國家的資料保護主管機關投訴。</li>
          <li><strong>回應時限:</strong>收到請求後、我們將在 30 個工作日內回覆(GDPR Art.12-3、若情況複雜可延長至 60 日並通知)。</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">8. CCPA 條款(美國加州居民)</h2>
        <p>若您是美國加州居民、依《加州消費者隱私法》(CCPA / CPRA)享有以下權利:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>知情權(Right to Know):過去 12 個月我們收集 / 使用 / 揭露的個人資料類別</li>
          <li>刪除權(Right to Delete):要求刪除我們持有的個人資料</li>
          <li>更正權(Right to Correct):要求更正不準確的個人資料</li>
          <li>退出販售權(Right to Opt-Out):本服務不販售個人資料給第三方;若未來開啟、將提供「Do Not Sell My Personal Information」連結</li>
          <li>不歧視權(Right to Non-Discrimination):行使權利不會影響您的服務使用</li>
        </ul>
        <p>欲行使上述權利、請寄信至 <a href="mailto:support@jianyuan.life" className="text-gold">support@jianyuan.life</a> 並註明「CCPA 請求」。</p>

        <h2 className="text-xl font-semibold text-white">9. 帳號刪除自助路徑(GDPR Art.17 / CCPA 配合)</h2>
        <p>您可透過以下方式刪除帳號與所有相關資料:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>(目前)寄信至 <a href="mailto:support@jianyuan.life" className="text-gold">support@jianyuan.life</a> 標題「刪除帳號」</li>
          <li>我們在 7 個工作日內確認、30 天內完成刪除(法律要求保留的交易記錄除外、如稅務憑證 7 年)</li>
          <li>(規劃中)dashboard 設置 → 「刪除我的帳號」按鈕 + 30 天 grace period 自動完成</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">10. 聯繫我們</h2>
        <p>隱私相關問題請聯繫:<a href="mailto:support@jianyuan.life" className="text-gold">support@jianyuan.life</a></p>
        <p className="text-text-muted text-sm">本政策最後更新:2026-04-28(v5.6.10、新增 GDPR / CCPA 條款 + Cookie Consent Mode v2)</p>
      </div>
    </div>
  )
}
