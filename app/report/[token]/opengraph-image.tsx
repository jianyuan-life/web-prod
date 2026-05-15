// ============================================================
// 報告頁 OG 分享圖 — 動態生成 1200x630 頂尖品牌圖片
// Next.js App Router 檔案慣例：自動綁定 og:image
// 設計理念：東方命理的深沉質感 × 現代品牌的精緻排版
// ============================================================

// v5.7.10:加中文字體注入(IA round 5 P0)
import { ImageResponse } from 'next/og'
import { PLAN_NAMES, isChumenjiPlan } from '@/lib/plan-names'
import { getOGFonts } from '@/lib/og-font'
import { createServiceClient } from '@/lib/supabase'  // T7b v5.10.371(Sprint 8 migration、memoized singleton)

export const runtime = 'edge'
export const alt = '鑒源命理分析報告'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'


const PLAN_DESCRIPTIONS: Record<string, string> = {
  C: '十四大命理系統 · 完整命格分析',
  D: '針對困惑 · 精準解答',
  G15: '家族命格互動 · 深度剖析',
  R: '雙人合盤 · 關係解讀',
  E1: '奇門遁甲 · 事件最佳時機',
  E2: '奇門遁甲 · 月度吉時吉方',
  E3: '奇門遁甲 · 月度精選 8 吉時',
  E4: '奇門遁甲 · 年度全運(年盤+12 月盤)',
}

// 每個方案的象徵符號（用東方美學元素）
const PLAN_SYMBOLS: Record<string, string> = {
  C: '命', D: '惑', G15: '族', R: '合', E1: '時', E2: '月', E3: '選', E4: '年',
}

