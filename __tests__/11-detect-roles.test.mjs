// detectRoles 算法 unit test(對應 lesson #093 v5.10.93 strict pattern 修)
// 避免 v5.10.32 模糊 keyword regex 跨人名 bug(何宥諄 3 歲被亂掛協調者)
import { suite, test, assert, done } from './harness.mjs'

// 純 JS 重現 detectRoles strict pattern 邏輯
function detectRoles(members, aiContent) {
  const result = {}
  const ALL_ROLES = ['決策者', '協調者', '執行者', '情緒穩定器', '能量源', '新生力']

  for (const m of members) {
    if (!m.name) continue
    result[m.name] = []

    for (const role of ALL_ROLES) {
      const strictPatterns = [
        new RegExp(`${role}\\s*[:：]\\s*[^。！？\\n]{0,30}?${m.name}`),
        new RegExp(`${m.name}\\s*[:：]\\s*${role}`),
        new RegExp(`${m.name}[是為]${role}`),
        new RegExp(`${m.name}.{0,8}?(?:扛了?|擔任|定位[為是]?|角色[為是]?|擔當)${role}`),
      ]
      for (const re of strictPatterns) {
        if (re.test(aiContent)) {
          if (!result[m.name].includes(role)) {
            result[m.name].push(role)
          }
          break
        }
      }
    }
    if (result[m.name].length === 0) {
      result[m.name].push('家庭成員')
    }
  }
  return result
}

suite('detectRoles strict pattern 測試(lesson #093)')

const members = [{ name: '何宣逸' }, { name: '何紀萳' }, { name: '何宥諄' }]

test('strict mapping「決策者:何宣逸」', () => {
  const r = detectRoles(members, '決策者：何宣逸\n協調者：何紀萳\n執行者：也是何紀萳')
  assert(r['何宣逸'].includes('決策者'), `何宣逸 expected 決策者, got ${r['何宣逸']}`)
  assert(r['何紀萳'].includes('協調者'), `何紀萳 expected 協調者, got ${r['何紀萳']}`)
  assert(r['何紀萳'].includes('執行者'), `何紀萳 expected 執行者(L455「也是何紀萳」), got ${r['何紀萳']}`)
})

test('何宥諄 3 歲、無 strict mapping → fallback「家庭成員」', () => {
  const r = detectRoles(members, '決策者：何宣逸\n協調者：何紀萳\n執行者：何紀萳')
  assert(r['何宥諄'].length === 1 && r['何宥諄'][0] === '家庭成員', `何宥諄 expected [家庭成員], got ${r['何宥諄']}`)
})

test('「{name}是{role}」格式', () => {
  const r = detectRoles(members, '何宣逸是決策者、何紀萳是協調者')
  assert(r['何宣逸'].includes('決策者'), '何宣逸=決策者')
  assert(r['何紀萳'].includes('協調者'), '何紀萳=協調者')
})

test('「{name}扛了{role}」格式(單一 role)', () => {
  const r = detectRoles(members, '何紀萳扛了協調者一個角色、何宣逸擔任決策者')
  assert(r['何紀萳'].includes('協調者'), '扛了協調者')
  assert(r['何宣逸'].includes('決策者'), '擔任決策者')
})

test('避跨人名 bug:模糊「協調者...何宥諄」不應掛何宥諄(strict 不誤抓)', () => {
  // v5.10.32 原模糊 regex `${kw}[^\\n]{0,20}${name}` 會誤抓
  // strict pattern 要求明確 mapping、「則是」非「是/為」、不 match → fallback 家庭成員
  const r = detectRoles(members, '何紀萳常常當協調者、何宥諄則是執行者')
  assert(!r['何宥諄'].includes('協調者'), `何宥諄 不應掛協調者(strict 不誤抓)、got ${r['何宥諄']}`)
  // 「則是執行者」strict 不認、fallback 家庭成員(寧少勿錯、對應 v5.10.93 設計)
  assert(r['何宥諄'][0] === '家庭成員', `何宥諄 fallback 家庭成員(strict 寧少勿錯)、got ${r['何宥諄']}`)
})

test('無任何 strict mapping 全 fallback', () => {
  const r = detectRoles(members, '這家人很和諧、互相支持')
  assert(r['何宣逸'][0] === '家庭成員' && r['何紀萳'][0] === '家庭成員' && r['何宥諄'][0] === '家庭成員', '全 fallback 家庭成員')
})

done()
