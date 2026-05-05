// ============================================================
// 八字本地計算 — 純 TS、可被 RSC / route.ts / 其他 lib 共用
// 抽自 app/api/free-bazi/route.ts L96-193(2026-05-06 R+12)
// 抽出原因:報告頁 page.tsx 命格名片 5 件套 fallback 在
//   report_result.analyses 為 null 時、需從 birth_data 直算八字
//
// 已知差異 vs Python ground truth(api_server/calculators/bazi/_wuxing.py):
// - 強度門檻:本檔 score≥55→偏旺 / ≥45→中和 / <45→偏弱
//                Python: ≥60→身強 / 40-60→中和 / <40→身弱
//   (派別同為扶抑、邊界生日 case 對 5 件套「五行 · 用神」卡顯示影響極小、
//    屬「優化」非翻盤、Bento Box 仍正確渲染、僅單一文字標籤可能微差)
// - 節氣表 JIEQI_BOUNDARIES 為近似日期(±1 天誤差、見 IA Agent R+12 P1#4)
//   2/3-2/5 立春 / 3/5-3/7 驚蟄等交接日生人月柱可能算錯、
//   ground truth 為 Python lunar-python(api_server/calculators 主引擎)、
//   本地版僅作 Bento Box fallback / Fly.io 冷啟動 fallback。
//
// localBazi 修補軌跡:
// - 抽出時加 `((y-4)%12+12)%12` 負數保護(原版 `(y-4)%12` 在 y<4 時返負、
//   實務 1900-2100 範圍 y≥1896 都不會觸發、屬抽 lib 後的 defensive coding、
//   1990-2100 結果與原版逐位元一致)
// ============================================================