export default async function OgImage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const fonts = await getOGFonts(700)

  // 去識別化：不再讀取 client_name，只用方案代碼渲染（P0 隱私強化 2026-04-19）
  let planCode = 'C'
  let systemsCount = 0

  try {
    const supabase = createServiceClient()

    // v5.10.283 soft delete filter:軟刪報告不再 render OG 圖
    const { data } = await supabase
      .from('paid_reports')
      .select('plan_code, report_result')
      .eq('access_token', token)
      .is('deleted_at', null)
      .single()

    if (data) {
      planCode = data.plan_code || 'C'
      const analyses = data.report_result?.analyses_summary as { score: number }[] | undefined
      if (analyses && analyses.length > 0) {
        systemsCount = analyses.length
      }
    }
  } catch {
    // 查詢失敗時使用預設值
  }

  const planName = PLAN_NAMES[planCode] || '命理分析'
  const planDesc = PLAN_DESCRIPTIONS[planCode] || '十四大命理系統精準分析'
  const planSymbol = PLAN_SYMBOLS[planCode] || '鑒'
  const isChumenji = isChumenjiPlan(planCode)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          overflow: 'hidden',
          // 多層漸層營造深沉星空感
          background: '#080d18',
        }}
      >
        {/* 背景漸層層 */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: 'radial-gradient(ellipse 80% 60% at 50% 40%, #0f1e3d 0%, #080d18 100%)',
          }}
        />

        {/* 右上金色光暈 */}
        <div
          style={{
            position: 'absolute',
            top: '-80px',
            right: '-40px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212,168,83,0.10) 0%, rgba(212,168,83,0.03) 40%, transparent 70%)',
            display: 'flex',
          }}
        />

        {/* 左下光暈 */}
        <div
          style={{
            position: 'absolute',
            bottom: '-120px',
            left: '-80px',
            width: '450px',
            height: '450px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(212,168,83,0.06) 0%, transparent 60%)',
            display: 'flex',
          }}
        />

        {/* 精緻邊框 — 外框 */}
        <div
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            right: '16px',
            bottom: '16px',
            border: '1px solid rgba(212,168,83,0.15)',
            borderRadius: '4px',
            display: 'flex',
          }}
        />

        {/* 精緻邊框 — 內框 */}
        <div
          style={{
            position: 'absolute',
            top: '24px',
            left: '24px',
            right: '24px',
            bottom: '24px',
            border: '1px solid rgba(212,168,83,0.08)',
            borderRadius: '2px',
            display: 'flex',
          }}
        />

        {/* 四角裝飾 — 左上 */}
        <div style={{ position: 'absolute', top: '12px', left: '12px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ width: '32px', height: '1px', background: 'rgba(212,168,83,0.4)', display: 'flex' }} />
          <div style={{ width: '1px', height: '32px', background: 'rgba(212,168,83,0.4)', display: 'flex' }} />
        </div>

        {/* 四角裝飾 — 右上 */}
        <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ width: '32px', height: '1px', background: 'rgba(212,168,83,0.4)', display: 'flex' }} />
          <div style={{ width: '1px', height: '32px', background: 'rgba(212,168,83,0.4)', display: 'flex', alignSelf: 'flex-end' }} />
        </div>

        {/* 四角裝飾 — 左下 */}
        <div style={{ position: 'absolute', bottom: '12px', left: '12px', display: 'flex', flexDirection: 'column-reverse' }}>
          <div style={{ width: '32px', height: '1px', background: 'rgba(212,168,83,0.4)', display: 'flex' }} />
          <div style={{ width: '1px', height: '32px', background: 'rgba(212,168,83,0.4)', display: 'flex' }} />
        </div>

        {/* 四角裝飾 — 右下 */}
        <div style={{ position: 'absolute', bottom: '12px', right: '12px', display: 'flex', flexDirection: 'column-reverse', alignItems: 'flex-end' }}>
          <div style={{ width: '32px', height: '1px', background: 'rgba(212,168,83,0.4)', display: 'flex' }} />
          <div style={{ width: '1px', height: '32px', background: 'rgba(212,168,83,0.4)', display: 'flex', alignSelf: 'flex-end' }} />
        </div>

        {/* 主內容區 — 左右分割佈局 */}
        <div
          style={{
            position: 'absolute',
            inset: '40px',
            display: 'flex',
            flexDirection: 'row',
          }}
        >
          {/* 左側 — 象徵符號大字 + 裝飾 */}
          <div
            style={{
              width: '280px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRight: '1px solid rgba(212,168,83,0.1)',
              paddingRight: '40px',
            }}
          >
            {/* 方案象徵大字 */}
            <div
              style={{
                fontSize: '120px',
                fontWeight: 300,
                color: 'rgba(212,168,83,0.12)',
                lineHeight: 1,
                display: 'flex',
              }}
            >
              {planSymbol}
            </div>

            {/* 象徵字下方的金色小點 */}
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#d4a853',
                marginTop: '20px',
                display: 'flex',
              }}
            />

            {/* 系統數量標記（僅非出門訣） */}
            {!isChumenji && systemsCount > 0 && (
              <div
                style={{
                  marginTop: '16px',
                  fontSize: '13px',
                  color: 'rgba(212,168,83,0.4)',
                  letterSpacing: '0.15em',
                  display: 'flex',
                }}
              >
                {systemsCount} 系統分析
              </div>
            )}
          </div>

          {/* 右側 — 主要文字內容 */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              paddingLeft: '48px',
            }}
          >
            {/* 品牌名 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '8px',
              }}
            >
              <div
                style={{
                  fontSize: '16px',
                  color: '#d4a853',
                  letterSpacing: '0.2em',
                  fontWeight: 500,
                  display: 'flex',
                }}
              >
                鑒源命理
              </div>
              <div
                style={{
                  width: '40px',
                  height: '1px',
                  background: 'rgba(212,168,83,0.3)',
                  display: 'flex',
                }}
              />
              <div
                style={{
                  fontSize: '12px',
                  color: 'rgba(212,168,83,0.4)',
                  letterSpacing: '0.15em',
                  display: 'flex',
                }}
              >
                JIANYUAN
              </div>
            </div>

            {/* 方案名稱（主標題） */}
            <div
              style={{
                fontSize: '64px',
                fontWeight: 700,
                color: '#ffffff',
                letterSpacing: '0.06em',
                lineHeight: 1.15,
                marginBottom: '12px',
                display: 'flex',
              }}
            >
              {planName}
            </div>

            {/* 金色分隔線 */}
            <div
              style={{
                width: '80px',
                height: '2px',
                background: 'linear-gradient(90deg, #d4a853, rgba(212,168,83,0.2))',
                marginBottom: '16px',
                display: 'flex',
              }}
            />

            {/* 方案描述 */}
            <div
              style={{
                fontSize: '20px',
                color: 'rgba(255,255,255,0.55)',
                letterSpacing: '0.08em',
                marginBottom: '32px',
                display: 'flex',
              }}
            >
              {planDesc}
            </div>

            {/* 私密報告標示卡（去識別化：不顯示客戶姓名，僅顯示「專屬私密報告」）*/}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 24px',
                borderRadius: '8px',
                background: 'rgba(212,168,83,0.06)',
                border: '1px solid rgba(212,168,83,0.12)',
              }}
            >
              <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.4)', display: 'flex' }}>
                客戶專屬
              </div>
              <div style={{ fontSize: '20px', color: '#d4a853', fontWeight: 600, display: 'flex' }}>
                私密命理分析報告
              </div>
            </div>
          </div>
        </div>

        {/* 底部資訊列 */}
        <div
          style={{
            position: 'absolute',
            bottom: '28px',
            left: '48px',
            right: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              fontSize: '13px',
              color: 'rgba(212,168,83,0.35)',
              letterSpacing: '0.12em',
              display: 'flex',
            }}
          >
            jianyuan.life
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'rgba(255,255,255,0.2)',
              letterSpacing: '0.08em',
              display: 'flex',
            }}
          >
            東西方十四大命理系統整合分析
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      ...(fonts ? { fonts } : {}),
    },
  )
}
