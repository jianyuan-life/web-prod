'use client'

interface SubscribeCTAProps {
  clientName?: string
}

/**
 * 合篇末尾的月費訂閱 CTA — 將 $89 一次性客戶轉為月費會員
 */
export default function SubscribeCTA({ clientName }: SubscribeCTAProps) {
  return (
    <>
      {/* v5.3.25：軟著陸過渡句（DeepSeek 建議）讓 CTA 不突兀 */}
      <div className="mt-8 mb-2 px-2 text-center">
        <p
          className="text-sm sm:text-base leading-7 italic"
          style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-sans)' }}
        >
          這些練習和方向，需要每個月能量的校準來持續落地——
        </p>
      </div>
      <div
        className="mb-8 rounded-2xl p-6 sm:p-8"
        style={{
          background:
            'linear-gradient(135deg, rgba(201,168,76,0.18), rgba(26,42,74,0.35)), radial-gradient(circle at top right, rgba(201,168,76,0.25), transparent 60%)',
          border: '1px solid rgba(201,168,76,0.35)',
          boxShadow: '0 8px 32px rgba(201,168,76,0.12)',
        }}
      >
      <div className="flex items-center gap-2 mb-3">
        <span style={{ fontSize: '1.2rem' }}>🌙</span>
        <span className="text-[11px] tracking-[3px]" style={{ color: 'rgba(201,168,76,0.8)' }}>
          下一步，走出去實踐
        </span>
      </div>

      <h3 className="text-xl sm:text-2xl font-semibold mb-3" style={{ color: '#e6d89a', letterSpacing: '0.02em' }}>
        {clientName ? `${clientName}，` : ''}
        命盤只是地圖——地圖不會自己走
      </h3>

      <p className="text-sm sm:text-base leading-7 mb-5" style={{ color: 'rgba(255,255,255,0.8)' }}>
        你每個月的出行能量都在變——這個月西方能量弱了、東南方即將旺起、下個月又會重新洗牌。
      </p>

      <p className="text-sm sm:text-base leading-7 mb-5" style={{ color: 'rgba(255,255,255,0.9)' }}>
        <strong style={{ color: '#e6d89a' }}>「月度出門訣會員」</strong>
        每月為你重新排一份當月吉時地圖，陪你走對方向、做對決定。做滿 3 個月以上，會感覺做事更順、貴人更常出現、卡住的事會自己鬆動——這不是一次的魔法，是長期的能量維護。
      </p>

      {/* v5.3.25：「下個月能量預覽」鉤子（DeepSeek 建議 95+ 的關鍵）讓訂閱價值可感知 */}
      <div
        className="mb-6 p-4 rounded-xl"
        style={{
          background: 'rgba(10,14,26,0.4)',
          border: '1px dashed rgba(201,168,76,0.3)',
        }}
      >
        <div className="text-[10px] mb-2" style={{ color: 'rgba(201,168,76,0.7)', letterSpacing: '2px' }}>
          📅 下個月你會收到
        </div>
        <div className="flex flex-wrap gap-2">
          {['5 月份 4 週吉時地圖', '每週方位指南', '建議穿著顏色', '避開的忌方忌日', '能量校準練習'].map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs"
              style={{
                background: 'rgba(201,168,76,0.08)',
                border: '1px solid rgba(201,168,76,0.2)',
                color: 'rgba(230,216,154,0.9)',
              }}
            >
              <span style={{ color: 'rgba(201,168,76,0.6)' }}>✓</span>
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <a
          href="/pricing?scroll=subscribe"
          className="inline-flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold transition-all hover:scale-105 shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #c9a84c 0%, #e8c87a 50%, #f7dfa0 100%)',
            color: '#0a0e1a',
            boxShadow: '0 4px 14px rgba(201,168,76,0.45)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2 L15 8 L22 9 L17 14 L18 21 L12 18 L6 21 L7 14 L2 9 L9 8 Z" />
          </svg>
          加入月度出門訣會員
        </a>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          每月自動推送新盤 · 隨時可取消
        </span>
      </div>
      </div>
    </>
  )
}
