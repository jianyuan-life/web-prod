// 首頁 OG 分享圖 — v5.6.10 R6 動態生成 1200x630
// 對應 Codex P1「OG image 缺、社群分享無預覽」5 家共識
import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = '鑒源 JianYuan — 十四大命理系統精準分析'
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
          position: 'relative',
        }}
      >
        {/* 金色裝飾線 */}
        <div
          style={{
            position: 'absolute',
            top: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 300,
            height: 1,
            background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 80,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 300,
            height: 1,
            background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)',
          }}
        />

        {/* 主內容置中 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 60px',
          }}
        >
          {/* 品牌名 */}
          <div
            style={{
              fontSize: 28,
              color: '#c9a84c',
              letterSpacing: 12,
              marginBottom: 30,
              fontWeight: 300,
            }}
          >
            JIANYUAN · 鑒源
          </div>

          {/* 主標 */}
          <div
            style={{
              fontSize: 80,
              fontWeight: 700,
              color: '#f5f0e8',
              letterSpacing: 4,
              lineHeight: 1.2,
              textAlign: 'center',
              marginBottom: 32,
            }}
          >
            回到源頭、看清本質
          </div>

          {/* 副標 */}
          <div
            style={{
              fontSize: 32,
              color: '#c9a84c',
              opacity: 0.9,
              letterSpacing: 6,
              marginBottom: 40,
            }}
          >
            十四大命理系統 · 整合深度分析
          </div>

          {/* 4 大保證 chips */}
          <div
            style={{
              display: 'flex',
              gap: 28,
              fontSize: 22,
              color: 'rgba(245, 240, 232, 0.85)',
            }}
          >
            <div
              style={{
                padding: '10px 24px',
                border: '1px solid rgba(201, 168, 76, 0.4)',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              44,421+ 條古籍規則
            </div>
            <div
              style={{
                padding: '10px 24px',
                border: '1px solid rgba(201, 168, 76, 0.4)',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              7 天無條件退費
            </div>
            <div
              style={{
                padding: '10px 24px',
                border: '1px solid rgba(201, 168, 76, 0.4)',
                borderRadius: 999,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              從 $39 起
            </div>
          </div>
        </div>

        {/* 底部 url */}
        <div
          style={{
            position: 'absolute',
            bottom: 30,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 18,
            color: 'rgba(201, 168, 76, 0.7)',
            letterSpacing: 4,
          }}
        >
          jianyuan.life
        </div>
      </div>
    ),
    { ...size }
  )
}
