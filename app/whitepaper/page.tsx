import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '鑑源命理學術白皮書 | 14 系統交叉驗證方法論',
  description:
    '44,421+ 條規則來源盤點、365 天 Windada 驗證、12 位中港台客戶八字一致率 100%、16 位紫微 3-way 驗證、20 組奇門時辰盤局數一致率 100%。鑑源命理研究部門公開發布。',
  keywords: [
    '命理學術白皮書',
    '命理方法論',
    '八字驗證',
    '紫微斗數驗證',
    '奇門遁甲',
    '拆補法',
    'Swiss Ephemeris',
    'Windada',
    'lunar_python',
    '命理工程化',
    '鑑源 jianyuan',
  ],
  openGraph: {
    title: '鑑源命理學術白皮書 v1.0',
    description:
      '給專業人士看的研究：鑑源如何把 14 套命理系統做到可交叉驗證、可追溯、可回歸測試。',
    type: 'article',
    url: 'https://jianyuan.life/whitepaper',
    images: ['/logo-full.svg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: '鑑源命理學術白皮書 v1.0',
    description: '14 系統交叉驗證方法論與工業級排盤引擎技術報告。',
  },
  alternates: {
    canonical: 'https://jianyuan.life/whitepaper',
  },
}

export default function WhitepaperPage() {
  return (
    <div className="py-20 max-w-4xl mx-auto px-6">
      {/* Hero */}
      <header className="text-center mb-16">
        <div className="inline-block mb-4 text-sm tracking-widest text-gold uppercase">
          For Professionals · 給專業人士看的研究
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-gradient-gold mb-6 leading-tight">
          鑑源命理學術白皮書
        </h1>
        <p className="text-lg md:text-xl text-text-muted max-w-2xl mx-auto leading-relaxed">
          14 系統交叉驗證方法論與工業級排盤引擎技術報告
        </p>
        <div className="mt-6 text-sm text-text-muted">
          版本 v1.0 · 2026 年 4 月 17 日 · 鑑源命理研究部門編纂
        </div>

        {/* 下載按鈕 */}
        <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center items-center">
          <a
            href="/whitepaper_v1.pdf"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gold text-midnight font-semibold shadow-lg hover:opacity-90 transition"
          >
            下載 PDF（免費提供，21 頁）
          </a>
          <a
            href="#summary"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/20 text-text hover:bg-white/5 transition"
          >
            線上閱讀摘要
          </a>
        </div>
      </header>

      {/* Summary */}
      <section id="summary" className="mb-16">
        <h2 className="text-2xl font-bold text-white mb-6 border-l-4 border-gold pl-4">
          為什麼寫這份白皮書？
        </h2>
        <div className="space-y-4 text-text leading-relaxed">
          <p>
            命理服務長期面臨四個工程學上的挑戰：排盤基礎不一致、規則隱性化、報告模板化、精度不透明。
            市面多數平台未公開其排盤結果與權威文獻的一致率，使用者無從判斷可靠度。
          </p>
          <p>
            本白皮書記錄鑑源命理研究部門為了將東方命理系統產品化、工業化、可驗證化所採用的研究方法、
            排盤引擎架構與驗證流程。我們主張的差異不在「比古人更準」或「AI 取代師父」，而來自工程方法論：
            <strong className="text-white">規則導向、交叉驗證、回歸測試、誠實揭露限制</strong>。
          </p>
          <p>
            本文件適合命理從業人員、媒體與記者、技術投資人、學術研究者閱讀。所有數字、案例、引用皆可追溯到 GitHub
            公開倉庫的驗證腳本與驗證報告。
          </p>
        </div>
      </section>

      {/* Key findings grid */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-white mb-6 border-l-4 border-gold pl-4">
          關鍵數據摘要
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {KEY_METRICS.map((m) => (
            <div
              key={m.label}
              className="rounded-lg border border-white/10 bg-white/5 p-5 hover:border-gold/40 transition"
            >
              <div className="text-sm text-text-muted mb-1">{m.label}</div>
              <div className="text-2xl font-bold text-gold">{m.value}</div>
              <div className="text-xs text-text-muted mt-2">{m.note}</div>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-text-muted leading-relaxed">
          以上所有數值皆可於白皮書附錄 B 的引擎精度實測表中追溯到對應的驗證腳本（例如{' '}
          <code className="text-gold">test_qimen_windada20.py</code>、
          <code className="text-gold">test_ziwei_16_clients.py</code>
          ），並由鑑源命理研究部門公開於 GitHub 倉庫。
        </p>
      </section>

      {/* TOC */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-white mb-6 border-l-4 border-gold pl-4">
          白皮書目錄
        </h2>
        <ol className="space-y-3 text-text list-decimal list-inside">
          <li>摘要（Executive Summary）</li>
          <li>研究背景與動機</li>
          <li>研究方法論：規則導向 + 交叉驗證 + 回歸測試</li>
          <li>14 系統整合理論：權重分配與衝突仲裁</li>
          <li>八字引擎驗證：12 位中港台客戶 + 真太陽時校正</li>
          <li>紫微斗數引擎驗證：16 位客戶 3-way 驗證 + 5 個歷史 bug 修復</li>
          <li>奇門遁甲引擎：Windada 20 組 + 365 天快照</li>
          <li>產品化實踐：從古籍到 AI 的轉譯流程</li>
          <li>未來研究方向：多語言、多派別、多系統拓展</li>
          <li>附錄 A：40+ 權威來源清單（古籍、現代教材、開源軟體）</li>
          <li>附錄 B：引擎精度實測表</li>
        </ol>
      </section>

      {/* Citation */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold text-white mb-6 border-l-4 border-gold pl-4">
          如何引用
        </h2>
        <div className="rounded-lg border border-white/10 bg-white/5 p-5 font-mono text-sm text-text leading-relaxed">
          鑑源命理研究部門（2026）。《鑑源命理學術白皮書：14
          系統交叉驗證方法論與工業級排盤引擎技術報告》（v1.0）。鑑源命理平台。
          <br />
          <span className="text-text-muted">
            https://jianyuan.life/whitepaper
          </span>
        </div>
      </section>

      {/* CTA */}
      <section className="rounded-xl border border-gold/30 bg-gradient-to-br from-gold/10 to-transparent p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-3">
          媒體、合作、學術交流
        </h2>
        <p className="text-text-muted mb-6 max-w-xl mx-auto">
          歡迎同業、學界、媒體查證、質疑、並提供改進意見。研究部門對白皮書的每項數據負責，且保留未來版本修訂權。
        </p>
        <a
          href="mailto:support@jianyuan.life?subject=關於鑑源命理學術白皮書"
          className="inline-block px-8 py-3 rounded-full bg-gold text-midnight font-semibold hover:opacity-90 transition"
        >
          聯繫研究部門
        </a>
        <div className="mt-6 text-xs text-text-muted">
          支援信箱：support@jianyuan.life
        </div>
      </section>

      {/* Footer nav */}
      <div className="mt-16 flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-text-muted border-t border-white/10 pt-8">
        <Link href="/" className="hover:text-gold transition">
          返回首頁
        </Link>
        <Link href="/pricing" className="hover:text-gold transition">
          查看服務方案
        </Link>
        <Link href="/blog" className="hover:text-gold transition">
          研究部落格
        </Link>
      </div>
    </div>
  )
}

const KEY_METRICS: Array<{ label: string; value: string; note: string }> = [
  {
    label: '整合系統數量',
    value: '14 套',
    note: '八字 / 紫微 / 奇門 / 西洋占星 / 吠陀 / 人類圖 / 姓名學 / 易經 / 塔羅 / 數字命理 / 風水 / 生肖 / 古典命理 / 生物節律',
  },
  {
    label: '計算引擎總行數',
    value: '16,090 行',
    note: 'Python 程式碼，含 266 個 raw_data 欄位',
  },
  {
    label: '規則來源盤點',
    value: '44,421+ 條',
    note: '源自數十部經典古籍與現代學者教材',
  },
  {
    label: '權威來源引用',
    value: '40+ 個',
    note: '古籍 18 部、現代學者 22 位、開源軟體 11 個',
  },
  {
    label: '八字驗證案例',
    value: '12 位',
    note: '中港台完整客戶案例，四柱一致率（排除流派差異）100%',
  },
  {
    label: '紫微驗證案例',
    value: '16 位',
    note: '3-way 驗證：引擎 vs 手算 vs iztro；核心欄位一致率 100%',
  },
  {
    label: '奇門 Windada 驗證',
    value: '20 組 + 365 天',
    note: 'v3.5 引擎局數一致率 100%，八門 97.2%',
  },
  {
    label: '基礎回歸測試',
    value: '161 項',
    note: '每次排盤引擎修改前後必跑，確保不破壞舊行為',
  },
  {
    label: '出門訣專項測試',
    value: '34 項',
    note: '涵蓋評分系統、品質閘門、詞彙清洗',
  },
  {
    label: '節氣時刻精度',
    value: '分鐘級',
    note: '紫金山天文台官方節氣時刻表（lunar_python 底層）',
  },
  {
    label: '行星位置精度',
    value: '弧秒級',
    note: 'Swiss Ephemeris DE431（NASA JPL 星曆表）',
  },
  {
    label: '姓名學筆畫庫',
    value: '102,998 字',
    note: 'Unicode Unihan 官方康熙筆畫資料',
  },
]
