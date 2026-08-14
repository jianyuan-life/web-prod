import type { Metadata } from 'next'
import ConsentSettingsButton from '@/components/ConsentSettingsButton'
import { PUBLIC_CLAIMS } from '@/lib/public-claims'

export const metadata: Metadata = {
  title: '隱私政策',
  description: PUBLIC_CLAIMS.privacy.description,
  alternates: { canonical: 'https://jianyuan.life/privacy' },
  robots: { index: true, follow: true },
}

const SUPPORT_EMAIL = 'support@jianyuan.life'

export default function PrivacyPage() {
  return (
    <article className="jy-page jy-reading-page py-20 max-w-3xl mx-auto px-6">
      <h1 className="text-3xl font-bold text-gradient-gold mb-8">隱私政策</h1>
      <div className="prose prose-invert prose-sm max-w-none space-y-6 text-text">
        <p><strong>最後更新：</strong>2026 年 8 月 14 日</p>

        <h2 className="text-xl font-semibold text-white">1. 我們收集的資料</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>帳號與聯絡資料，例如 Email 與姓名。</li>
          <li>你主動提供的出生日期、時間、地點、性別、問題與家庭成員資料。</li>
          <li>服務與付款紀錄；完整信用卡號由 Stripe 處理，本平台不直接儲存。</li>
          <li>網站使用資料，例如 IP 位址、裝置資訊、頁面瀏覽與 Cookie 偏好。</li>
        </ul>

        <h2 className="text-xl font-semibold text-white">2. 我們如何使用資料</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>排盤、產生你要求的內容，並提供報告閱讀與客戶服務。</li>
          <li>處理付款、發送服務通知，以及防止濫用或未授權存取。</li>
          <li>在取得相應 Cookie 同意後，了解頁面使用情況與服務成效。</li>
        </ul>
        <p>{PUBLIC_CLAIMS.privacy.freeToolAnalytics}</p>

        <h2 className="text-xl font-semibold text-white">3. 儲存、安全與服務供應商</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>網站使用 HTTPS 傳輸連線。</li>
          <li>帳號、訂單與報告資料使用 Supabase 儲存；付款由 Stripe 處理。</li>
          <li>報告分析服務與郵件供應商會在提供服務所需範圍內處理資料。</li>
          <li>
            營運錯誤監控與即時告警可能使用 Sentry 與 Telegram。應用程式層只傳送事件類型、
              必要營運欄位與專用金鑰產生的截短 HMAC 指紋；金鑰未配置時不傳送可關聯指紋。
              應用程式層不傳送完整出生資料、問題內容或 Email；供應商仍可能因一般網路傳輸接收 IP 位址等連線資訊。
          </li>
        </ul>
        <p>
          我們不在本政策中宣稱未經獨立證明的特定加密版本或稽核頻率。若發現安全問題，請寄信至{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold">{SUPPORT_EMAIL}</a>。
        </p>

        <h2 className="text-xl font-semibold text-white">4. Cookie 與分析服務</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>必要 Cookie：</strong>維持登入、結帳與安全功能。</li>
          <li><strong>分析 Cookie：</strong>經同意後，Google Analytics 4 會用於了解網站使用情況。</li>
          <li><strong>行銷 Cookie：</strong>經同意後，Meta Pixel 會用於衡量廣告與轉化成效。</li>
        </ul>
        <p>你可以透過 Cookie banner 或瀏覽器設定調整偏好。</p>
        <ConsentSettingsButton className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-gold/40 px-4 py-2 font-semibold text-gold transition-colors hover:border-gold hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70" />

        <h2 className="text-xl font-semibold text-white">5. 資料權利要求</h2>
        <p>{PUBLIC_CLAIMS.privacy.requestScope}</p>
        <p>
          請寄信至 <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold">{SUPPORT_EMAIL}</a>，
          並說明要存取、更正、限制使用或刪除哪些資料。網站目前不提供自助全量匯出功能。
        </p>

        <h2 className="text-xl font-semibold text-white">6. GDPR 可能適用的情況</h2>
        <p>
          若 GDPR 適用於你的資料處理，相關權利可能包括存取、更正、刪除、限制處理、資料攜帶、反對處理及撤回同意。
          你也可以向所在地的資料保護主管機關提出申訴。
        </p>
        <p><strong>回應時限：</strong>{PUBLIC_CLAIMS.privacy.gdprTiming}（GDPR Art. 12(3)）</p>

        <h2 className="text-xl font-semibold text-white">7. 加州隱私要求</h2>
        <p>{PUBLIC_CLAIMS.privacy.ccpaApplicability}</p>
        <p>
          請寄信至 <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold">{SUPPORT_EMAIL}</a>，
          主旨註明「加州隱私要求」。我們會先核對適用性與提出要求者的身分。
        </p>

        <h2 className="text-xl font-semibold text-white">8. 保存與刪除</h2>
        <p>
          資料只在提供服務、處理爭議與履行法律義務所需期間保存。刪除要求不一定涵蓋依法必須保留的交易、稅務或安全紀錄。
        </p>

        <h2 className="text-xl font-semibold text-white">9. 聯繫我們</h2>
        <p>
          隱私相關問題請寄信至 <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gold">{SUPPORT_EMAIL}</a>。
        </p>
      </div>
    </article>
  )
}
