import PriceTag from '@/components/PriceTag'
import PricingButton from '@/components/PricingButton'
import { PromotionTopBanner, PromotionPrice } from '@/components/PromotionBanner'
import SocialProof from '@/components/SocialProof'
import FreeTryBanner from '@/components/FreeTryBanner'
import FunnelPageHit from '@/components/FunnelPageHit'

const PLANS = {
  personal: [
    { code: 'C', name: '人生藍圖', price: 89, popular: true, systems: 15,
      valueHint: '每套系統僅 $5.9',
      desc: '一份報告，看清人生全貌——性格天賦、事業方向、財運走勢、感情歸宿、大運機遇，十五套系統交叉驗證，給你最完整的答案',
      suitableFor: '如果你想一次看清自己的全貌，或者站在人生十字路口需要方向',
      features: ['命格名片——一眼看清你是誰', '性格天賦+行為模式深度解析', '事業方向+財運走向+投資風格', '感情婚姻+人際貴人分析', '健康養生+大運走勢', '2026 流年重點月份提醒', '刻意練習——具體可執行的改善計劃', '網頁重點版+PDF 完整版（30,000字+）'],
    },
    { code: 'D', name: '心之所惑', price: 39,
      desc: '心裡有一個放不下的問題？選一個面向，讓精選相關系統給你一個完整的答案',
      suitableFor: '如果你有一個具體的困惑——該不該換工作？這段感情有未來嗎？財運何時好轉？',
      features: ['可選：財運/事業/感情/健康/學業/搬家', '用 200 字描述你的困惑', '精選相關系統聚焦你的問題深度分析', '具體可行的建議與行動方向', 'PDF 完整報告'],
      hasQuestion: true,
    },
  ],
  family: [
    { code: 'G15', name: '家族藍圖', price: 59, systems: 15,
      desc: '在每位家人各自完成「人生藍圖」後，系統調取所有成員的命格數據，深度分析家庭互動關係、溝通模式、共同運勢——讓你看見家人之間看不見的能量流動',
      suitableFor: '前提：每位家庭成員需先購買「人生藍圖」（$89），家族藍圖專做互動分析',
      features: ['需先完成每位成員的「人生藍圖」', '家族能量圖譜（五行互補/衝突分析）', '每對成員互動關係深度解析', '親子教養 / 夫妻相處具體建議', '家運走勢+共同行動指南', '寫給這個家的話'],
    },
    { code: 'R', name: '合否？', price: 59,
      desc: '感情交往、結婚、合夥創業——你們在命理上到底合不合？精選關係系統交叉分析，找出契合與衝突的關鍵',
      suitableFor: '如果你正在考慮結婚、合夥，或者想知道跟某個人為什麼老是合不來',
      features: ['含兩人分析（每加1人+$19）', '合盤分析+互動建議', '對方可只提供年月日', '描述你的關係問題（200字）', '好的/注意/改善 三大建議'],
      addPrice: 19, hasQuestion: true,
    },
  ],
  fortune: [] as never[],
  chumenji: [
    { code: 'E1', name: '事件出門訣', price: 89,
      valueHint: '含 Top3 吉時 + Google 日曆一鍵加入',
      desc: '針對特定重要事件，以 25 層古籍評分體系精算前後所有時辰的奇門局，套入個人年命宮驗證，交出最精準的 Top3 出行方案',
      features: ['描述事件背景+期望結果（200字）', '25 層評分（門/星/神/干/格局/九遁）', '15 種事件精準匹配（面試/簽約/求財等）', 'Top3 吉時+方位+信心指數+命理依據', 'Google Calendar 一鍵新增', '神煞過濾（太歲/三煞/五黃自動避開）'],
      hasQuestion: true,
    },
    { code: 'E2', name: '月度出門訣', price: 99,
      valueHint: '4 週各 1 盤 Top1 吉時 + Google 日曆一鍵加入',
      desc: '排算未來一個月奇門局，以 25 層古籍評分體系分析，按週拆解為 4 盤，每盤精選 Top1 最佳出行時機，套入個人年命宮驗證',
      suitableFor: '期望每月持續補運、把握最佳時機的人',
      features: ['每週 1 盤，共 4 盤', '25 層古籍評分體系逐時辰分析', '個人年命宮交叉驗證', '每盤 Top1 吉時+方位+穿著+日曆邀約', 'Google Calendar 一鍵新增', '附補運操作法（朝吉方500公尺+靜坐40分鐘）'],
    },
  ],
}

type Plan = { code: string; name: string; price: number; desc: string; features: string[]; systems?: number; popular?: boolean; locked?: boolean; seasonal?: boolean; hasQuestion?: boolean; addPrice?: number; suitableFor?: string; valueHint?: string }

