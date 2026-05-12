// v5.6.10 R4:關於我們獨立頁(IA Agent P0「nav 缺信任建立頁」+ SEO long-tail)
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: '關於鑒源 · 為什麼有這個平台',
  description: '鑒源 JianYuan 創辦人 Jamie 的故事:從金融從業者、找過 6 位老師花費 3 萬多元驗證、到自學十多本姓名學專著研究六大門派。鑒源的使命:回到源頭、看清本質、把選擇的權力交還給你。',
  alternates: { canonical: 'https://jianyuan.life/about' },
}

export default function AboutPage() {
  return (
    <div className="py-20">
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 text-center mb-16">
        <div className="text-xs tracking-[0.3em] text-gold/60 mb-4">ABOUT JIANYUAN</div>
        {/* v5.10.193 P0 mobile responsive(Playwright audit:預防性、加 text-balance + 確保 sm 斷點) */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4 text-gradient-gold text-balance break-words" style={{ fontFamily: 'var(--font-sans)' }}>
          回到源頭、看清本質
        </h1>
        <p className="text-text-muted text-base leading-relaxed">
          鑒源命理平台不只是 14 套系統與 44,421+ 條規則——
          <br className="hidden md:block" />
          它是一個邏輯派金融從業者、自己尋找答案的故事。
        </p>
      </section>

      {/* 創辦人故事 — 主軸 */}
      <section className="max-w-3xl mx-auto px-6 mb-20">
        <div className="divider-ornament text-gold/30 mb-6 justify-center">
          <span className="text-xs tracking-[0.2em]">創辦人的話</span>
        </div>

        <div className="glass rounded-2xl p-8 md:p-12">
          <div className="text-gold/60 text-4xl mb-4" style={{ fontFamily: 'var(--font-sans)' }}>&ldquo;</div>

          <div className="space-y-5 text-base text-text leading-[2]">
            <p>
              我是個極度重視邏輯與數據的人。<br />
              身為金融從業者、我做的每一個決定、都需要依據、推理、以及完整的分析。
            </p>
            <p>
              所以、如果有一天我告訴你——命理改變了我的人生軌跡、<br />
              請相信、那不會是一句沒有根據的玄學。
            </p>
            <p>
              30 歲之前、我改過三次名字。<br />
              前兩次、並不是我能選擇的;直到第三次、我決定把人生的方向、握在自己手裡。
            </p>
            <p>
              改名不是一件簡單的事。從證件、銀行到所有資料、每一個細節都必須重新調整。
              也因此、我格外謹慎——找了<strong className="text-cream">六位命理老師</strong>、
              花了將近<strong className="text-cream">三萬多元</strong>、只為了做一件事:<strong className="text-gold">驗證</strong>。
            </p>
            <p>但結果、卻讓我開始動搖。</p>
            <p>
              每一位老師、都能把名字說得頭頭是道。
              上一位說「很好」、下一位卻說「不行」。標準不一致、答案也沒有終點。
              那一刻我才明白——這些建議的核心、從來不是「適不適合你」、
              而是「讓你再花一次錢」。
            </p>
            <p>
              從台幣 3,600 到 8,000、我都試過。<br />
              最終、我沒有採用任何一位老師的方案。<br />
              因為我開始懷疑的、不只是名字、而是——<strong className="text-cream">我是不是把人生的選擇、交給了別人?</strong>
            </p>
            <p>
              於是我花了兩個多月、閱讀了十多本姓名學專著、研究了六大門派的理論體系、
              最後自己為自己改了名。
            </p>

            <div className="glass rounded-xl p-5 border-l-2 border-gold/30">
              <span className="text-text-muted text-sm">改名前:</span><br />
              <span className="text-text">
                23 歲拿到百萬年薪、26 歲負債兩百萬、收入銳減一半、差點破產。
                30 歲還在數著銀行餘額過日子。最好的朋友曾對我說——
              </span>
              <em className="text-gold/90">「你不是沒有能力、而是真的比較倒楣而已。」</em>
            </div>

            <div className="glass rounded-xl p-5 border-l-2 border-green-600/30">
              <span className="text-text-muted text-sm">改名後:</span><br />
              <span className="text-text">
                30 到 35 歲、被挖角到中國、再到香港。遇到了另一半、成了家、生了孩子。
                從負債兩百多萬、到收入翻了數倍、豐衣足食。
              </span>
            </div>

            <p>
              大概率<strong className="text-cream">八成是因為我夠努力</strong>。
              但總有那關鍵的兩成——運勢、時機、生不逢時——不是努力就能改變的。
            </p>

            <div className="glass rounded-xl p-5 border-l-2 border-gold/30 text-cream">
              在我的認知中、命理是經過數理驗算後找出大概率趨勢的一門學問。
              它的目標從來不是逆天改命、而是一個<strong className="text-gold">自我對話的過程</strong>——
              更了解自己、才能更完善地發揮自己的天賦。
            </div>

            <p className="text-cream font-semibold">
              這就是鑒源的初衷。<br />
              回到源頭、看清本質。把選擇的權力、交還給你自己。
            </p>
          </div>

          <div className="text-gold/60 text-4xl text-right mt-4" style={{ fontFamily: 'var(--font-sans)' }}>&rdquo;</div>

          <div className="mt-8 pt-6 border-t border-gold/10">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-gold/15 flex items-center justify-center text-gold text-lg font-bold shrink-0" style={{ fontFamily: 'var(--font-sans)' }}>J</div>
              <div>
                <p className="text-sm font-semibold text-cream">Jamie</p>
                <p className="text-xs text-gold/70">鑒源創辦人</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 鑒源 3 大承諾 */}
      <section className="max-w-4xl mx-auto px-6 mb-20">
        <div className="divider-ornament text-gold/30 mb-6 justify-center">
          <span className="text-xs tracking-[0.2em]">鑒源 3 大承諾</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="glass rounded-2xl p-6 border border-gold/15 text-center">
            <div className="text-gold mb-3 flex justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10">
                <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-cream mb-2">古籍為本</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              44,421+ 條規則源自《滴天髓》《紫微斗數全書》《窮通寶鑑》等經典、絕非憑空推演。
            </p>
          </div>
          <div className="glass rounded-2xl p-6 border border-gold/15 text-center">
            <div className="text-gold mb-3 flex justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10">
                <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-cream mb-2">14 系統交叉</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              不是「某位老師說」、而是 14 套東西方系統的共識。三層加權架構確保結論經得起推敲。
            </p>
          </div>
          <div className="glass rounded-2xl p-6 border border-gold/15 text-center">
            <div className="text-gold mb-3 flex justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-10 h-10">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-cream mb-2">有溫度的陪伴</h3>
            <p className="text-sm text-text-muted leading-relaxed">
              每份報告都含「心靈視角」章節(榮格原型 + 正向心理學)、命理是自我對話、不是焦慮源。
            </p>
          </div>
        </div>
      </section>

      {/* 底部 CTA */}
      <section className="max-w-3xl mx-auto px-6 text-center pb-16">
        <p className="text-text-muted mb-6">
          如果你正在尋找答案、希望我們可以陪你走一段。
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/tools/bazi" className="px-6 py-3 rounded-full bg-gold text-dark font-bold hover:bg-gold/90 transition-colors">
            先試 30 秒免費速算
          </Link>
          <Link href="/pricing" className="px-6 py-3 rounded-full border border-gold/40 text-gold hover:bg-gold/10 transition-colors">
            查看完整方案
          </Link>
        </div>
      </section>
    </div>
  )
}
