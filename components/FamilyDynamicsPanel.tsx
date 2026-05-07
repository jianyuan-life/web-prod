'use client'

// ==================================================================
// 家族動力全貌圖（G15 家族藍圖專用）
// 三個視覺化：
//   1. 成員五行分佈圖（從 AI 報告/birth_data 推導）
//   2. 角色矩陣（決策者/協調者/執行者/情緒穩定器）
//   3. 關係矩陣（每對成員的共鳴/衝突/中性標記）
// 輸入：成員姓名 + AI 報告全文（做文字分析）
// ==================================================================

import React from 'react'

interface Member {
  name: string
  gender?: string
  role?: string  // 父/母/子/女
}

interface FamilyDynamicsPanelProps {
  members: Member[]
  aiContent: string
}

// 從 AI 報告中抽取某成員的五行主屬性（若報告有明確標註）
// 規則：找「{姓名} 日主 {天干}」或「{姓名} 的日主是 {天干}」
function detectWuxing(memberName: string, aiContent: string): string {
  if (!memberName || !aiContent) return ''
  // 天干對應五行
  const GAN_TO_WUXING: Record<string, string> = {
    甲: '木', 乙: '木',
    丙: '火', 丁: '火',
    戊: '土', 己: '土',
    庚: '金', 辛: '金',
    壬: '水', 癸: '水',
  }
  // 優先匹配「{姓名}...日主{天干}」的模式（60字範圍內）
  const patterns = [
    new RegExp(`${memberName}[^。]{0,60}日主[為是]?\\s*([甲乙丙丁戊己庚辛壬癸])`),
    new RegExp(`${memberName}[^。]{0,30}?([甲乙丙丁戊己庚辛壬癸])金|${memberName}[^。]{0,30}?([甲乙丙丁戊己庚辛壬癸])木|${memberName}[^。]{0,30}?([甲乙丙丁戊己庚辛壬癸])水|${memberName}[^。]{0,30}?([甲乙丙丁戊己庚辛壬癸])火|${memberName}[^。]{0,30}?([甲乙丙丁戊己庚辛壬癸])土`),
    new RegExp(`${memberName}的日主[為是]?\\s*([甲乙丙丁戊己庚辛壬癸])`),
  ]
  for (const re of patterns) {
    const m = aiContent.match(re)
    if (m) {
      const gan = m[1] || m[2] || m[3] || m[4] || m[5] || m[6]
      if (gan && GAN_TO_WUXING[gan]) return GAN_TO_WUXING[gan]
    }
  }
  // 次選：檢查成員周圍的五行詞
  const wuxingPattern = new RegExp(`${memberName}[^。]{0,40}?(金水|木火|金|木|水|火|土)`, 'g')
  const match = aiContent.match(wuxingPattern)
  if (match && match.length > 0) {
    const first = match[0]
    if (first.includes('金水')) return '金水'
    if (first.includes('木火')) return '木火'
    for (const w of ['金', '木', '水', '火', '土']) {
      if (first.includes(w)) return w
    }
  }
  return ''
}

// 判斷每對成員之間的關係類型
function detectPairRelation(memberA: string, memberB: string, aiContent: string): 'harmony' | 'tension' | 'neutral' {
  if (!memberA || !memberB || !aiContent) return 'neutral'
  // 找「A × B」或「A 與 B」的段落（500字範圍）
  const patterns = [
    new RegExp(`${memberA}\\s*[×x]\\s*${memberB}[\\s\\S]{0,500}`),
    new RegExp(`${memberB}\\s*[×x]\\s*${memberA}[\\s\\S]{0,500}`),
    new RegExp(`${memberA}與${memberB}[\\s\\S]{0,500}`),
    new RegExp(`${memberB}與${memberA}[\\s\\S]{0,500}`),
  ]
  let section = ''
  for (const re of patterns) {
    const m = aiContent.match(re)
    if (m) { section = m[0]; break }
  }
  if (!section) return 'neutral'
  // 關鍵詞判斷
  const harmonyKeywords = ['互補', '默契', '同頻', '共鳴', '天然', '珍貴', '滋養', '安定', '療癒', '連結', '互助', '生扶']
  const tensionKeywords = ['衝突', '相沖', '相剋', '摩擦', '拉鋸', '緊張', '對立', '張力', '暴衝', '爆發', '權力', '失控', '碎裂']
  const hScore = harmonyKeywords.filter(k => section.includes(k)).length
  const tScore = tensionKeywords.filter(k => section.includes(k)).length
  if (hScore > tScore + 1) return 'harmony'
  if (tScore > hScore + 1) return 'tension'
  return 'neutral'
}

