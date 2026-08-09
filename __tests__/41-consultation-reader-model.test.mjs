import { suite, test, assert, assertEqual, done } from './harness.mjs'
import {
  buildConsultationReaderModel,
  buildLegacyDocument,
} from '../components/consultation/reader/reader-model.ts'

suite('C/G15 consultation reader model')

function makeStructuredLoadResult(plan = 'G15') {
  return {
    ok: true,
    mode: 'structured',
    plan,
    report: {
      schemaVersion: 'consultation-report/v1',
      reportId: 'report:reader-model',
      reportVersion: 1,
      plan,
      locale: 'zh-TW',
      asOfDate: '2026-08-09',
      contextHash: `sha256:${'a'.repeat(64)}`,
      people: [
        { personId: 'person:one', displayName: '成員一', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } },
        { personId: 'person:two', displayName: '成員二', authorization: 'granted', birthTime: { status: 'exact', confidence: 'standard', affectedSystems: [] } },
      ],
      ageContexts: [
        {
          personId: 'person:one',
          birthDate: '1990-01-01',
          asOfDate: '2026-08-09',
          ageYears: 36,
          stage: 'early_mid',
          readerMode: 'self',
          timeHorizonEndAge: 60,
          allowedTopics: ['major_choices'],
          prohibitedTopics: ['assume_gender_role'],
        },
        {
          personId: 'person:two',
          birthDate: '2010-06-15',
          asOfDate: '2026-08-09',
          ageYears: 16,
          stage: 'teen',
          readerMode: 'co-read',
          timeHorizonEndAge: 30,
          allowedTopics: ['identity'],
          prohibitedTopics: ['parental_surveillance'],
        },
      ],
      sourceManifest: [{
        sourceId: 'source:calculator',
        kind: 'calculator',
        title: '排盤原始輸出',
        version: '1.0.0',
        inputHash: `sha256:${'b'.repeat(64)}`,
        outputHash: `sha256:${'c'.repeat(64)}`,
      }],
      factLedger: {
        status: 'complete',
        partialFailures: [],
        entries: ['a', 'b'].map((suffix) => ({
          factId: `fact:one:${suffix}`,
          personIds: ['person:one', 'person:two'],
          kind: 'calculator_direct',
          sourceId: 'source:calculator',
          sourcePath: `analyses[system=reader-${suffix}]`,
          value: `stored value ${suffix}`,
          asOfDate: '2026-08-09',
          evidenceClass: 'traditional_interpretation',
          limitations: ['只作討論起點'],
        })),
      },
      claimLedger: {
        status: 'complete',
        entries: [{
          claimId: 'claim:one',
          chapterId: 'chapter:one',
          canonicalParagraphId: 'paragraph:one',
          subjectPersonIds: ['person:one', 'person:two'],
          ageTopicByPerson: { 'person:one': 'major_choices', 'person:two': 'identity' },
          supportingFactIds: ['fact:one:a', 'fact:one:b'],
          opposingFactIds: [],
          supportingSystemIds: ['reader-a', 'reader-b'],
          opposingSystemIds: [],
          evidenceStatus: 'convergent',
          evidenceIds: ['evidence:one'],
          applicability: '雙方都能從日常經驗核對時採用',
          invalidation: '任一成員的經驗不符時暫停採用',
          conflictsWithClaimIds: [],
          status: 'approved',
        }],
      },
      chapters: [{
        chapterId: 'chapter:one',
        topicIds: ['family_rhythm'],
        title: '家庭節奏',
        conclusionSubtitle: '先分清每個人的恢復速度',
        firstReadParagraphId: 'paragraph:one',
        paragraphIds: ['paragraph:one'],
        claimIds: ['claim:one'],
        status: 'complete',
      }],
      paragraphs: [{
        paragraphId: 'paragraph:one',
        chapterId: 'chapter:one',
        kind: 'claim',
        text: '這是報告原本保存的段落。',
        newInformationIds: ['claim:one'],
        claimIds: ['claim:one'],
        factIds: ['fact:one:a', 'fact:one:b'],
        subjectPersonIds: ['person:one', 'person:two'],
        ageTopicsByPerson: { 'person:one': ['major_choices'], 'person:two': ['identity'] },
        fingerprint: 'sha256:paragraph',
      }],
      readingLayers: {
        quick_30s: {
          items: [
            { claimId: 'claim:one', conclusion: '第一個原存結論', selfCheck: '先問雙方感受是否一致' },
            { claimId: 'claim:two', conclusion: '第二個原存結論', selfCheck: '觀察一週再判斷' },
            { claimId: 'claim:three', conclusion: '第三個原存結論', selfCheck: '有反例就停止套用' },
          ],
        },
        route_3m: {
          chapters: [{
            chapterId: 'chapter:one',
            conclusionSubtitle: '先分清每個人的恢復速度',
            firstReadParagraphId: 'paragraph:one',
            readingLoad: 'focused',
          }],
        },
        deep_read: { chapterIds: ['chapter:one'] },
        evidence_appendix: {
          entries: [{
            evidenceId: 'evidence:one',
            label: '家庭節奏的原始依據',
            type: 'traditional_interpretation',
            factIds: ['fact:one:a', 'fact:one:b'],
            claimIds: ['claim:one'],
            sourceIds: ['source:calculator'],
            limitations: ['只作討論起點'],
          }],
        },
      },
      chapterJobs: [],
      audits: [],
      completeness: {
        status: 'complete',
        requiredChapterIds: ['chapter:one'],
        requiredClaimIds: ['claim:one'],
        requiredFactIds: ['fact:one:a', 'fact:one:b'],
        missingData: [],
        partialFailures: [],
      },
    },
  }
}

