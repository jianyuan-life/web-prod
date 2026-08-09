import { buildAgeContext } from '../../../lib/consultation/age-context.ts'
import {
  REQUIRED_AUDITS,
  REQUIRED_TOPICS,
  createParagraphFingerprint,
} from '../../../lib/consultation/report-contract.ts'
import { countCjk, makeNaturalConsultationParagraph } from '../natural-consultation-text.mjs'

const HASH = (character) => `sha256:${character.repeat(64)}`

const TOPIC_LABELS = {
  core_pattern: '核心生活模式',
  strengths_tradeoffs: '優勢與代價',
  stress_response: '壓力下的回應',
  relationships_boundaries: '關係與界線',
  work_learning: '工作與學習',
  money_resources: '金錢與資源',
  body_mind_rhythm: '身心節奏',
  life_timing: '人生階段與時機',
  decision_rules: '決策原則',
  actions_30_90_365: '三十、九十與三百六十五天行動',
  family_rhythm: '家庭節奏',
  decision_power: '決策與參與',
  emotion_stress: '情緒與壓力',
  resources_care: '資源與照顧',
  boundaries: '家庭界線',
  intergenerational_patterns: '世代間的傳承模式',
  interaction_cycles: '互動循環',
  repair_scripts: '修復對話',
  family_meetings: '家庭會議',
}

const SYSTEM_PAIRS = [
  ['八字四柱', '紫微斗數'],
  ['西洋占星', '吀陀占星'],
  ['姓名學', '數字能量學'],
  ['人類圖', '星座心理'],
  ['易經', '九星氣學'],
  ['生肖運勢', '古典占星'],
  ['風水', '生物節律'],
  ['康熙姓名學', '生命靈數'],
  ['八字四柱', '西洋占星'],
  ['紫微斗數', '易經'],
]

