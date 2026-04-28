// v5.6.10 R7:IG 分享圖卡(1080x1080)動態生成
// 對應 Gemini「社交貨幣化」共識(Co-Star / 16P 必有)
// 用法:GET /api/share-card?token=<report-token>

import { ImageResponse } from 'next/og'
import { createClient } from '@supabase/supabase-js'
import { loadChineseFont } from '@/lib/og-font'
import { PLAN_NAMES } from '@/lib/plan-names'

export const runtime = 'edge'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  )
}

const PLAN_HOOK: Record<string, string> = {
  C: '十四套命理系統交叉、看清真實的我',
  D: '一個問題、一個答案',
  G15: '看見家人之間的能量',
  R: '我們在命理上、合不合?',
  E1: '在對的時間、走向對的方位',
  E2: '當月補運主吉方',
  E3: '4 週 8 個吉時、整月持續補運',
  E4: '全年擇吉、立春前限時',
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token')

  let planCode = 'C'
  let clientName = '我的命格'
  let topSystem = ''
  let topScore: number | null = null
  let avgScore: number | null = null

  if (token) {
    try {
      const supabase = getServiceSupabase()
      const { data } = await supabase
        .from('paid_reports')
        .select('plan_code, client_name, report_result')
        .eq('access_token', token)
        .maybeSingle()

      if (data) {
        planCode = (data.plan_code || 'C').toString()
        clientName = (data.client_name || '我的命格').toString().slice(0, 12)
        const summary = (data.report_result as { analyses_summary?: { system: string; score: number }[] } | null)?.analyses_summary
        if (Array.isArray(summary) && summary.length > 0) {
          const filtered = summary.filter((s) => s && s.system && !['南洋術數', '南洋数术'].includes(s.system))
          if (filtered.length > 0) {
            const peak = filtered.reduce((m, d) => (d.score > m.score ? d : m), filtered[0])
            topSystem = peak.system
            topScore = peak.score
            avgScore = Math.round(filtered.reduce((s, d) => s + d.score, 0) / filtered.length)
          }
        }
      }
    } catch {
      /* fallthrough、用預設值 */
    }
  }

  const planName = PLAN_NAMES[planCode] || '命理分析'
  const hook = PLAN_HOOK[planCode] || '回到源頭、看清本質'

  // v5.7.1:fetch 中文字體
  const cnFont = await loadChineseFont()

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1080,
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0a0e1a 0%, #1a2a4a 50%, #0a0e1a 100%)',
          padding: 80,
          position: 'relative',
        }}
      >
        {/* 頂部金色橫線 */}
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 600,
            height: 1,
            background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 600,
            height: 1,
            background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)',
          }}
        />

        {/* 品牌 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            fontSize: 32,
            color: '#c9a84c',
            letterSpacing: 14,
            marginBottom: 60,
            marginTop: 20,
          }}
        >
          鑒源 · JIANYUAN
        </div>

        {/* 主內容 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          {/* 方案 chip */}
          <div
            style={{
              fontSize: 26,
              color: '#c9a84c',
              padding: '14px 36px',
              border: '1px solid rgba(201, 168, 76, 0.5)',
              borderRadius: 999,
              marginBottom: 50,
              letterSpacing: 4,
            }}
          >
            {planName}
          </div>

          {/* 客戶名 */}
          <div
            style={{
              fontSize: 110,
              fontWeight: 700,
              color: '#f5f0e8',
              letterSpacing: 8,
              marginBottom: 30,
              fontFamily: 'NotoTC, serif',
            }}
          >
            {clientName}
          </div>

          {/* hook 副標 */}
          <div
            style={{
              fontSize: 36,
              color: 'rgba(245, 240, 232, 0.85)',
              letterSpacing: 4,
              marginBottom: 60,
              maxWidth: 800,
              lineHeight: 1.4,
            }}
          >
            {hook}
          </div>

          {/* 數據 box(若有)*/}
          {topSystem && topScore !== null && (
            <div
              style={{
                display: 'flex',
                gap: 40,
                fontSize: 24,
                color: 'rgba(245, 240, 232, 0.9)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '20px 36px',
                  border: '1px solid rgba(201, 168, 76, 0.3)',
                  borderRadius: 16,
                  background: 'rgba(15, 22, 40, 0.5)',
                }}
              >
                <div style={{ fontSize: 20, color: '#c9a84c', marginBottom: 8 }}>最強系統</div>
                <div style={{ fontSize: 36, fontWeight: 700 }}>{topSystem}</div>
                <div style={{ fontSize: 22, color: '#c9a84c' }}>{topScore} 分</div>
              </div>
              {avgScore !== null && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '20px 36px',
                    border: '1px solid rgba(201, 168, 76, 0.3)',
                    borderRadius: 16,
                    background: 'rgba(15, 22, 40, 0.5)',
                  }}
                >
                  <div style={{ fontSize: 20, color: '#c9a84c', marginBottom: 8 }}>整體平均</div>
                  <div style={{ fontSize: 36, fontWeight: 700 }}>{avgScore}</div>
                  <div style={{ fontSize: 22, color: '#c9a84c' }}>滿分 100</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部 url + tagline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            marginBottom: 20,
          }}
        >
          <div style={{ fontSize: 22, color: 'rgba(201, 168, 76, 0.8)', letterSpacing: 6 }}>
            jianyuan.life
          </div>
          <div style={{ fontSize: 16, color: 'rgba(245, 240, 232, 0.5)', letterSpacing: 8 }}>
            十四套命理系統交叉分析
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
      ...(cnFont ? { fonts: [{ name: 'NotoTC', data: cnFont, style: 'normal' as const, weight: 700 as const }] } : {}),
    }
  )
}
