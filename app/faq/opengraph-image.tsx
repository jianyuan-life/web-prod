// /faq OG — v5.6.10 R6
// v5.7.10:加中文字體注入(IA round 5 P0)
import { ImageResponse } from 'next/og'
import { getOGFonts } from '@/lib/og-font'

export const runtime = 'edge'
export const alt = '常見問題 FAQ · 鑒源 JianYuan'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  const fonts = await getOGFonts(700)
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
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <div style={{ fontSize: 22, color: '#c9a84c', letterSpacing: 10, marginBottom: 12 }}>
          FAQ
        </div>
        <div
          style={{
            fontSize: 80,
            fontWeight: 700,
            color: '#f5f0e8',
            letterSpacing: 4,
            marginBottom: 32,
          }}
        >
          常見問題
        </div>
        <div
          style={{
            display: 'flex',
            gap: 24,
            fontSize: 22,
            color: 'rgba(245, 240, 232, 0.85)',
            flexWrap: 'wrap',
            justifyContent: 'center',
            maxWidth: 1000,
          }}
        >
          {['報告品質', '付款 & 服務保證', '隱私 & 資料', '報告生成', '出門訣專屬', '其他'].map((tag) => (
            <div
              key={tag}
              style={{
                padding: '12px 28px',
                border: '1px solid rgba(201, 168, 76, 0.4)',
                borderRadius: 999,
                background: 'rgba(15, 22, 40, 0.4)',
              }}
            >
              {tag}
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 30,
            fontSize: 16,
            color: 'rgba(201, 168, 76, 0.7)',
            letterSpacing: 4,
          }}
        >
          jianyuan.life/faq
        </div>
      </div>
    ),
    { ...size, ...(fonts ? { fonts } : {}) }
  )
}