function Section({ title, subtitle, plans }: { title: string; subtitle: string; plans: Plan[] }) {
  return (
    <div className="mb-16">
      <div className="divider-ornament text-gold/30 mb-4">
        <span className="text-xs tracking-[0.2em]">{title}</span>
      </div>
      <p className="text-center text-text-muted text-sm mb-8">{subtitle}</p>
      <div className={`grid grid-cols-1 ${plans.length >= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'} gap-5`}>
        {plans.map((plan) => (
          <div key={plan.code}
            className={`relative glass rounded-2xl p-6 flex flex-col transition-all ${
              plan.popular ? 'border-gold/40 ring-1 ring-gold/20 scale-105 shadow-lg shadow-gold/20' : ''
            } ${plan.seasonal ? 'opacity-60' : ''}`}>
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gold text-dark text-[10px] font-bold rounded-full">最超值</div>
            )}
            {plan.seasonal && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-red-accent text-cream text-[10px] font-bold rounded-full">2027年1月開放</div>
            )}
            <div className="text-xs text-gold/70 font-mono mb-1">方案 {plan.code}</div>
            <h3 className="text-lg font-bold text-cream" style={{ fontFamily: 'var(--font-sans)' }}>{plan.name}</h3>
            <p className="text-xs text-text-muted mt-1 mb-2">{plan.desc}</p>
            {plan.suitableFor && (
              <p className="text-[10px] text-gold/70 mb-4 flex items-start gap-1">
                <span className="shrink-0 mt-px">&#9733;</span>
                <span>適合：{plan.suitableFor}</span>
              </p>
            )}
            <div className="mb-4">
              <PromotionPrice planCode={plan.code} originalPrice={plan.price}>
                <PriceTag usd={plan.price} size="lg" />
              </PromotionPrice>
              {plan.addPrice && <span className="text-xs text-text-muted ml-2">加人 +${plan.addPrice}/人</span>}
              {plan.valueHint && <div className="text-[10px] text-gold/60 mt-1">{plan.valueHint}</div>}
            </div>
            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-text">
                  <span className="text-gold mt-0.5">&#10003;</span>{f}
                </li>
              ))}
            </ul>
            <PricingButton code={plan.code} popular={plan.popular} seasonal={plan.seasonal} locked={plan.locked} />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PricingPage() {
  return (
    <div className="py-20">
      <FunnelPageHit step="visit_pricing" />
      <div className="max-w-7xl mx-auto px-6">
        <FreeTryBanner />
        <h1 className="text-3xl font-bold text-center mb-2" style={{ fontFamily: 'var(--font-sans)' }}>
          <span className="text-gradient-gold">方案與定價</span>
        </h1>
        <p className="text-center text-text-muted mb-4 max-w-xl mx-auto text-sm">
          6 種方案，從個人到家庭，從了解自己到採取行動。每份報告含網頁展示 + PDF 永久保存。
        </p>
        <p className="text-center text-xs text-gold mb-8">
          &#128274; 購買前需先<a href="/auth/signup" className="underline">免費註冊</a>或<a href="/auth/login" className="underline">登入</a>
        </p>

        <PromotionTopBanner />

        <SocialProof />

        <Section title="個人命格分析" subtitle="了解自己，掌握人生方向" plans={PLANS.personal} />
        <Section title="家庭與關係" subtitle="家人之間的命格交織與互動" plans={PLANS.family} />

        {/* 出門訣特殊區塊 */}
        <div className="mb-16">
          <div className="divider-ornament text-gold/30 mb-4">
            <span className="text-xs tracking-[0.2em]">奇門遁甲出門訣</span>
          </div>
          <div className="glass rounded-2xl p-6 mb-8 max-w-3xl mx-auto">
            <h3 className="text-lg font-bold text-gradient-gold mb-3" style={{ fontFamily: 'var(--font-sans)' }}>什麼是出門訣？</h3>
            <p className="text-sm text-text leading-[1.9] mb-4">
              出門訣源自奇門遁甲的千年擇吉術，古籍《煙波釣叟歌》記載：「吉門吉方即行，凶門凶方即止。」
              天地之間的能量每兩小時輪轉一次，八個方位的吉凶隨之改變。出門訣的本質，是在最對的時間，走向最對的方位，
              讓天時地利的能量灌注到您身上。
            </p>
            <p className="text-sm text-text leading-[1.9] mb-4">
              鑒源的出門訣引擎採用 25 層古籍評分體系——三吉門旺衰、三奇配門、八神吉凶、九星旺衰、天地盤干五行生剋、
              九遁格局（天遁/地遁/人遁等 9 種）、28 種吉凶格局判斷、神煞方位過濾——每一層都有《奇門遁甲統宗》《奇門遁甲秘笈大全》的古籍理論支撐。
              最終套入您的個人年命宮交叉驗證，確保推薦的每個吉時都是專屬於您的。
            </p>
            <div className="rounded-xl bg-gold/5 border border-gold/10 p-4 text-xs text-text-muted space-y-1.5">
              <p><strong className="text-gold">操作方式：</strong></p>
              <p>1. 在推薦的吉時準時出門，朝吉方走出 500 公尺以上</p>
              <p>2. 到達後面朝吉方靜坐 40 分鐘，放鬆接氣</p>
              <p>3. 接氣完成後，可直接前往辦重要的事（面試/簽約/談判），效果最強</p>
              <p>4. 支援 15 種事件分類，每個推薦附帶信心指數，報告含 Google Calendar 一鍵新增</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
            {PLANS.chumenji.map((plan) => (
              <div key={plan.code}
                className="relative glass rounded-2xl p-6 flex flex-col transition-all">
                <div className="text-xs text-gold/70 font-mono mb-1">方案 {plan.code}</div>
                <h3 className="text-lg font-bold text-cream" style={{ fontFamily: 'var(--font-sans)' }}>{plan.name}</h3>
                <p className="text-xs text-text-muted mt-1 mb-2">{plan.desc}</p>
                <div className="mb-4">
                  <PriceTag usd={plan.price} size="lg" />
                  {plan.valueHint && <div className="text-[10px] text-gold/60 mt-1">{plan.valueHint}</div>}
                </div>
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-text">
                      <span className="text-gold mt-0.5">&#10003;</span>{f}
                    </li>
                  ))}
                </ul>
                <PricingButton code={plan.code} />
              </div>
            ))}
          </div>
        </div>

        {/* 方案對比表 */}
        <div className="mb-16 max-w-4xl mx-auto">
          <div className="divider-ornament text-gold/30 mb-4">
            <span className="text-xs tracking-[0.2em]">方案比較</span>
          </div>
          <p className="text-center text-text-muted text-sm mb-8">一目了然，找到最適合你的方案</p>
          <div className="glass rounded-xl overflow-hidden overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gold/10">
                  <th className="text-left p-4 text-text-muted font-normal">功能</th>
                  <th className="p-4 text-gold text-center font-semibold">心之所惑<br/><span className="text-xs text-text-muted font-normal">$39</span></th>
                  <th className="p-4 text-gold text-center font-semibold bg-gold/5">人生藍圖<br/><span className="text-xs text-text-muted font-normal">$89</span></th>
                  <th className="p-4 text-gold text-center font-semibold">合否？<br/><span className="text-xs text-text-muted font-normal">$59</span></th>
                  <th className="p-4 text-gold text-center font-semibold">家族藍圖<br/><span className="text-xs text-text-muted font-normal">$59</span></th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {[
                  { feature: '分析系統數', d: '精選相關系統', c: '15套', r: '精選關係系統', g: '15套' },
                  { feature: '性格天賦分析', d: '聚焦選定面向', c: '&#10003;', r: '--', g: '&#10003;' },
                  { feature: '事業財運分析', d: '單面向', c: '&#10003;', r: '--', g: '&#10003;' },
                  { feature: '感情婚姻分析', d: '單面向', c: '&#10003;', r: '&#10003;', g: '&#10003;' },
                  { feature: '大運流年走勢', d: '--', c: '&#10003;', r: '--', g: '&#10003;' },
                  { feature: '專項問題深度剖析', d: '&#10003;', c: '--', r: '&#10003;', g: '--' },
                  { feature: '多人互動分析', d: '--', c: '--', r: '&#10003;', g: '&#10003;' },
                  { feature: '家庭動力學', d: '--', c: '--', r: '--', g: '&#10003;' },
                  { feature: 'PDF 完整報告', d: '&#10003;', c: '&#10003;', r: '&#10003;', g: '&#10003;' },
                  { feature: '報告字數', d: '5,000字+', c: '30,000字+', r: '8,000字+', g: '每人8,000字+' },
                ].map((row) => (
                  <tr key={row.feature} className="border-b border-gold/5 hover:bg-white/3">
                    <td className="p-3 text-cream">{row.feature}</td>
                    <td className="p-3 text-center text-text-muted" dangerouslySetInnerHTML={{ __html: row.d.replace('&#10003;', '<span class="text-gold">&#10003;</span>') }} />
                    <td className="p-3 text-center text-text-muted bg-gold/5" dangerouslySetInnerHTML={{ __html: row.c.replace('&#10003;', '<span class="text-gold">&#10003;</span>') }} />
                    <td className="p-3 text-center text-text-muted" dangerouslySetInnerHTML={{ __html: row.r.replace('&#10003;', '<span class="text-gold">&#10003;</span>') }} />
                    <td className="p-3 text-center text-text-muted" dangerouslySetInnerHTML={{ __html: row.g.replace('&#10003;', '<span class="text-gold">&#10003;</span>') }} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 推薦指南 */}
        <div className="max-w-3xl mx-auto glass rounded-2xl p-8">
          <h3 className="text-xl font-bold text-gradient-gold mb-4" style={{ fontFamily: 'var(--font-sans)' }}>不確定選哪個？</h3>
          <div className="space-y-3 text-sm text-text">
            <p><strong className="text-cream">第一次體驗：</strong>先去<a href="/tools/bazi" className="text-gold underline">免費速算</a>看效果，再選「心之所惑」（$39）聚焦你最在乎的問題。</p>
            <p><strong className="text-cream">全面了解自己：</strong>「人生藍圖」（$89）完整分析人生各面向，最超值。</p>
            <p><strong className="text-cream">有特定困惑：</strong>「心之所惑」（$39）聚焦一個面向深入剖析。</p>
            <p><strong className="text-cream">全家分析：</strong>每位家人先各自購買「人生藍圖」（$89），再加購「家族藍圖」（$59）做家庭互動分析。</p>
            <p><strong className="text-cream">感情/合夥：</strong>「合否？」（$59）兩人命理交叉分析，看你們合不合。</p>
            <p><strong className="text-cream">想採取行動：</strong>先做「人生藍圖」了解自己，再加出門訣，在最好的時機出行，把握機遇。</p>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto mt-16">
          <div className="divider-ornament text-gold/30 mb-4">
            <span className="text-xs tracking-[0.2em]">常見問題</span>
          </div>
          <p className="text-center text-text-muted text-sm mb-8">購買前您可能想知道的事</p>
          {[
            { q: '命理分析真的準確嗎？', a: '鑒源的排盤計算使用確定性算法（壽星天文曆、Swiss Ephemeris），排盤結果可重複驗證，與專業命理軟體一致。分析解讀基於數十部經典古籍提煉的專業規則，由 AI 引擎整合成個人化報告。我們最多用十五套系統交叉分析——當多數系統得出相同結論時，可信度遠高於單一系統。' },
            { q: '報告多久生成？', a: '個人報告（人生藍圖、心之所惑）約 30 分鐘；家族藍圖和合否根據人數而定；出門訣因需排算數百個時辰，約需 40 分鐘以上。付款後系統全自動運算，完成後立即 Email 通知。' },
            { q: '可以退款嗎？', a: '報告為虛擬數位內容，一旦開始生成即消耗大量運算資源，因此生成後不支持退款。如果報告品質有任何問題，請聯繫 support@jianyuan.life，我們會免費重新生成。' },
            { q: '付款方式有哪些？安全嗎？', a: '透過 Stripe（PCI DSS Level 1 認證）處理，支援 Visa、Mastercard、AMEX 等主流信用卡。您的卡號不會經過鑒源伺服器，全程加密。' },
            { q: '人生藍圖和心之所惑有什麼差別？', a: '「人生藍圖」是全面分析——動用十五套系統涵蓋性格、事業、財運、感情、健康、大運等所有面向，報告含網頁重點版和 PDF 完整版（30,000字+）。「心之所惑」則聚焦在你最在乎的一個問題，精選最相關的系統深入剖析（5,000字+）。如果你有明確的困惑，心之所惑更精準；如果想全面了解自己，人生藍圖更完整。' },
            { q: '出門訣適合什麼場合？', a: '系統支援 15 種事件分類：求財、事業、感情、健康、學業、出行、搬家、投資、官司、婚姻、求醫、談判、考試、簽約等。事件出門訣（$89）針對單一重要事件，精算 Top3 最佳時機；月度出門訣（$99）按週拆解 4 盤，每盤精選 Top1 吉時，適合持續補運。古籍說「三奇得使，萬事皆宜」，長期使用效果最明顯。' },
            { q: '不確定出生時間怎麼辦？', a: '可以選擇最接近的時辰。即使時間不完全精確，十五套系統中有多套不依賴精確時辰（如姓名學、數字能量學、生肖運勢等），仍能提供有價值的分析。' },
          ].map((faq) => (
            <details key={faq.q} className="glass rounded-lg mb-3 group">
              <summary className="p-5 cursor-pointer font-semibold text-cream flex justify-between items-center text-sm">
                {faq.q}
                <span className="text-gold group-open:rotate-45 transition-transform text-lg ml-4 shrink-0">+</span>
              </summary>
              <div className="px-5 pb-5 text-sm text-text-muted leading-[1.9] border-t border-gold/5 pt-4">{faq.a}</div>
            </details>
          ))}
        </div>
      </div>
    </div>
  )
}