// 從 AI 報告推導成員角色（決策者/協調者/執行者/情緒穩定器/能量源/新生力）
// v5.10.32 R+8 P0 修(7-LLM 共識「何宥諄角色矩陣空白」、L4 Gemini Vision 抓):
//   原 4 種角色 keyword 對 3 歲幼兒不適用、容易留空白
//   修補:加「能量源 / 新生力」涵蓋孩子角色 + 空陣列 fallback「家庭成員」中性 placeholder
function detectRoles(members: Member[], aiContent: string): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  const roleSections = [
    { role: '決策者', keywords: ['決策者', '拍板人', '主導決策', '做決定'] },
    { role: '協調者', keywords: ['協調者', '和事佬', '橋樑', '翻譯員', '化解衝突', '翻譯官'] },
    { role: '執行者', keywords: ['執行者', '落地執行', '扛起', '實際做'] },
    { role: '情緒穩定器', keywords: ['穩定器', '情緒中心', '情感地基', '安定劑', '後盾'] },
    // v5.10.32 新增:涵蓋孩子 / 新生兒角色(對應 G15 三人合報常見定位)
    { role: '能量源', keywords: ['太陽', '火源', '能量爆發', '動力源', '小太陽', '活火山'] },
    { role: '新生力', keywords: ['新生力', '成長中', '萌芽', '希望', '未來'] },
  ]
  for (const m of members) {
    if (!m.name) continue
    result[m.name] = []
    for (const rs of roleSections) {
      for (const kw of rs.keywords) {
        // 找「{角色關鍵詞}: {姓名}」或「{姓名} ... {角色關鍵詞}」
        const re1 = new RegExp(`${kw}[^\\n]{0,20}${m.name}`)
        const re2 = new RegExp(`${m.name}[^\\n]{0,40}${kw}`)
        if (re1.test(aiContent) || re2.test(aiContent)) {
          if (!result[m.name].includes(rs.role)) {
            result[m.name].push(rs.role)
          }
          break
        }
      }
    }
    // v5.10.32 fallback:若沒命中任何角色、給中性 placeholder「家庭成員」(避免空白角色矩陣)
    if (result[m.name].length === 0) {
      result[m.name].push('家庭成員')
    }
  }
  return result
}

// 五行顏色
const WUXING_COLORS: Record<string, string> = {
  金: '#d4d4d4',
  木: '#5fa671',
  水: '#4a7fb7',
  火: '#d97b6c',
  土: '#c9a84c',
  金水: '#7a9fcf',
  木火: '#b88f5e',
}

// 關係顏色
const RELATION_STYLE = {
  harmony: { stroke: 'rgba(96,165,125,0.8)', label: '共鳴', bg: 'rgba(96,165,125,0.12)' },
  tension: { stroke: 'rgba(217,123,108,0.8)', label: '張力', bg: 'rgba(217,123,108,0.12)' },
  neutral: { stroke: 'rgba(201,168,76,0.4)', label: '中性', bg: 'rgba(201,168,76,0.08)' },
}

