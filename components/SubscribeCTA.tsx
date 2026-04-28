'use client'

interface SubscribeCTAProps {
  clientName?: string
}

/**
 * 合篇末尾的出門訣導流 CTA — 一次性購買，不是月費訂閱
 * 產品：E1 事件擇吉 $59（單次事件 Top3 吉時）／E2 月度單盤 $29（月家奇門古法、單月 1 盤、農曆晦日 22:20 執行）
 */
export default function SubscribeCTA({ clientName }: SubscribeCTAProps) {
  return (
    <>
      {/* 軟著陸過渡句讓 CTA 不突兀 */}
      <div className="mt-8 mb-2 px-2 text-center">
        <p
          className="text-sm sm:text-base leading-7 italic"
          style={{ color: 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-sans)' }}
        >
          命盤告訴你「你是誰」——下一步，你需要知道「何時該往哪走」。
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
        <span style={{ fontSize: '1.2rem' }}>☀</span>
        <span className="text-[11px] tracking-[3px]" style={{ color: 'rgba(201,168,76,0.8)' }}>
          下一步，走出去實踐
        </span>
      </div>

      <h3 className="text-xl sm:text-2xl font-semibold mb-3" style={{ color: '#e6d89a', letterSpacing: '0.02em' }}>
        {clientName ? `${clientName}，` : ''}
        命盤只是地圖——地圖不會自己走
      </h3>

      <p className="text-sm sm:text-base leading-7 mb-5" style={{ color: 'rgba(255,255,255,0.8)' }}>
        出行能量是會流動的——這個月西方能量弱了、東南方即將旺起，不同的事件要走不同的方向、不同的時辰。命盤解決「你是誰」，<strong style={{ color: '#e6d89a' }}>出門訣</strong>解決「你現在該怎麼走」。
      </p>

      <p className="text-sm sm:text-base leading-7 mb-5" style={{ color: 'rgba(255,255,255,0.9)' }}>
        源自《煙波釣叟歌》的千年擇吉術，以 25 層評分體系精算每個時辰、每個方位的能量，再套入你的個人年命宮驗證——<strong style={{ color: '#e6d89a' }}>在推薦吉時出門、朝吉方走 500 公尺、到達後靜坐 40 分鐘接氣</strong>，讓環境能量為你所用。
      </p>

      {/* 產品選項預覽 */}
      <div
        className="mb-6 p-4 rounded-xl"
        style={{
          background: 'rgba(10,14,26,0.4)',
          border: '1px dashed rgba(201,168,76,0.3)',
        }}
      >
        <div className="text-[10px] mb-3" style={{ color: 'rgba(201,168,76,0.7)', letterSpacing: '2px' }}>
          📅 出門訣兩種選擇
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div
            className="flex-1 p-3 rounded-lg"
            style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)' }}
          >
            <div className="text-sm font-semibold mb-1" style={{ color: '#e6d89a' }}>
              事件擇吉 · $59
            </div>
            <div className="text-xs leading-6" style={{ color: 'rgba(255,255,255,0.75)' }}>
              為你某一件重要事件（求職／簽約／談判／告白／考試等）精算 Top 3 吉時 + 吉方
            </div>
          </div>

          <div
            className="flex-1 p-3 rounded-lg"
            style={{ background: 'rgba(201,168,76,0.08)', border: '1px solid rgba(201,168,76,0.2)' }}
          >
            <div className="text-sm font-semibold mb-1" style={{ color: '#e6d89a' }}>
              月度單盤 · $29
            </div>
            <div className="text-xs leading-6" style={{ color: 'rgba(255,255,255,0.75)' }}>
              月家奇門古法精算當月主吉時 + 主吉方（農曆晦日 22:20–23:00 執行 · 跨子時接新月氣）
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <a
          href="/pricing"
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
          了解出門訣方案
        </a>
        <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
          單次購買 · 不自動續訂
        </span>
      </div>
      </div>
    </>
  )
}
