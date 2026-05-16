// ============================================================
// 提示詞合集 Prompt 3 任務 A — 4 大保證 icon 區塊
// ============================================================
// Pricing 頁信任強化。4 保證對齊根 CLAUDE.md「退費 policy(v5.7.8)」SSOT。
// 鑑源黑 #0A0A0A 底 + 朱漆紅 #B33A2E accent;< 380px 自動 stack。
//
// additive 元件,由 app/pricing/page.tsx 或 PricingCards 自行 import。
// 本檔不自動 wire(避免動既有 pricing 渲染 = P1 需驗證)。

const GUARANTEES = [
  { icon: '↻', title: '失敗自動補', desc: '重試 3 次 + 真人 24h 接手,不多扣款' },
  { icon: '✎', title: '錯誤免費重生', desc: '出生資料解讀錯,免費重生成不再扣款' },
  { icon: '⇄', title: '重複扣款全退', desc: '系統重複扣款,無條件退回多扣金額' },
  { icon: '⛨', title: '盜刷可申訴', desc: '未授權扣款,憑 Stripe 紀錄申訴退回' },
]

export default function GuaranteeBlock() {
  return (
    <section
      aria-label="購買保證"
      style={{ background: '#0A0A0A', borderRadius: 14, padding: '28px 20px', margin: '32px 0' }}
    >
      <h2
        style={{
          color: '#fff',
          fontSize: 22,
          fontWeight: 800,
          textAlign: 'center',
          margin: '0 0 22px',
          letterSpacing: 1,
        }}
      >
        鑑源 4 大保證
      </h2>
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        {GUARANTEES.map((g) => (
          <div
            key={g.title}
            style={{
              background: '#161616',
              border: '1px solid #2a2a2a',
              borderRadius: 10,
              padding: '18px 16px',
              textAlign: 'center',
            }}
          >
            <div
              aria-hidden
              style={{
                fontSize: 28,
                color: '#B33A2E',
                width: 48,
                height: 48,
                lineHeight: '48px',
                margin: '0 auto 10px',
                border: '2px solid #B33A2E',
                borderRadius: '50%',
              }}
            >
              {g.icon}
            </div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
              {g.title}
            </div>
            <div style={{ color: '#aaa', fontSize: 13, lineHeight: 1.6 }}>{g.desc}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