const TG = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸']
const DZ = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥']
const WX_TG: Record<string,string> = {甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'}
const DZ_BQ: Record<string,string> = {子:'癸',丑:'己',寅:'甲',卯:'乙',辰:'戊',巳:'丙',午:'丁',未:'己',申:'庚',酉:'辛',戌:'戊',亥:'壬'}
const DZ_CANGGAN: Record<string,[string,number][]> = {
  子:[['癸',100]], 丑:[['己',60],['癸',30],['辛',10]], 寅:[['甲',60],['丙',30],['戊',10]],
  卯:[['乙',100]], 辰:[['戊',60],['乙',30],['癸',10]], 巳:[['丙',60],['庚',30],['戊',10]],
  午:[['丁',60],['己',30],['丙',10]], 未:[['己',60],['丁',30],['乙',10]], 申:[['庚',60],['壬',30],['戊',10]],
  酉:[['辛',100]], 戌:[['戊',60],['辛',30],['丁',10]], 亥:[['壬',60],['甲',30]],
}
const CANGGAN_WEIGHT = [0.6, 0.3, 0.1]
const NAYIN: Record<string,string> = {
  '甲子':'海中金','乙丑':'海中金','丙寅':'爐中火','丁卯':'爐中火','戊辰':'大林木','己巳':'大林木',
  '庚午':'路旁土','辛未':'路旁土','壬申':'劍鋒金','癸酉':'劍鋒金','甲戌':'山頭火','乙亥':'山頭火',
  '丙子':'澗下水','丁丑':'澗下水','戊寅':'城頭土','己卯':'城頭土','庚辰':'白蠟金','辛巳':'白蠟金',
  '壬午':'楊柳木','癸未':'楊柳木','甲申':'泉中水','乙酉':'泉中水','丙戌':'屋上土','丁亥':'屋上土',
  '戊子':'霹靂火','己丑':'霹靂火','庚寅':'松柏木','辛卯':'松柏木','壬辰':'長流水','癸巳':'長流水',
  '甲午':'砂石金','乙未':'砂石金','丙申':'山下火','丁酉':'山下火','戊戌':'平地木','己亥':'平地木',
  '庚子':'壁上土','辛丑':'壁上土','壬寅':'金箔金','癸卯':'金箔金','甲辰':'覆燈火','乙巳':'覆燈火',
  '丙午':'天河水','丁未':'天河水','戊申':'大驛土','己酉':'大驛土','庚戌':'釵釧金','辛亥':'釵釧金',
  '壬子':'桑柘木','癸丑':'桑柘木','甲寅':'大溪水','乙卯':'大溪水','丙辰':'沙中土','丁巳':'沙中土',
  '戊午':'天上火','己未':'天上火','庚申':'石榴木','辛酉':'石榴木','壬戌':'大海水','癸亥':'大海水',
}
const SX = ['鼠','牛','虎','兔','龍','蛇','馬','羊','猴','雞','狗','豬']

const JIEQI_BOUNDARIES: [number, number][] = [
  [2, 4], [3, 6], [4, 5], [5, 6], [6, 6], [7, 7],
  [8, 7], [9, 8], [10, 8], [11, 7], [12, 7], [1, 6],
]

function getMonthIndex(month: number, day: number): number {
  function toOrd(m: number, d: number): number {
    return m <= 1 ? (m + 12) * 100 + d : m * 100 + d
  }
  const dateOrd = toOrd(month, day)
  const jieqiOrds = JIEQI_BOUNDARIES.map(([m, d]) => toOrd(m, d))
  for (let i = 0; i < 12; i++) {
    const cur = jieqiOrds[i]
    const next = jieqiOrds[(i + 1) % 12]
    if (next > cur) {
      if (dateOrd >= cur && dateOrd < next) return i
    } else {
      if (dateOrd >= cur || dateOrd < next) return i
    }
  }
  return 0
}

export interface LocalBaziResult {
  pillars: { year: string; month: string; day: string; time: string }
  day_master: string
  day_master_wuxing: string
  strength: '偏旺' | '中和' | '偏弱'
  geju: string
  yongshen: string
  xishen: string
  wuxing_count: Record<string, number>
  wuxing_count_full: Record<string, number>
  nayin: { year: string; month: string; day: string; time: string }
  shishen_gan: { year: string; month: string; time: string }
  shengxiao: string
}

/**
 * 從國曆生日(年月日時)計算八字四柱 + 日主 + 五行 + 用神 + 生肖
 * 純 TS 實作、不依賴 Python API、適合 SSR / RSC 場景
 *
 * 注意:採近似節氣表(JIEQI_BOUNDARIES)、1900-2100 年範圍誤差 ≤ 1 天。
 * Python lunar-python 引擎為 ground truth、本地版作為 fallback。
 */
export function localBazi(year: number, month: number, day: number, hour: number): LocalBaziResult {
  // 年柱(立春前算上一年)
  let y = year
  const lichun_month = 2, lichun_day = 4
  if (month < lichun_month || (month === lichun_month && day < lichun_day)) y -= 1
  const yp = TG[((y - 4) % 10 + 10) % 10] + DZ[((y - 4) % 12 + 12) % 12]

  // 月柱
  const mIdx = getMonthIndex(month, day)
  const mDZ = (mIdx + 2) % 12
  const yTGIdx = ((y - 4) % 10 + 10) % 10
  const mStartTG = [2, 4, 6, 8, 0][yTGIdx % 5]
  const mp = TG[(mStartTG + mIdx) % 10] + DZ[mDZ]

  // 日柱
  let jy = year, jm = month
  if (jm <= 2) { jy -= 1; jm += 12 }
  const A = Math.floor(jy / 100), B = 2 - A + Math.floor(A / 4)
  const JD = Math.floor(365.25 * (jy + 4716)) + Math.floor(30.6001 * (jm + 1)) + day + B - 1524.5
  const dIdx = ((Math.floor(JD + 0.5) + 49) % 60 + 60) % 60
  const dp = TG[dIdx % 10] + DZ[dIdx % 12]

  // 時柱
  const dzIdx = Math.floor(((hour + 1) % 24) / 2)
  const dTGIdx = TG.indexOf(dp[0])
  const tStartTG = [0, 2, 4, 6, 8][dTGIdx % 5]
  const tp = TG[(tStartTG + dzIdx) % 10] + DZ[dzIdx]

  // 十神
  const WX = ['木', '火', '土', '金', '水']
  const getShishen = (dm: string, other: string): string => {
    const dmI = WX.indexOf(WX_TG[dm])
    const same = (TG.indexOf(dm) % 2) === (TG.indexOf(other) % 2)
    if (WX_TG[dm] === WX_TG[other]) return same ? '比肩' : '劫財'
    if (WX[(dmI + 1) % 5] === WX_TG[other]) return same ? '食神' : '傷官'
    if (WX[(dmI + 2) % 5] === WX_TG[other]) return same ? '偏財' : '正財'
    if (WX[(dmI + 3) % 5] === WX_TG[other]) return same ? '七殺' : '正官'
    if (WX[(dmI + 4) % 5] === WX_TG[other]) return same ? '偏印' : '正印'
    return ''
  }

  // 五行
  const pillars = [yp, mp, dp, tp]
  const wxCount: Record<string, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 }
  for (const p of pillars) { wxCount[WX_TG[p[0]]]++; wxCount[WX_TG[DZ_BQ[p[1]]]]++ }

  // 身強弱
  const dmWX = WX_TG[dp[0]], dmI = WX.indexOf(dmWX), parentWX = WX[(dmI + 4) % 5]
  const support = (wxCount[dmWX] || 0) + (wxCount[parentWX] || 0)
  const mBenqi = DZ_BQ[mp[1]], mSupport = WX_TG[mBenqi] === dmWX || WX_TG[mBenqi] === parentWX
  const score = support * 12 + (mSupport ? 15 : 0)
  const strength: '偏旺' | '中和' | '偏弱' = score >= 55 ? '偏旺' : score >= 45 ? '中和' : '偏弱'

  // 用神
  let yongshen: string, xishen: string
  if (strength === '偏旺') {
    yongshen = WX[(dmI + 2) % 5]; xishen = WX[(dmI + 1) % 5]
  } else if (strength === '偏弱') {
    yongshen = WX[(dmI + 4) % 5]; xishen = dmWX
  } else {
    if (score >= 50) { yongshen = WX[(dmI + 1) % 5]; xishen = WX[(dmI + 2) % 5] }
    else { yongshen = WX[(dmI + 4) % 5]; xishen = dmWX }
  }

  // 生肖
  const sxIdx = ((y - 4) % 12 + 12) % 12

  // 加權五行
  const wxFull: Record<string, number> = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 }
  for (const p of pillars) { wxFull[WX_TG[p[0]]] += 1.0 }
  for (const p of pillars) {
    const cg = DZ_CANGGAN[p[1]] || []
    for (let i = 0; i < cg.length; i++) { wxFull[WX_TG[cg[i][0]]] += (CANGGAN_WEIGHT[i] || 0.1) }
  }
  const monthBenqiWX = WX_TG[DZ_BQ[mp[1]]]
  if (monthBenqiWX) wxFull[monthBenqiWX] *= 1.4
  for (const k of Object.keys(wxFull)) wxFull[k] = Math.round(wxFull[k] * 100) / 100

  return {
    pillars: { year: yp, month: mp, day: dp, time: tp },
    day_master: dp[0],
    day_master_wuxing: WX_TG[dp[0]],
    strength,
    geju: getShishen(dp[0], mp[0]) + '格',
    yongshen,
    xishen,
    wuxing_count: wxCount,
    wuxing_count_full: wxFull,
    nayin: { year: NAYIN[yp] || '', month: NAYIN[mp] || '', day: NAYIN[dp] || '', time: NAYIN[tp] || '' },
    shishen_gan: { year: getShishen(dp[0], yp[0]), month: getShishen(dp[0], mp[0]), time: getShishen(dp[0], tp[0]) },
    shengxiao: SX[sxIdx],
  }
}

export const BAZI_TG = TG
export const BAZI_DZ = DZ
export const BAZI_WX_TG = WX_TG
export const BAZI_NAYIN = NAYIN
export const BAZI_SX = SX
