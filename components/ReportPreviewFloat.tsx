// Hero 漂浮報告預覽卡(v5.10.426、UI 100 分 P0 — 產品前置化)
// 競品對標(tasks/ui_visual_benchmark_2026-06-12.md):The Pattern/Nebula 都在首屏 show 報告片段、
//   讓訪客「付費前感受報告深度」。鑑源原 hero 純文字無預覽 = 2025 已落後。
// 設計:hero 四角漂浮的半透明報告節選卡、像在星空中飄浮的命理碎片。md+ 才顯(手機不擠)。
//   reduced-motion 由 globals.css .animate-float 自動停。
const FRAGMENTS = [
  { sys: '八字命理', line: '日主庚金生於巳月，財官印俱全，宜借勢而非硬拼。', pos: 'top-[14%] left-[3%]', delay: '0s' },
  { sys: '紫微斗數', line: '命宮天府坐守，一生不缺貴人，但需學會開口求援。', pos: 'top-[22%] right-[3%]', delay: '0.8s' },
  { sys: '奇門遁甲', line: '今年值符落離宮，東南方為你的能量出口。', pos: 'bottom-[18%] left-[5%]', delay: '1.6s' },
  { sys: '西洋占星', line: '土星正過你的事業宮，一場遲來的肯定正在路上。', pos: 'bottom-[24%] right-[4%]', delay: '0.4s' },
]

export default function ReportPreviewFloat() {
  return (
    <div className="absolute inset-0 z-0 pointer-events-none hidden md:block" aria-hidden>
      {FRAGMENTS.map((f, i) => (
        <div
          key={i}
          className={`absolute ${f.pos} w-[244px] animate-float`}
          style={{ animationDelay: f.delay }}
        >
          <div className="report-float-card rounded-2xl p-4 backdrop-blur-md">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--color-gold)' }} />
              <span className="report-float-sys text-[11px] tracking-[0.18em]" style={{ fontFamily: 'var(--font-body)' }}>
                {f.sys}
              </span>
            </div>
            <p className="report-float-line text-[12.5px] leading-[1.7]">
              {f.line}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
