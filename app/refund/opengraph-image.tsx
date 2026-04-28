// /refund OG — v5.6.10 R6
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = '退費政策 · 鑒源 JianYuan'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

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
          padding: '70px',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 22, color: '#c9a84c', letterSpacing: 8, marginBottom: 12 }}>
          REFUND POLICY · 鑒源
        </div>
        <div
          style={{
            fontSize: 76,
            fontWeight: 700,
            color: '#f5f0e8',
            letterSpacing: 4,
            marginBottom: 40,
          }}
        >
          7 天無條件退費承諾
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            fontSize: 26,
            color: 'rgba(245, 240, 232, 0.88)',
          }}
        >
          <div>① 收到報告 7 天內、不滿意全額退款、不需理由</div>
          <div>② 系統重試 3 次仍生成失敗、24 小時內全額退款</div>
          <div>③ 技術問題重複扣款、無條件全額退款</div>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 30,
            right: 60,
            fontSize: 16,
            color: 'rgba(201, 168, 76, 0.7)',
            letterSpacing: 4,
          }}
        >
          jianyuan.life/refund
        </div>
      </div>
    ),
    { ...size }
  )
}
