// C-v6 十二項機檢(v5.10.481 從 steps.ts qualityGate 抽出共用)
// 供 workflow qualityGate 與 fallback route 用同一把尺;fallback 端硬項([軟性] 以外)不過=fail closed,
// 防 flag-on 時 workflow 掛掉、fallback 出「殘缺 v6」給付費客戶(Codex 反例 P0、2026-08-02 E2E 實證 6/12)。
// 黑名單 SSOT=prompts/c_plan_v6.ts;規格=jianyuan-hq goal_2026-08-01 check_v5.py 12 閘。
import { V6_BODY_TERM_BLACKLIST } from '@/prompts/c_plan_v6'

export function v6CMachineWarnings(reportContent: string): string[] {
  const warnings: string[] = []
    const C_V6_ABSOLUTE_WORDS = [
      '一定會', '必然', '註定', '絕對不能', '永遠不會',
      '百分之百', '極致', '頂峰', '無法改變', '一輩子都',
    ]
    const C_V6_FEAR_WORDS = ['大凶', '血光', '劫數', '絕症', '壽元', '凶煞', '破敗']
    const C_V6_INTERNAL_MARKERS = ['截圖級洞察', '判決句', '巴納姆']

    // 附錄必須是 Markdown 標題;第一個附錄標題之前才是正文。
    // 邊界從寬認定(附錄|附錄:xxx|附錄｜xxx 等變體都算),名稱另由 prompt 約束——切錯邊界的代價(附錄術語被當正文掃)遠大於名稱寬鬆
    const appendixHeadingPattern = /^#{1,6}\s*附錄(?:\s*$|\s*[：:、｜|—\-（(].*$)/gm
    const appendixMatches = Array.from(reportContent.matchAll(appendixHeadingPattern))
    const v6Body = appendixMatches.length > 0
      ? reportContent.slice(0, appendixMatches[0].index)
      : reportContent

    // 1. 正文術語必須為零;附錄內容豁免。(黑名單 SSOT = prompts/c_plan_v6.ts)
    const termHits = V6_BODY_TERM_BLACKLIST.flatMap((term) => {
      const count = v6Body.split(term).length - 1
      return count > 0 ? [`${term}×${count}`] : []
    })
    if (termHits.length > 0) {
      warnings.push(`[C-v6 G1 正文術語] 命中 ${termHits.slice(0, 20).join('、')}`)
    }

    // 2-4. 絕對化、恐懼詞、內部代號掃全文。
    for (const [gate, words] of [
      ['G4 絕對化', C_V6_ABSOLUTE_WORDS],
      ['G5 恐懼詞', C_V6_FEAR_WORDS],
      ['G3 內部代號', C_V6_INTERNAL_MARKERS],
    ] as const) {
      const hits = words.filter((word) => reportContent.includes(word))
      if (hits.length > 0) {
        warnings.push(`[C-v6 ${gate}] 命中 ${hits.join('、')}`)
      }
    }

    // 5. 開卷「閱讀之前」聲明後、附錄前,正文不得再出現免責語。
    // 聲明結束點=聲明起點後的下一個 Markdown 標題(不用固定字數,避免長短聲明的邊界誤差)
    const openingMatch = /閱讀之前[:：]/.exec(v6Body)
    let disclaimerZone = v6Body
    if (openingMatch) {
      const afterOpening = v6Body.slice(openingMatch.index)
      const nextHeading = /\n#{1,6}\s/.exec(afterOpening)
      disclaimerZone = nextHeading
        ? v6Body.slice(openingMatch.index + nextHeading.index)
        : v6Body.slice(openingMatch.index + 400)
    }
    const disclaimerHits = disclaimerZone.match(/不構成|不取代|僅供參考|免責條款|不保證/g) || []
    if (disclaimerHits.length > 0) {
      warnings.push(`[C-v6 G7 正文免責] 開卷聲明後仍命中 ${disclaimerHits.length} 次:${disclaimerHits.slice(0, 5).join('、')}`)
    }

    // 6-9. 結構標記(線上版:原型稱號用通用樣式「你是「…的人」」,不綁樣本專名)。
    const structureRules: Array<[string, RegExp]> = [
      ['開卷三卡', /你們?最該知道的三件事/],
      ['原型稱號', /\*\*原型稱號[:：]\*\*\s*「[^」]{2,20}」/],  // 機器錨:prompt 端強制同格式(c_plan_v6),不猜自然語句
      ['收卷自主聲明', /盤看得到[你他她]們?的傾向/],
      ['章末出處錨', /出處見附錄|盤面出處/],
    ]
    for (const [name, pattern] of structureRules) {
      if (!pattern.test(reportContent)) {
        warnings.push(`[C-v6 結構] 缺少${name}`)
      }
    }

    // 10. 全書至少二十個讀者核對點。
    const v6CheckCount = (reportContent.match(/核\s*對|如果你回想|你來打分|由你核對/g) || []).length
    if (v6CheckCount < 20) {
      warnings.push(`[C-v6 G12 核對框] 共 ${v6CheckCount} 個,低於 20 個下限`)
    }

    // 11. 附錄標題必須且只能出現一次(老闆鐵律:唯一附錄)。
    if (appendixMatches.length !== 1) {
      warnings.push(`[C-v6 唯一附錄] 附錄標題共 ${appendixMatches.length} 個,必須恰好 1 個`)
    }

    // 12. 正文漢字保底(非阻斷,沿 check_v5 warn 語意)。
    const v6HanCount = (v6Body.match(/[一-鿿]/g) || []).length
    if (v6HanCount < 12000) {
      warnings.push(`[軟性][C-v6 字數] 正文漢字 ${v6HanCount},低於 12,000 保底`)
    }
  return warnings
}
