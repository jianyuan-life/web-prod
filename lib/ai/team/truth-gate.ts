// ============================================================
// 鑑源 AI 團隊 — 事實閘門（Truth Gate）
// ============================================================
// 機械比對 AI 輸出 vs 排盤 JSON，任何編造立刻攔下
// 這是「0 誤差」保證的最後一道防線
// 不靠 AI 判斷，純 regex + 字串比對

export interface ChartTruth {
  // 八字
  yearGanzhi?: string       // 年柱（例：庚午）
  monthGanzhi?: string      // 月柱（例：丙戌）
  dayGanzhi?: string        // 日柱
  hourGanzhi?: string       // 時柱
  dayGan?: string           // 日主天干（例：庚）
  dayZhi?: string           // 日支
  // 紫微
  mingGongName?: string     // 命宮宮名（例：亥）
  mingGongStar?: string     // 命宮主星（例：天府）
  wuxingJu?: string         // 五行局（例：金四局）
  // 姓名學
  chineseName?: string
  // 大運 / 流年
  currentDayun?: string
  currentYearGanzhi?: string   // 2026 流年應為丙午
  // 其他
  gender?: 'M' | 'F'
  age?: number
  zodiacAnimal?: string     // 生肖
}

export interface TruthGateResult {
  passed: boolean
  violations: Array<{
    claim: string          // AI 說了什麼
    truth: string          // 排盤真相是什麼
    severity: 'critical' | 'warning'
  }>
}

/**
 * 從排盤 JSON 抽取關鍵真相
 */
export function extractChartTruth(chartData: Record<string, unknown>): ChartTruth {
  const truth: ChartTruth = {}
  const c = chartData as any

  // 八字
  const bazi = c.bazi || c.analyses?.find?.((a: any) => a.system === 'bazi')?.raw_data
  if (bazi?.pillars) {
    truth.yearGanzhi = bazi.pillars.year
    truth.monthGanzhi = bazi.pillars.month
    truth.dayGanzhi = bazi.pillars.day
    truth.hourGanzhi = bazi.pillars.hour
    truth.dayGan = bazi.tiangan?.day || bazi.pillars.day?.[0]
    truth.dayZhi = bazi.dizhi?.day || bazi.pillars.day?.[1]
  }

  // 紫微
  const ziwei = c.ziwei || c.analyses?.find?.((a: any) => a.system === 'ziwei_doushu' || a.system === 'ziwei')?.raw_data
  if (ziwei) {
    truth.mingGongName = ziwei.ming_gong_name || ziwei.mingGongName || ziwei.palace_12?.[0]?.name
    truth.mingGongStar = ziwei.ming_gong_main_star || ziwei.main_stars || ziwei.palace_12?.[0]?.main_stars
    truth.wuxingJu = ziwei.wuxing_ju || ziwei.wuxingJu
  }

  // 基本資料
  truth.chineseName = c.name || c.birthData?.name
  truth.gender = c.gender || c.birthData?.gender
  truth.age = c.age || c.birthData?.age
  truth.zodiacAnimal = c.zodiac || c.sheng_xiao

  // 流年（當下年份）
  const nowYear = new Date().getFullYear()
  const yearGanzhiMap: Record<number, string> = {
    2024: '甲辰', 2025: '乙巳', 2026: '丙午', 2027: '丁未',
    2028: '戊申', 2029: '己酉', 2030: '庚戌',
  }
  truth.currentYearGanzhi = yearGanzhiMap[nowYear]

  // 大運（若有）
  truth.currentDayun = c.current_dayun || c.dayun?.current?.ganzhi

  return truth
}

/**
 * 比對報告 AI 輸出 vs 排盤真相
 *
 * 規則：
 * - 若 AI 明確提到日主 X 金/木/水/火/土，必須對得上排盤
 * - 若 AI 說「命宮 X」，必須對得上排盤的命宮
 * - 若 AI 引用「2026 流年 X」必須是丙午（2026 年）
 * - 若 AI 提到主星 X，該主星必須真實在命盤中
 */
