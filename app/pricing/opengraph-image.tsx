// pricing 頁 OG — v5.6.10 R6 動態生成 1200x630
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = '方案與定價 · 鑒源 JianYuan'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// v5.7.8:8 方案完整 grid(原 4 方案 IA Agent P0、影響社群分享轉化)
const PLANS = [
  { name: '月度單盤', price: '$29', sub: '月家奇門古法' },
  { name: '心之所惑', price: '$39', sub: '聚焦你最在乎的問題' },
  { name: '事件擇吉', price: '$59', sub: '奇門遁甲 Top3 吉時' },
  { name: '合否？', price: '$59', sub: '雙人合盤關係解讀' },
  { name: '家族藍圖', price: '$59', sub: '家庭互動分析' },
  { name: '人生藍圖', price: '$89', sub: '十四套系統交叉分析' },
  { name: '月度精選', price: '$89', sub: '4 週 8 吉時補運' },
  { name: '年度全運', price: '$279', sub: '年盤 + 12 月盤' },
]

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0a0e1a 0%, #1a2a4a 50%, #0a0e1a 100%)',
          padding: '60px',
        }}
      >
        {/* 頂部品牌 */}
        <div
          style={{
            fontSize: 24,
            color: '#c9a84c',
            letterSpacing: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 30,
          }}
        >
          <span>JIANYUAN · 鑒源</span>
          <span style={{ fontSize: 18, opacity: 0.7 }}>jianyuan.life</span>
        </div>

        {/* 主標 */}
        <div
          style={{
            fontSize: 56,
            fontWeight: 700,
            color: '#f5f0e8',
            letterSpacing: 3,
            marginBottom: 12,
          }}
        >
          方案與定價
        </div>
        <div
          style={{
            fontSize: 22,
            color: 'rgba(245, 240, 232, 0.7)',
            marginBottom: 40,
          }}
        >
          個人 · 家庭 · 關係 · 出門訣四大類別、從 $29 起
        </div>

        {/* v5.7.8:8 卡片 4×2 grid(原 4 方案 IA P0 升級到 8 方案) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: 'repeat(2, 1fr)',
            gap: 12,
            flex: 1,
          }}
        >
          {PLANS.map((p) => (
            <div
              key={p.name}
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: 14,
                border: '1px solid rgba(201, 168, 76, 0.35)',
                borderRadius: 12,
                background: 'rgba(15, 22, 40, 0.5)',
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  color: '#f5f0e8',
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                {p.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'rgba(245, 240, 232, 0.6)',
                  marginBottom: 6,
                  lineHeight: 1.3,
                }}
              >
                {p.sub}
              </div>
              <div
                style={{
                  fontSize: 24,
                  color: '#c9a84c',
                  fontWeight: 700,
                  letterSpacing: 1,
                }}
              >
                {p.price}
              </div>
            </div>
          ))}
        </div>

        {/* 底部 trust */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 32,
            fontSize: 16,
            color: 'rgba(201, 168, 76, 0.8)',
            marginTop: 32,
          }}
        >
          <span>✓ 14 套系統交叉</span>
          <span>✓ 44,421+ 條古籍規則</span>
          <span>✓ 失敗自動重試</span>
          <span>✓ Stripe 加密付款</span>
        </div>
      </div>
    ),
    { ...size }
  )
}
