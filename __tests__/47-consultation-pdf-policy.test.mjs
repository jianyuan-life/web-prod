import { suite, test, assert, assertEqual, done } from './harness.mjs'
import { makeConsultationPdfReport } from './fixtures/consultation-pdf/make-report.mjs'
import { makeNaturalConsultationParagraph } from './fixtures/natural-consultation-text.mjs'
import { createParagraphFingerprint } from '../lib/consultation/report-contract.ts'
import { buildAgeContext } from '../lib/consultation/age-context.ts'

let pdfPolicy
let loadError
try {
  pdfPolicy = await import('../lib/consultation/pdf/policy.ts')
} catch (error) {
  loadError = error
}

suite('C／G15 consultation PDF 完整性與安全政策')

test('完整 C 與三人 G15 契約可建立 PDF 模型，且原文與人物名稱不改寫', () => {
  assert(pdfPolicy, `PDF policy 無法載入: ${loadError?.message || 'unknown error'}`)
  for (const plan of ['C', 'G15']) {
    const { report } = makeConsultationPdfReport(plan)
    const model = pdfPolicy.createConsultationPdfModel(report)
    assertEqual(model.plan, plan)
    assert(new RegExp(`^${plan}-[A-F0-9]{10}$`, 'u').test(model.reportNumber))
    assert(!model.reportNumber.includes('report'))
    assert(!model.reportNumber.includes(report.reportId))
    assertEqual(model.asOfDate, report.asOfDate)
    assertEqual(model.people.join('／'), report.people.map((person) => person.displayName).join('／'))
    assertEqual(
      model.chapters.flatMap((chapter) => chapter.paragraphs.map((paragraph) => paragraph.text)).join(''),
      report.paragraphs.map((paragraph) => paragraph.text).join(''),
      '正文不得截斷、清洗或改寫',
    )
  }
})

test('缺必要 audit 的 partial contract 不得產生 PDF', () => {
  const { report } = makeConsultationPdfReport('C')
  report.audits = report.audits.slice(1)
  let error
  try {
    pdfPolicy.createConsultationPdfModel(report)
  } catch (caught) {
    error = caught
  }
  assert(error, '不完整契約應 fail closed')
  assertEqual(error.name, 'ConsultationPdfPolicyError')
})

test('HTML、Markdown、emoji 與 control residue 一律拒絕，不做靜默改寫', () => {
  const candidates = [
    { field: 'paragraph', value: '<script>alert(1)</script>原文' },
    { field: 'displayName', value: '<b>成員甲</b>' },
    { field: 'sourceTitle', value: '參考<br>來源' },
    { field: 'paragraph', value: '## 標題殘留' },
    { field: 'paragraph', value: '原文🌟' },
    { field: 'paragraph', value: '原文\u0000內容' },
  ]

  for (const candidate of candidates) {
    const { report } = makeConsultationPdfReport('C')
    if (candidate.field === 'paragraph') {
      report.paragraphs[0].text = candidate.value
      report.paragraphs[0].fingerprint = createParagraphFingerprint(candidate.value)
    } else if (candidate.field === 'displayName') {
      report.people[0].displayName = candidate.value
    } else {
      report.sourceManifest[0].title = candidate.value
    }
    let error
    try {
      pdfPolicy.createConsultationPdfModel(report)
    } catch (caught) {
      error = caught
    }
    assert(error, `${candidate.field} 的不安全文字應被拒絕`)
    assertEqual(error.name, 'ConsultationPdfPolicyError')
  }
})

test('未成年與家庭成員的中性原文完整保留', () => {
  const { report } = makeConsultationPdfReport('G15')
  const neutral = `這位年輕成員可以先描述自己的需要，不需要替大人處理家庭衝突；家中每個人都先說自己的感受，再一起找可以試做一週的小改變。${makeNaturalConsultationParagraph(9_901, 500, '家庭互動', { minorSafe: true })}`
  report.paragraphs[0].text = neutral
  report.paragraphs[0].fingerprint = createParagraphFingerprint(neutral)

  const model = pdfPolicy.createConsultationPdfModel(report)
  assertEqual(model.chapters[0].paragraphs[0].text, neutral)
  assertEqual(model.people.join('／'), '成員甲／成員乙／成員丙')
})

test('PDF 年齡階段使用共用 age-context 鍵名，61 歲以上顯示熟齡期', () => {
  const { report } = makeConsultationPdfReport('G15')
  const model = pdfPolicy.createConsultationPdfModel(report)
  assertEqual(model.peopleDetails[0].stageLabel, '壯年期')
  assertEqual(model.peopleDetails[1].stageLabel, '壯年前期')
  assertEqual(model.peopleDetails[2].stageLabel, '青少年期')
  assert(!model.peopleDetails.some((person) => person.stageLabel === '生命階段'))

  const elderFixture = makeConsultationPdfReport('C')
  elderFixture.report.ageContexts[0] = {
    personId: elderFixture.report.people[0].personId,
    birthDate: '1950-01-01',
    ...buildAgeContext({ birthDate: '1950-01-01', asOfDate: elderFixture.report.asOfDate }),
  }
  const elderTopic = elderFixture.report.ageContexts[0].allowedTopics[0]
  elderFixture.report.claimLedger.entries.forEach((claim) => {
    claim.ageTopicByPerson['person:one'] = elderTopic
  })
  elderFixture.report.paragraphs.forEach((paragraph) => {
    paragraph.ageTopicsByPerson['person:one'] = [elderTopic]
  })
  const elderModel = pdfPolicy.createConsultationPdfModel(elderFixture.report)
  assertEqual(elderModel.peopleDetails[0].stageLabel, '熟齡期')
  assert(!JSON.stringify(elderModel.peopleDetails).includes('elder'))
})

test('回應 headers 固定 private no-store、attachment、noindex，且不含 access token', () => {
  const { report } = makeConsultationPdfReport('C')
  const token = 'private-access-token-that-must-not-leak'
  const headers = pdfPolicy.buildConsultationPdfHeaders(report, 123456)
  const serialized = JSON.stringify(headers)
  assertEqual(headers['Content-Type'], 'application/pdf')
  assert(/attachment/iu.test(headers['Content-Disposition']))
  assert(!headers['Content-Disposition'].includes('report:'))
  assert(!headers['Content-Disposition'].includes('pdf-c-synthetic'))
  assert(/private/iu.test(headers['Cache-Control']) && /no-store/iu.test(headers['Cache-Control']))
  assert(/noindex/iu.test(headers['X-Robots-Tag']))
  assertEqual(headers['Content-Length'], '123456')
  assert(!serialized.includes(token))
})

done()