export function makeConsultationPdfReport(plan = 'C') {
  if (plan !== 'C' && plan !== 'G15') throw new Error(`unsupported fixture plan: ${plan}`)

  const topics = REQUIRED_TOPICS[plan]
  const people = plan === 'C'
    ? [{ personId: 'person:one', displayName: '授權樣本', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } }]
    : [
        { personId: 'person:one', displayName: '成員甲', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } },
        { personId: 'person:two', displayName: '成員乙', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } },
        { personId: 'person:three', displayName: '成員丙', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } },
      ]
  const birthDates = plan === 'C'
    ? ['1990-01-01']
    : ['1984-03-12', '1990-11-02', '2013-06-15']
  const ageContexts = people.map((person, index) => ({
    personId: person.personId,
    birthDate: birthDates[index],
    ...buildAgeContext({ birthDate: birthDates[index], asOfDate: '2026-08-09' }),
  }))
  const paragraphCountPerChapter = plan === 'G15' ? 20 : 10
  const charactersPerParagraph = 520
  const g15Coverage = [
    ['person:one'],
    ['person:two'],
    ['person:three'],
    ['person:one', 'person:two'],
    ['person:one', 'person:three'],
    ['person:two', 'person:three'],
  ]
  const subjectsByChapter = topics.map((_, index) =>
    plan === 'C' ? ['person:one'] : (g15Coverage[index] ?? people.map((person) => person.personId)),
  )

  const chapterIds = topics.map((topic) => `chapter:${topic}`)
  const factIds = topics.map((topic) => `fact:${topic}:a`)
  const secondaryFactIds = topics.map((topic) => `fact:${topic}:b`)
  const claimIds = topics.map((topic) => `claim:${topic}`)
  const evidenceIds = topics.map((topic) => `evidence:${topic}`)
  const paragraphKinds = ['claim', 'scene', 'evidence', 'action', 'reflection', 'timing']
  const paragraphs = []
  const tailMarkers = []
  const expectedTextMarkers = new Map()

  topics.forEach((topic, chapterIndex) => {
    for (let paragraphIndex = 0; paragraphIndex < paragraphCountPerChapter; paragraphIndex += 1) {
      const seedIndex = chapterIndex * paragraphCountPerChapter + paragraphIndex
      const paragraphId = `paragraph:${topic}-${paragraphIndex + 1}`
      const tailMarker = `請在兩週後回看第${chapterIndex + 1}章第${paragraphIndex + 1}段，再保留真正有幫助的部分`
      const naturalBody = makeNaturalConsultationParagraph(
        seedIndex,
        charactersPerParagraph,
        TOPIC_LABELS[topic],
        { minorSafe: plan === 'G15' },
      )
        .replace(/第\d+組第(\d+)次觀察中，/gu, '第$1個可以核對的情境是：')
        .replace(/；在第(\d+)步裡，/gu, '；接下來的第$1個小步驟是：')
      const text = `${naturalBody}${tailMarker}。`
      const isCanonical = paragraphIndex === 0
      const kind = paragraphKinds[paragraphIndex % paragraphKinds.length]
      tailMarkers.push(tailMarker)
      expectedTextMarkers.set(tailMarker, 1)
      paragraphs.push({
        paragraphId,
        chapterId: chapterIds[chapterIndex],
        kind,
        text,
        newInformationIds: [
          isCanonical ? claimIds[chapterIndex] : `${kind}:${topic}-${paragraphIndex + 1}`,
        ],
        claimIds: [claimIds[chapterIndex]],
        factIds: [factIds[chapterIndex], secondaryFactIds[chapterIndex]],
        subjectPersonIds: subjectsByChapter[chapterIndex],
        ageTopicsByPerson: Object.fromEntries(subjectsByChapter[chapterIndex].map((personId) => {
          const context = ageContexts.find((entry) => entry.personId === personId)
          return [personId, [context.allowedTopics[0]]]
        })),
        fingerprint: createParagraphFingerprint(text),
      })
    }
  })

  const report = {
    schemaVersion: 'consultation-report/v1',
    reportId: `report:pdf-${plan.toLowerCase()}-synthetic`,
    reportVersion: 1,
    plan,
    locale: 'zh-TW',
    asOfDate: '2026-08-09',
    contextHash: HASH('a'),
    people,
    ageContexts,
    sourceManifest: [{
      sourceId: 'source:synthetic',
      kind: 'calculator',
      title: '本地合成排版資料',
      version: 'synthetic/1',
      inputHash: HASH('b'),
      outputHash: HASH('c'),
    }],
    factLedger: {
      status: 'complete',
      partialFailures: [],
      entries: topics.flatMap((topic, index) => ['a', 'b'].map((suffix) => ({
        factId: suffix === 'a' ? factIds[index] : secondaryFactIds[index],
        personIds: people.map((person) => person.personId),
        kind: 'calculator_direct',
        evidenceClass: 'traditional_interpretation',
        sourceId: 'source:synthetic',
        sourcePath: `analyses[system=${SYSTEM_PAIRS[index][suffix === 'a' ? 0 : 1]}]`,
        value: `合成資料 ${topic} ${suffix}`,
        asOfDate: '2026-08-09',
        limitations: ['只用於長文排版與完整性測試'],
      }))),
    },
    claimLedger: {
      status: 'complete',
      entries: topics.map((topic, index) => ({
        claimId: claimIds[index],
        chapterId: chapterIds[index],
        canonicalParagraphId: `paragraph:${topic}-1`,
        subjectPersonIds: subjectsByChapter[index],
        ageTopicByPerson: Object.fromEntries(subjectsByChapter[index].map((personId) => {
          const context = ageContexts.find((entry) => entry.personId === personId)
          return [personId, context.allowedTopics[0]]
        })),
        supportingFactIds: [factIds[index], secondaryFactIds[index]],
        opposingFactIds: [],
        supportingSystemIds: SYSTEM_PAIRS[index],
        opposingSystemIds: [],
        evidenceStatus: 'convergent',
        evidenceIds: [evidenceIds[index]],
        applicability: '可在日常生活中核對時使用',
        invalidation: '與當事人實際經驗不符時不採用',
        conflictsWithClaimIds: [],
        status: 'approved',
      })),
    },
    chapters: topics.map((topic, index) => ({
      chapterId: chapterIds[index],
      topicIds: [topic],
      title: `第 ${index + 1} 章 ${TOPIC_LABELS[topic]}`,
      conclusionSubtitle: `先看「${TOPIC_LABELS[topic]}」中可以回到生活核對的部分`,
      firstReadParagraphId: `paragraph:${topic}-1`,
      paragraphIds: Array.from(
        { length: paragraphCountPerChapter },
        (_, paragraphIndex) => `paragraph:${topic}-${paragraphIndex + 1}`,
      ),
      claimIds: [claimIds[index]],
      status: 'complete',
    })),
    paragraphs,
    readingLayers: {
      quick_30s: {
        items: claimIds.slice(0, 3).map((claimId, index) => ({
          claimId,
          conclusion: `先留意生活線索 ${index + 1}`,
          selfCheck: `回想最近三次相似情境 ${index + 1}`,
        })),
      },
      route_3m: {
        chapters: chapterIds.map((chapterId, index) => ({
          chapterId,
          conclusionSubtitle: `先看「${TOPIC_LABELS[topics[index]]}」中可以回到生活核對的部分`,
          firstReadParagraphId: `paragraph:${topics[index]}-1`,
          readingLoad: 'deep',
        })),
      },
      deep_read: { chapterIds },
      evidence_appendix: {
        entries: evidenceIds.map((evidenceId, index) => ({
          evidenceId,
          label: `第 ${index + 1} 章參考來源`,
          type: 'traditional_interpretation',
          factIds: [factIds[index], secondaryFactIds[index]],
          claimIds: [claimIds[index]],
          sourceIds: ['source:synthetic'],
          limitations: ['請以當事人實際經驗與家庭對話為準'],
        })),
      },
    },
    systemCoverage: {
      availableTraditionalSystemIds: [...new Set(topics.flatMap((_, index) => SYSTEM_PAIRS[index]))].sort(),
      usedSystemIds: [...new Set(topics.flatMap((_, index) => SYSTEM_PAIRS[index]))].sort(),
      omittedSystems: [],
    },
    chapterJobs: chapterIds.map((chapterId, index) => ({
      jobId: `job:${topics[index]}`,
      chapterId,
      idempotencyKey: `pdf:${plan}:${topics[index]}`,
      status: 'succeeded',
      attempt: 1,
      promptVersionHash: HASH('d'),
      inputHash: HASH('e'),
      outputHash: HASH('f'),
    })),
    audits: REQUIRED_AUDITS.map((kind, index) => ({
      kind,
      status: 'passed',
      artifactHash: `sha256:${String(index + 1).padStart(64, '0')}`,
    })),
    completeness: {
      status: 'complete',
      requiredChapterIds: chapterIds,
      requiredClaimIds: claimIds,
      requiredFactIds: [...factIds, ...secondaryFactIds],
      missingData: [],
      partialFailures: [],
    },
  }

  return {
    report,
    expectedTextMarkers,
    tailMarkers,
    expectedBodyCjk: paragraphs.reduce((sum, paragraph) => sum + countCjk(paragraph.text), 0),
  }
}
