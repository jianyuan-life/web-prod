// 星盤 SVG 主視覺(外環天干地支慢轉 + 內環八卦反轉 + 太極發光中心)
// v5.10.425 hero 視覺升級:加輝光濾鏡 + 星雲漸層背景 + 透明度提升、暗/暖白雙主題都 luminous。
//   原版全透明度 0.12-0.3 過淡(暖白幾乎隱形)、為「首屏平淡」主因。
//   reduced-motion 由 globals.css 既有 .animate-spin-slow/reverse 媒體查詢自動停轉。
export default function Astrolabe() {
  return (
    <div
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[640px] pointer-events-none max-md:w-[min(380px,92vw)] max-md:h-[min(380px,92vw)]"
      aria-hidden
    >
      {/* 星雲輝光背景 — 給星盤景深與「能量場」感(暗:金紫暈;暖白:柔金暈) */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at center, color-mix(in srgb, var(--color-gold) 14%, transparent) 0%, color-mix(in srgb, var(--color-purple-accent, #8b5cf6) 6%, transparent) 38%, transparent 70%)',
          filter: 'blur(8px)',
        }}
      />

      {/* 外環 — 天干地支(慢轉) */}
      <svg
        className="absolute inset-0 w-full h-full animate-spin-slow"
        viewBox="0 0 580 580"
        style={{ animationDuration: '120s' }}
      >
        <defs>
          <filter id="astro-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter="url(#astro-glow)">
          <circle cx="290" cy="290" r="270" fill="none" stroke="rgba(201,168,76,0.42)" strokeWidth="1.5" />
          <circle cx="290" cy="290" r="260" fill="none" stroke="rgba(201,168,76,0.28)" strokeWidth="0.9" strokeDasharray="4 8" />
          {/* 12 宮位分割線 */}
          <g stroke="rgba(201,168,76,0.32)" strokeWidth="0.9">
            <line x1="290" y1="20" x2="290" y2="60" />
            <line x1="425" y1="55" x2="405" y2="85" />
            <line x1="525" y1="155" x2="495" y2="175" />
            <line x1="560" y1="290" x2="520" y2="290" />
            <line x1="525" y1="425" x2="495" y2="405" />
            <line x1="425" y1="525" x2="405" y2="495" />
            <line x1="290" y1="560" x2="290" y2="520" />
            <line x1="155" y1="525" x2="175" y2="495" />
            <line x1="55" y1="425" x2="85" y2="405" />
            <line x1="20" y1="290" x2="60" y2="290" />
            <line x1="55" y1="155" x2="85" y2="175" />
            <line x1="155" y1="55" x2="175" y2="85" />
          </g>
          {/* 天干地支符號 */}
          <g fill="rgba(224,192,104,0.62)" fontFamily="Noto Serif TC, serif" fontSize="14">
            <text x="290" y="48" textAnchor="middle">甲</text>
            <text x="430" y="78" textAnchor="middle">乙</text>
            <text x="530" y="178" textAnchor="middle">丙</text>
            <text x="550" y="296" textAnchor="middle">丁</text>
            <text x="518" y="430" textAnchor="middle">戊</text>
            <text x="418" y="535" textAnchor="middle">己</text>
            <text x="290" y="558" textAnchor="middle">庚</text>
            <text x="162" y="535" textAnchor="middle">辛</text>
            <text x="50" y="430" textAnchor="middle">壬</text>
            <text x="30" y="296" textAnchor="middle">癸</text>
            <text x="62" y="178" textAnchor="middle">子</text>
            <text x="160" y="78" textAnchor="middle">丑</text>
          </g>
        </g>
      </svg>

      {/* 內環 — 八卦 + 太極(反轉) */}
      <svg
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[65.5%] h-[65.5%] animate-spin-reverse"
        viewBox="0 0 380 380"
        style={{ animationDuration: '90s' }}
      >
        <g filter="url(#astro-glow)">
          <circle cx="190" cy="190" r="170" fill="none" stroke="rgba(201,168,76,0.44)" strokeWidth="1.5" />
          <circle cx="190" cy="190" r="120" fill="none" stroke="rgba(201,168,76,0.32)" strokeWidth="0.9" />
          {/* 八卦 */}
          <g fill="rgba(224,192,104,0.68)" fontFamily="Noto Serif TC, serif" fontSize="18">
            <text x="190" y="38" textAnchor="middle">&#9776;</text>
            <text x="320" y="100" textAnchor="middle">&#9777;</text>
            <text x="355" y="196" textAnchor="middle">&#9778;</text>
            <text x="315" y="300" textAnchor="middle">&#9779;</text>
            <text x="190" y="355" textAnchor="middle">&#9780;</text>
            <text x="65" y="300" textAnchor="middle">&#9781;</text>
            <text x="25" y="196" textAnchor="middle">&#9782;</text>
            <text x="60" y="100" textAnchor="middle">&#9783;</text>
          </g>
          {/* 太極 — 發光中心 */}
          <circle cx="190" cy="190" r="32" fill="none" stroke="rgba(201,168,76,0.5)" strokeWidth="1.6" />
          <path d="M190,158 A32,32 0 0 1 190,222 A16,16 0 0 0 190,190 A16,16 0 0 1 190,158Z" fill="rgba(201,168,76,0.32)" />
          <circle cx="190" cy="174" r="4.5" fill="rgba(224,192,104,0.7)" />
          <circle cx="190" cy="206" r="4.5" fill="rgba(10,14,26,0.6)" stroke="rgba(201,168,76,0.4)" strokeWidth="0.9" />
        </g>
      </svg>
    </div>
  )
}