export default function FamilyDynamicsPanel({ members, aiContent }: FamilyDynamicsPanelProps) {
  const validMembers = members.filter(m => m.name).slice(0, 8)
  if (validMembers.length < 2) return null

  // ── 1. 五行分佈推導 ──
  const wuxingMap: Record<string, number> = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 }
  const memberWuxing: Record<string, string> = {}
  for (const m of validMembers) {
    const w = detectWuxing(m.name, aiContent)
    memberWuxing[m.name] = w || '未標註'
    if (w === '金水') { wuxingMap['金'] += 0.5; wuxingMap['水'] += 0.5 }
    else if (w === '木火') { wuxingMap['木'] += 0.5; wuxingMap['火'] += 0.5 }
    else if (wuxingMap[w] !== undefined) { wuxingMap[w] += 1 }
  }
  const totalWuxing = Object.values(wuxingMap).reduce((a, b) => a + b, 0)

  // ── 2. 角色矩陣 ──
  const roles = detectRoles(validMembers, aiContent)

  // ── 3. 成員關係矩陣（N×N）──
  const pairRelations: Array<{ a: string; b: string; type: 'harmony' | 'tension' | 'neutral' }> = []
  for (let i = 0; i < validMembers.length; i++) {
    for (let j = i + 1; j < validMembers.length; j++) {
      const a = validMembers[i].name
      const b = validMembers[j].name
      pairRelations.push({ a, b, type: detectPairRelation(a, b, aiContent) })
    }
  }

  // 關係圓環圖座標（成員放在圓周上）
  const radius = 110
  const centerX = 160
  const centerY = 160
  const positions: Record<string, { x: number; y: number; angle: number }> = {}
  for (let i = 0; i < validMembers.length; i++) {
    const angle = (i / validMembers.length) * 2 * Math.PI - Math.PI / 2
    positions[validMembers[i].name] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      angle,
    }
  }

  return (
    <div className="glass rounded-2xl p-6 sm:p-8 mb-8" style={{
      background: 'linear-gradient(135deg, rgba(20,30,50,0.55), rgba(30,40,60,0.4))',
      border: '1px solid rgba(201,168,76,0.25)',
    }}>
      <div className="text-center mb-6">
        <div className="text-gold/60 text-xs tracking-[3px] uppercase mb-2">Family Dynamics</div>
        <h2 className="text-xl sm:text-2xl font-bold text-cream">家族動力全貌圖</h2>
        <p className="text-text-muted/70 text-xs mt-2">由報告內容自動抽取，快速掌握家庭能量結構</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── 左：成員關係網 ── */}
        <div>
          <div className="text-gold/80 text-sm font-semibold mb-3 flex items-center gap-2">
            <span className="inline-block w-1 h-4 bg-gold/70 rounded"></span>
            成員關係網
          </div>
          <div className="flex items-center justify-center" style={{ height: 340 }}>
            <svg width="320" height="320" viewBox="0 0 320 320" aria-label="家族成員關係圖">
              {/* 關係連線 */}
              {pairRelations.map((rel, i) => {
                const pa = positions[rel.a]
                const pb = positions[rel.b]
                if (!pa || !pb) return null
                const style = RELATION_STYLE[rel.type]
                return (
                  <line
                    key={`l${i}`}
                    x1={pa.x} y1={pa.y}
                    x2={pb.x} y2={pb.y}
                    stroke={style.stroke}
                    strokeWidth={rel.type === 'neutral' ? 1 : 2}
                    strokeDasharray={rel.type === 'neutral' ? '3 4' : ''}
                  />
                )
              })}
              {/* 成員圓形節點 */}
              {validMembers.map((m, i) => {
                const pos = positions[m.name]
                if (!pos) return null
                const wx = memberWuxing[m.name]
                const color = WUXING_COLORS[wx] || '#c9a84c'
                return (
                  <g key={`m${i}`}>
                    <circle
                      cx={pos.x} cy={pos.y} r={26}
                      fill={`${color}33`}
                      stroke={color}
                      strokeWidth={2}
                    />
                    <text
                      x={pos.x} y={pos.y - 2}
                      textAnchor="middle"
                      fontSize="16"
                      fontWeight="600"
                      fill="#f2e8d5"
                    >
                      {m.name.slice(0, 1)}
                    </text>
                    <text
                      x={pos.x} y={pos.y + 12}
                      textAnchor="middle"
                      fontSize="8"
                      fill="#c9a84c"
                    >
                      {wx === '未標註' ? '' : wx}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>
          {/* 圖例 */}
          <div className="flex items-center justify-center gap-4 text-[11px] mt-2 text-text-muted/80">
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px]" style={{ background: RELATION_STYLE.harmony.stroke }}></span>共鳴</span>
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px]" style={{ background: RELATION_STYLE.tension.stroke }}></span>張力</span>
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-[2px] border-t border-dashed" style={{ borderColor: RELATION_STYLE.neutral.stroke }}></span>中性</span>
          </div>
        </div>

        {/* ── 右：五行分佈 + 角色矩陣 ── */}
        <div className="space-y-6">
          {/* 五行分佈 */}
          <div>
            <div className="text-gold/80 text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="inline-block w-1 h-4 bg-gold/70 rounded"></span>
              全家五行分佈
            </div>
            {totalWuxing > 0 ? (
              <div className="space-y-2">
                {(['金', '木', '水', '火', '土'] as const).map(w => {
                  const count = wuxingMap[w]
                  const percent = totalWuxing > 0 ? (count / totalWuxing) * 100 : 0
                  const color = WUXING_COLORS[w]
                  return (
                    <div key={w} className="flex items-center gap-3">
                      <span className="w-6 text-sm font-semibold" style={{ color }}>{w}</span>
                      <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                        <div className="h-full transition-all" style={{
                          width: `${percent}%`,
                          background: `linear-gradient(90deg, ${color}99, ${color}44)`,
                        }}></div>
                      </div>
                      <span className="text-xs text-text-muted/80 w-10 text-right">{count.toFixed(1)}人</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-text-muted/60 text-xs italic">報告內無明確五行標註，請參考完整章節</div>
            )}
          </div>

          {/* 角色矩陣 */}
          <div>
            <div className="text-gold/80 text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="inline-block w-1 h-4 bg-gold/70 rounded"></span>
              家庭角色矩陣
            </div>
            <div className="grid grid-cols-2 gap-2">
              {validMembers.map((m, i) => {
                const memberRoles = roles[m.name] || []
                return (
                  <div key={i} className="rounded-lg px-3 py-2" style={{
                    background: 'rgba(201,168,76,0.05)',
                    border: '1px solid rgba(201,168,76,0.15)',
                  }}>
                    <div className="text-cream text-sm font-semibold mb-1">{m.name}</div>
                    {memberRoles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {memberRoles.map((r, j) => (
                          <span key={j} className="text-[10px] px-1.5 py-0.5 rounded" style={{
                            background: 'rgba(201,168,76,0.18)',
                            color: '#c9a84c',
                          }}>{r}</span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[10px] text-text-muted/50">—</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 底部提示 */}
      <div className="mt-6 pt-4 border-t border-gold/10 text-xs text-text-muted/60 text-center">
        此圖由報告內容自動推導。詳細互動分析請閱讀「成員互動關係深度分析」章節。
      </div>
    </div>
  )
}