test('structured reader preserves the four stored reading layers without inventing content', () => {
  const source = makeStructuredLoadResult()
  const model = buildConsultationReaderModel(source)

  assertEqual(model.mode, 'structured')
  assertEqual(model.plan, 'G15')
  assertEqual(JSON.stringify(model.layerOrder), JSON.stringify([
    'quick_30s',
    'route_3m',
    'deep_read',
    'evidence_appendix',
  ]))
  assertEqual(model.quickItems[0].conclusion, '第一個原存結論')
  assertEqual(model.routeItems[0].conclusionSubtitle, '先分清每個人的恢復速度')
  assertEqual(model.routeItems[0].targetId, model.chapters[0].targetId)
  assert(/^[a-z0-9-]+$/u.test(model.routeItems[0].targetId), '章節錨點必須可直接用於 URL fragment')
  assertEqual(model.chapters[0].paragraphs[0].text, '這是報告原本保存的段落。')
  assertEqual(model.evidence[0].label, '家庭節奏的原始依據')
  assertEqual(model.evidence[0].applicability[0], '雙方都能從日常經驗核對時採用')
  assertEqual(model.evidence[0].invalidation[0], '任一成員的經驗不符時暫停採用')
  assertEqual(model.sources[0].title, '排盤原始輸出')
})

test('G15 participant labels stay neutral and age context is copied only from the contract', () => {
  const model = buildConsultationReaderModel(makeStructuredLoadResult())

  assertEqual(model.people[0].relationshipLabel, '成員')
  assertEqual(model.people[1].relationshipLabel, '成員')
  assertEqual(model.people[0].age.ageYears, 36)
  assertEqual(model.people[1].age.ageYears, 16)
  assertEqual(model.people[1].age.readerMode, 'co-read')
  assert(!JSON.stringify(model.people).includes('父親'), '不得由排序推論父親')
  assert(!JSON.stringify(model.people).includes('母親'), '不得由排序推論母親')
})

test('legacy document derives navigation only from literal headings and keeps HTML as text', () => {
  const document = buildLegacyDocument([
    '# 原文總覽',
    '',
    '第一段原文。',
    '',
    '## 重複標題',
    '<script>alert("literal")</script>',
    '## 重複標題',
    '- 原文項目',
  ].join('\n'))

  assertEqual(document.headings.length, 3)
  assertEqual(document.headings[0].text, '原文總覽')
  assert(document.headings[1].id !== document.headings[2].id, '重複標題必須有不同錨點')
  const scriptBlock = document.blocks.find((block) => block.text.includes('<script>'))
  assert(scriptBlock, 'HTML 字串必須保留為可見原文')
  assert(!('html' in scriptBlock), '不得產生可注入的 HTML 欄位')
})

test('consecutive legacy list items remain one semantic list', () => {
  const document = buildLegacyDocument('- 第一項\n- 第二項\n\n1. 第一步\n2. 第二步')
  const lists = document.blocks.filter((block) => block.kind === 'list')

  assertEqual(lists.length, 2)
  assertEqual(JSON.stringify(lists[0].items), JSON.stringify(['第一項', '第二項']))
  assertEqual(lists[0].ordered, false)
  assertEqual(JSON.stringify(lists[1].items), JSON.stringify(['第一步', '第二步']))
  assertEqual(lists[1].ordered, true)
})

test('legacy reader explicitly leaves summary, facts, age, and actions unavailable', () => {
  const model = buildConsultationReaderModel({
    ok: true,
    mode: 'legacy_full_text',
    plan: 'C',
    content: '# 原文第一章\n\n只顯示保存的原文。',
    fullCharts: null,
    narrativeSummary: null,
    provenance: { source: 'paid_reports', contentField: 'report_result.ai_content' },
    asOf: { status: 'unknown', value: null },
  })

  assertEqual(model.mode, 'legacy_full_text')
  assertEqual(model.quickItems.length, 0)
  assertEqual(model.routeItems[0].title, '原文第一章')
  assertEqual(model.people.length, 0)
  assertEqual(model.evidence.length, 0)
  assertEqual(model.legacyNotice.summaryAvailable, false)
  assertEqual(model.legacyNotice.ageContextAvailable, false)
  assertEqual(model.legacyNotice.factLedgerAvailable, false)
  assert(!JSON.stringify(model).includes('三個行動'), '不得替舊報告生成三個行動')
})

done()
