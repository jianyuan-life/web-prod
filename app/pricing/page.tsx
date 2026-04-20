import Link from 'next/link'
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
  chumenji: [
    { code: 'E1', name: '事件出門訣', price: 59, popular: true,
      valueHint: '針對單一重要事件、Top3 吉時',
      desc: '婚禮、面試、簽約、重大決策——以古法奇門遁甲精密計算事件前後所有時辰的盤面能量，結合您的年命宮推出 Top3 最佳出行方案',
      suitableFor: '即將進行的具體重要事件，想要在最有利能量下完成',
      features: ['描述事件背景＋期望結果（200 字）', '14 類事件精準匹配＋自由描述 AI 分類', '25 層古法評分（門/星/神/干/格局/神煞）', '個人年命宮交叉驗證', 'Top3 吉時＋方位度數＋信心等級', '行事曆邀約一鍵加入'],
      hasQuestion: true,
    },
    { code: 'E2', name: '月度出門訣', price: 29,
      valueHint: '單次購買、當月執行',
      desc: '替該月度圈定一個當月最佳出行主吉方與吉時，適合每月補運、穩定運勢持續累積的人',
      suitableFor: '每月補運、想讓好運累積、尚未決定訂閱月度計畫的人',
      features: ['農曆月份精算（立春／節氣換月）', '月盤九宮八門八神古法排盤', '當月主吉方度數＋最佳吉時窗口', '個人年命宮交叉驗證', '行事曆邀約一鍵加入', '晦日 21:00 前購買即算當月'],
    },
    { code: 'E3', name: '月度訂閱', price: 89,
      valueHint: '4 週×每週 Top2＝8 吉時、持續補運最佳',
      desc: '月度完整版——針對選定 1-3 個主題用神，4 週每週精算 Top2 吉時，共 8 個最佳時窗，讓您整月持續在對的能量中',
      suitableFor: '需要事業／財運／感情持續補運、希望系統性接天時地利的人',
      features: ['選 1-3 個主題（事業／財運／感情／健康／學業／貴人／化解小人／家庭）', '每週 2 個 Top 吉時、共 8 個時窗', '主題用神（值符／天心／開門等）對應評分', '個人年命宮交叉驗證', '行事曆邀約一鍵加入', '古法占事派正統：用神佔 60%'],
    },
    { code: 'E4', name: '年度出門訣', price: 279, seasonal: true,
      valueHint: '年盤＋12 月盤、立春前 30 天限時販售',
      desc: '年度完整方案——年盤 + 12 個月盤的古法精算，全年重要擇吉一次到位，每年立春前 30 天限時開放',
      suitableFor: '希望全年重要決策都有奇門吉時依據、年度擇吉一次搞定的人',
      features: ['年盤古法排盤（全陰遁、立春換年）', '12 個月盤（每月主吉方＋吉時）', '個人年命宮交叉驗證', '全年主吉方／忌方總覽', '行事曆邀約（全年吉時一次匯入）', '立春前 30 天限時販售、錯過等明年'],
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
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-red-accent text-cream text-[10px] font-bold rounded-full">立春前 30 天限時</div>
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
          個人、家庭、關係、出門訣共四大類別，從了解自己到採取行動，每份報告在網頁上展示，永久保存於您的帳號中。
        </p>
        <p className="text-center text-xs text-gold mb-8">
          &#128274; 購買前需先<Link href="/auth/signup" className="underline">免費註冊</Link>或<Link href="/auth/login" className="underline">登入</Link>
        </p>

        <PromotionTopBanner />

        <SocialProof />

        <Section title="個人命格分析" subtitle="了解自己，掌握人生方向" plans={PLANS.personal} />
        <Section title="家庭與關係" subtitle="家人之間的命格交織與互動" plans={PLANS.family} />

        {/* 出門訣四方案 E1-E4 */}
        <div className="mb-16">
          <div className="divider-ornament text-gold/30 mb-4">
            <span className="text-xs tracking-[0.2em]">古法奇門遁甲擇吉出門訣</span>
          </div>
          <div className="glass rounded-2xl p-6 mb-8 max-w-3xl mx-auto">
            <h3 className="text-lg font-bold text-gradient-gold mb-3" style={{ fontFamily: 'var(--font-sans)' }}>什麼是出門訣？</h3>
            <p className="text-sm text-text leading-[1.9] mb-4">
              古法奇門遁甲記載：「吉門吉方即行，凶門凶方即止。」天地能量每兩小時輪轉一次，八方吉凶隨之改變。
              出門訣的本質——在對的時間，走向對的方位，讓天時地利的能量灌注到您身上。
            </p>
            <p className="text-sm text-text leading-[1.9] mb-4">
              鑑源的出門訣引擎採用古法 25 層評分體系——三吉門旺衰、三奇配門、八神吉凶、九星旺衰、天地盤干五行生剋、
              九遁格局、28 種吉凶格局判斷、神煞方位過濾——每一層都有古籍理論支撐。
              最終套入您的個人年命宮交叉驗證，確保推薦的每個吉時都是專屬於您的。
            </p>
            <div className="rounded-xl bg-gold/5 border border-gold/10 p-4 text-xs text-text-muted space-y-1.5">
              <p><strong className="text-gold">操作方式：</strong></p>
              <p>1. 在推薦的吉時準時出門，朝吉方走出 500 公尺以上</p>
              <p>2. 到達後面朝吉方靜坐 40 分鐘，放鬆接氣</p>
              <p>3. 接氣完成後，可直接前往辦重要的事，效果最強</p>
              <p>4. 每個推薦附帶信心等級＋行事曆邀約一鍵加入</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {PLANS.chumenji.map((plan) => (
              <div key={plan.code}
                className={`relative glass rounded-2xl p-6 flex flex-col transition-all ${plan.popular ? 'border-gold/40 ring-1 ring-gold/20 shadow-lg shadow-gold/20' : ''} ${plan.seasonal ? 'border-red-accent/30 ring-1 ring-red-accent/10' : ''}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gold text-dark text-[10px] font-bold rounded-full">最熱門</div>
                )}
                {plan.seasonal && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-red-accent text-cream text-[10px] font-bold rounded-full">立春前限時</div>
                )}
                <div className="text-xs text-gold/70 font-mono mb-1">方案 {plan.code}</div>
                <h3 className="text-lg font-bold text-cream" style={{ fontFamily: 'var(--font-sans)' }}>{plan.name}</h3>
                <p className="text-xs text-text-muted mt-1 mb-2">{plan.desc}</p>
                {plan.suitableFor && (
                  <p className="text-[10px] text-gold/70 mb-3 flex items-start gap-1">
                    <span className="shrink-0 mt-px">&#9733;</span>
                    <span>適合：{plan.suitableFor}</span>
                  </p>
                )}
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
                <PricingButton code={plan.code} popular={plan.popular} seasonal={plan.seasonal} />
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

        {/* 出門訣對比表 */}
        <div className="mb-16 max-w-4xl mx-auto">
          <div className="divider-ornament text-gold/30 mb-4">
            <span className="text-xs tracking-[0.2em]">出門訣比較</span>
          </div>
          <p className="text-center text-text-muted text-sm mb-8">四個出門訣方案，覆蓋從單事件到全年的擇吉需求</p>
          <div className="glass rounded-xl overflow-hidden overflow-x-auto -mx-6 px-6 sm:mx-0 sm:px-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gold/10">
                  <th className="text-left p-4 text-text-muted font-normal">項目</th>
                  <th className="p-4 text-gold text-center font-semibold">事件 E1<br/><span className="text-xs text-text-muted font-normal">$59</span></th>
                  <th className="p-4 text-gold text-center font-semibold">月度 E2<br/><span className="text-xs text-text-muted font-normal">$29</span></th>
                  <th className="p-4 text-gold text-center font-semibold bg-gold/5">訂閱 E3<br/><span className="text-xs text-text-muted font-normal">$89</span></th>
                  <th className="p-4 text-gold text-center font-semibold">年度 E4<br/><span className="text-xs text-text-muted font-normal">$279</span></th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {[
                  { feature: '對象', e1: '單一事件', e2: '當月補運', e3: '整月持續', e4: '整年佈局' },
                  { feature: '吉時數', e1: 'Top3', e2: '主吉方 1 盤', e3: '8 個（4 週 ×2）', e4: '年盤＋12 月盤' },
                  { feature: '主題用神', e1: '自由描述', e2: '無', e3: '可選 1-3 個', e4: '無' },
                  { feature: '時間單位', e1: '時盤（兩小時）', e2: '月盤', e3: '時盤（8 個）', e4: '年盤＋月盤' },
                  { feature: '年命宮驗證', e1: '&#10003;', e2: '&#10003;', e3: '&#10003;', e4: '&#10003;' },
                  { feature: '行事曆邀約', e1: '&#10003;', e2: '&#10003;', e3: '&#10003;', e4: '&#10003;' },
                  { feature: '販售限制', e1: '隨時', e2: '晦日 21:00 前當月', e3: '隨時', e4: '立春前 30 天限時' },
                ].map((row) => (
                  <tr key={row.feature} className="border-b border-gold/5 hover:bg-white/3">
                    <td className="p-3 text-cream">{row.feature}</td>
                    <td className="p-3 text-center text-text-muted" dangerouslySetInnerHTML={{ __html: row.e1.replace('&#10003;', '<span class="text-gold">&#10003;</span>') }} />
                    <td className="p-3 text-center text-text-muted" dangerouslySetInnerHTML={{ __html: row.e2.replace('&#10003;', '<span class="text-gold">&#10003;</span>') }} />
                    <td className="p-3 text-center text-text-muted bg-gold/5" dangerouslySetInnerHTML={{ __html: row.e3.replace('&#10003;', '<span class="text-gold">&#10003;</span>') }} />
                    <td className="p-3 text-center text-text-muted" dangerouslySetInnerHTML={{ __html: row.e4.replace('&#10003;', '<span class="text-gold">&#10003;</span>') }} />
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
            <p><strong className="text-cream">第一次體驗：</strong>先去<Link href="/tools/bazi" className="text-gold underline">免費速算</Link>看效果，再選「心之所惑」（$39）聚焦你最在乎的問題。</p>
            <p><strong className="text-cream">全面了解自己：</strong>「人生藍圖」（$89）完整分析人生各面向，最超值。</p>
            <p><strong className="text-cream">有特定困惑：</strong>「心之所惑」（$39）聚焦一個面向深入剖析。</p>
            <p><strong className="text-cream">全家分析：</strong>每位家人先各自購買「人生藍圖」（$89），再加購「家族藍圖」（$59）做家庭互動分析。</p>
            <p><strong className="text-cream">感情/合夥：</strong>「合否？」（$59）兩人命理交叉分析，看你們合不合。</p>
            <p><strong className="text-cream">單一重要事件：</strong>「事件出門訣」（$59）針對一個事件推出 Top3 吉時方案。</p>
            <p><strong className="text-cream">每月補運：</strong>先試「月度出門訣」（$29）當月執行，認可後升級「月度訂閱」（$89）持續補運。</p>
            <p><strong className="text-cream">全年擇吉：</strong>「年度出門訣」（$279）立春前 30 天限時販售，全年重要決策一次搞定。</p>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto mt-16">
          <div className="divider-ornament text-gold/30 mb-4">
            <span className="text-xs tracking-[0.2em]">常見問題</span>
          </div>
          <p className="text-center text-text-muted text-sm mb-8">購買前您可能想知道的事</p>
          {[
            { q: '命理分析真的準確嗎？', a: '鑒源的排盤計算使用確定性算法（壽星天文曆、Swiss Ephemeris），排盤結果可重複驗證，與專業命理軟體一致。分析解讀基於數十部經典古籍提煉的專業規則。我們最多用十五套系統交叉分析——當多數系統得出相同結論時，可信度遠高於單一系統。' },
            { q: '報告多久生成？', a: '個人報告（人生藍圖、心之所惑）約 30 分鐘；家族藍圖和合否根據人數而定；出門訣因需精密計算整月或整年的盤面能量，完成時間約 5-40 分鐘不等。付款後系統全自動運算，完成後即可於網頁上查看。' },
            { q: '可以退款嗎？', a: '報告為虛擬數位內容，一旦開始生成即消耗大量運算資源，因此生成後不支持退款。如果報告品質有任何問題，請聯繫 support@jianyuan.life，我們會免費重新生成。' },
            { q: '付款方式有哪些？安全嗎？', a: '透過 Stripe（PCI DSS Level 1 認證）處理，支援 Visa、Mastercard、AMEX 等主流信用卡。您的卡號不會經過鑒源伺服器，全程加密。' },
            { q: '人生藍圖和心之所惑有什麼差別？', a: '「人生藍圖」是全面分析——動用十五套系統涵蓋性格、事業、財運、感情、健康、大運等所有面向。「心之所惑」則聚焦在你最在乎的一個問題，精選最相關的系統深入剖析。' },
            { q: '四個出門訣方案怎麼選？', a: 'E1 事件出門訣（$59）針對單一重要事件推 Top3 吉時；E2 月度出門訣（$29）當月購買當月執行、晦日 21:00 前截止；E3 月度訂閱（$89）主題精選用神、4 週共 8 個吉時；E4 年度出門訣（$279）年盤＋12 月盤全年佈局、立春前 30 天限時。' },
            { q: '不確定出生時間怎麼辦？', a: '可以選擇最接近的時辰。即使時間不完全精確，十五套系統中有多套不依賴精確時辰（如姓名學、數字能量學、生肖運勢等），仍能提供有價值的分析。' },
            { q: '出門訣為什麼不提供「隔天」替代方案？', a: '古法奇門遁甲「一時一盤」，每個時辰的盤面能量不同，隔天就是完全不同的能量組合。若錯過推薦的吉時，只能等待下一個系統推薦的時窗。' },
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