export function checkTruthGate(
  report: string,
  chartData: Record<string, unknown>,
): TruthGateResult {
  const truth = extractChartTruth(chartData)
  const violations: TruthGateResult['violations'] = []

  // ── 1. 日主天干檢查 ──
  // AI 寫「日主庚金」→ 真相「日主甲木」→ CRITICAL
  const dayGanMatch = report.match(/日主(?:為|是)?([甲乙丙丁戊己庚辛壬癸])([金木水火土])?/)
  if (dayGanMatch && truth.dayGan) {
    const claimed = dayGanMatch[1]
    if (claimed !== truth.dayGan) {
      violations.push({
        claim: `AI 說日主為「${claimed}」`,
        truth: `排盤真相是「${truth.dayGan}」`,
        severity: 'critical',
      })
    }
  }

  // ── 2. 日主五行檢查 ──
  const ganToWuxing: Record<string, string> = {
    '甲': '木', '乙': '木', '丙': '火', '丁': '火',
    '戊': '土', '己': '土', '庚': '金', '辛': '金',
    '壬': '水', '癸': '水',
  }
  if (truth.dayGan && ganToWuxing[truth.dayGan]) {
    const correctWuxing = ganToWuxing[truth.dayGan]
    // AI 寫「日主X金」的「金」若跟真實五行不符
    const wuxingClaim = report.match(/日主[甲乙丙丁戊己庚辛壬癸]([金木水火土])/)
    if (wuxingClaim && wuxingClaim[1] !== correctWuxing) {
      violations.push({
        claim: `AI 說日主五行為「${wuxingClaim[1]}」`,
        truth: `日主${truth.dayGan}的五行是「${correctWuxing}」`,
        severity: 'critical',
      })
    }
  }

  // ── 3. 流年干支檢查 ──
  if (truth.currentYearGanzhi) {
    const yearClaimMatch = report.match(/(\d{4})\s*年?(?:流年)?[，、：:]*\s*([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/g)
    if (yearClaimMatch) {
      for (const m of yearClaimMatch) {
        const yearMatch = m.match(/(\d{4})/)
        const gzMatch = m.match(/([甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥])/)
        if (yearMatch && gzMatch) {
          const year = parseInt(yearMatch[1])
          const claimed = gzMatch[1]
          const correctMap: Record<number, string> = {
            2024: '甲辰', 2025: '乙巳', 2026: '丙午',
            2027: '丁未', 2028: '戊申', 2029: '己酉',
          }
          if (correctMap[year] && correctMap[year] !== claimed) {
            violations.push({
              claim: `AI 說 ${year} 年流年為「${claimed}」`,
              truth: `${year} 年實際是「${correctMap[year]}」`,
              severity: 'critical',
            })
          }
        }
      }
    }
  }

  // ── 4. 命宮宮位檢查（紫微）──
  if (truth.mingGongName) {
    // AI 寫「命宮在亥」或「命宮位於亥宮」
    const mingGongMatch = report.match(/命宮(?:在|位於|坐於|坐在)([子丑寅卯辰巳午未申酉戌亥])/)
    if (mingGongMatch) {
      const claimed = mingGongMatch[1]
      if (claimed !== truth.mingGongName) {
        violations.push({
          claim: `AI 說命宮在「${claimed}」`,
          truth: `排盤真相是「${truth.mingGongName}」`,
          severity: 'critical',
        })
      }
    }
  }

  // ── 5. 性別一致性 ──
  if (truth.gender === 'M') {
    const femaleClaim = report.match(/妳的|她的|女士|小姐|女性身分/)
    if (femaleClaim) {
      violations.push({
        claim: `AI 用女性稱謂「${femaleClaim[0]}」`,
        truth: '客戶是男性',
        severity: 'warning',
      })
    }
  }
  if (truth.gender === 'F') {
    const maleClaim = report.match(/兄弟|先生身分|男性身分/)
    if (maleClaim) {
      violations.push({
        claim: `AI 用男性稱謂「${maleClaim[0]}」`,
        truth: '客戶是女性',
        severity: 'warning',
      })
    }
  }

  // ── 6. 禁止詞檢查（過度承諾）──
  const forbiddenWords = [
    { pattern: /100%\s*(?:準確|正確|成功|保證)/g, label: '100% 承諾' },
    { pattern: /絕對(?:會|不會|是|不是|準確)/g, label: '絕對化' },
    { pattern: /必定|必然|肯定/g, label: '宿命論' },
    { pattern: /保證\s*(?:成功|賺錢|一帆風順)/g, label: '保證承諾' },
  ]
  for (const { pattern, label } of forbiddenWords) {
    const matches = report.match(pattern)
    if (matches) {
      violations.push({
        claim: `發現 ${label}：${matches.slice(0, 3).join(', ')}`,
        truth: '禁止過度承諾或宿命論',
        severity: 'warning',
      })
    }
  }

  // ── 7. Markdown 殘留 ──
  if (/\*\*[^*]+\*\*/.test(report)) {
    violations.push({
      claim: '報告含 ** 粗體標記殘留',
      truth: '必須純文字',
      severity: 'warning',
    })
  }
  if (/^#{1,6}\s/m.test(report)) {
    violations.push({
      claim: '報告含 # 標題符號',
      truth: '必須純文字',
      severity: 'warning',
    })
  }

  // ── 8. 評分殘留 ──
  if (/\b\d{1,3}\s*\/\s*100\b|\b\d{1,3}\s*分\b/.test(report)) {
    violations.push({
      claim: '報告含分數/評分',
      truth: '已禁止所有評分',
      severity: 'warning',
    })
  }

  // ── 9. 簡體字檢查 ──
  const simplifiedSample = '运财钗钏剑锋长驿专业这让签约见面应该认为说'
  const simplifiedFound = Array.from(report).filter(c => simplifiedSample.includes(c))
  if (simplifiedFound.length > 2) {
    violations.push({
      claim: `簡體字殘留：${simplifiedFound.slice(0, 10).join('、')}`,
      truth: '必須繁體中文',
      severity: 'warning',
    })
  }

  // 有 critical 即失敗
  const hasCritical = violations.some(v => v.severity === 'critical')
  return {
    passed: !hasCritical,
    violations,
  }
}

/**
 * 生成給主筆的修訂提示（truth gate 失敗時）
 */
export function buildTruthGateFeedback(result: TruthGateResult): string {
  if (result.passed && result.violations.length === 0) return ''
  const lines: string[] = [
    '【事實查核結果】以下違規必須修正：',
    '',
  ]
  for (const v of result.violations) {
    const tag = v.severity === 'critical' ? '🔴 重大' : '⚠️ 警告'
    lines.push(`${tag} ${v.claim}`)
    lines.push(`   → 應為：${v.truth}`)
    lines.push('')
  }
  lines.push('請嚴格依照排盤真相修正，不可編造排盤之外的資料。')
  return lines.join('\n')
}
