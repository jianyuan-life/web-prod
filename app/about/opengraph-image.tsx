// /about OG — v5.6.10 R6
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = '關於鑒源 · 為什麼有這個平台'
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
          padding: '60px 80px',
          justifyContent: 'center',
        }}
      >
        <div style={{ fontSize: 22, color: '#c9a84c', letterSpacing: 8, marginBottom: 12 }}>
          ABOUT JIANYUAN
        </div>
        <div
          style={{
            fontSize: 92,
            fontWeight: 700,
            color: '#f5f0e8',
            letterSpacing: 6,
            lineHeight: 1.1,
            marginBottom: 28,
          }}
        >
          回到源頭<br />看清本質
        </div>
        <div
          style={{
            fontSize: 26,
            color: 'rgba(245, 240, 232, 0.7)',
            lineHeight: 1.6,
            maxWidth: 900,
          }}
        >
          一位金融從業者、找過 6 位老師花費 3 萬多元驗證、<br />
          自學十多本姓名學專著研究六大門派的故事。
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
          jianyuan.life/about
        </div>
      </div>
    ),
    { ...size }
  )
}
