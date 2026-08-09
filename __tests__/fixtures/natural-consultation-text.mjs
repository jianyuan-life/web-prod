const OPENINGS = [
  '當你面對新的選擇時', '在工作節奏忽然加快時', '與家人討論重要安排時', '感到壓力逐漸累積時',
  '需要分配時間與資源時', '在人際界線變得模糊時', '準備學習陌生技能時', '生活進入轉換階段時',
  '當意見沒有立即共識時', '回顧最近幾次經驗時', '需要照顧自己與他人時', '面對金錢和安全感時',
  '準備向重要的人提出請求時', '原有安排突然需要改變時', '同時收到多個不同期待時', '需要替孩子保留成長空間時',
  '長輩與晚輩的想法有落差時', '一段合作進入重新分工時', '休息與責任彼此拉扯時', '想把關心說得更清楚時',
  '需要判斷哪些承諾能做到時', '發現自己又回到舊習慣時', '對未來方向感到猶豫時', '希望重新建立信任與安全時',
]
const OBSERVATIONS = [
  '可以先分辨事實、感受與猜測，不急著把第一個念頭當成答案',
  '你通常會先觀察整體氣氛，再決定是否直接表達自己的需要',
  '有些優勢在平穩情境很有幫助，但過度使用也可能變成負擔',
  '真正需要留意的是反覆出現的生活模式，而不是單次事件的好壞',
  '家庭成員的步調不同，並不等於誰比較正確，而是需要更清楚的協調',
  '若身體已經出現疲累訊號，延後決定往往比勉強撐住更合適',
  '你可以把抽象感受換成具體例子，讓彼此知道問題發生在什麼時候',
  '先確認目標與限制，通常能減少反覆修改和無效消耗',
  '這項觀察只有在實際經驗能核對時才採用，不符合就應該放下',
  '與其追求一次做對，不如建立能夠回看、修正和再嘗試的小步驟',
  '當責任同時出現時，先排出必要、重要與可以延後的順序會更清楚',
  '如果情緒仍在高點，先讓對話暫停，反而比較能保留關係與判斷力',
  '真正的界線不是拒絕所有人，而是把自己能承擔的範圍說得明白',
  '同一句話在不同情境可能有不同意思，所以需要回到當時的細節核對',
  '孩子需要的是被理解與被引導，不應替大人承擔修復家庭的責任',
  '金錢安排要回到收入、支出與風險承受度，不能由單一象徵直接決定',
  '關係中的沉默有時是在整理感受，也可能是害怕衝突，需要耐心確認',
  '能夠長期維持的改變，通常來自清楚而小的練習，不是突然的決心',
  '當彼此都想保護家人時，差異常出現在方法，而不是關心的程度',
  '把責任寫下來能看見誰負擔過多，也能讓重新分工有具體起點',
  '過去的經驗可以提供線索，但不代表未來只能沿著相同道路發展',
  '如果一項解讀造成恐懼或羞恥，就應先停下來，重新確認它是否有幫助',
  '每個人的成熟速度與表達方式不同，對話需要配合年齡和生活處境',
  '不確定並不表示失敗，它提醒你還需要更多觀察、資訊與現實回饋',
]
const ACTIONS = [
  '接下來可以記錄三次相似情境，觀察觸發點、你的回應以及結果',
  '先用一句話說明自己的需要，再邀請對方補充他的顧慮與期待',
  '為這個選擇設定一個可回頭檢查的日期，屆時再用新資訊調整',
  '把大目標拆成一週能完成的小行動，並保留休息和緩衝時間',
  '遇到不確定時，可以詢問可信任的專業人士，不必只靠命理解讀',
  '在家庭會議中先確認共同目標，再討論每個人願意承擔的部分',
  '若同一問題持續沒有改善，應重新檢查假設，而不是責怪自己',
  '可以先試行兩週，再根據實際感受與可觀察結果決定是否延續',
  '重要決策請同時考慮現實條件、專業意見與自己的價值排序',
  '把界線說得具體一些，例如時間、金額、頻率與可以接受的範圍',
  '每次只調整一個變項，會比同時改變所有安排更容易看出效果',
  '最後回到日常生活核對，保留不同解釋，也允許答案隨經驗改變',
  '先把最擔心的結果寫下來，再區分哪些能準備、哪些只是目前的想像',
  '邀請每位家人各說一件希望保留與一件希望調整的事，先不急著辯論',
  '為休息安排明確時段，並觀察精神、睡眠與專注是否因此逐步改善',
  '把財務問題交由合格專業人士評估，命理內容只作為自我反思的提示',
  '和孩子談未來時多提供選擇與探索，不把任何職業或關係寫成固定答案',
  '若對話反覆升高，可以約定暫停暗號，等雙方平穩後再回到同一議題',
  '先確認彼此使用的詞語代表什麼，避免把不同定義誤認為立場衝突',
  '每週安排一次短回顧，只討論事實、感受、需要與下一個小行動',
  '把需要外界協助的部分列出來，尋找醫療、法律或心理等適當資源',
  '在承諾之前先檢查時間與能力，誠實說明限制比事後失約更能建立信任',
  '選一個低風險情境練習新做法，成功後再逐步帶到更困難的場景',
  '三十天後回看紀錄，保留有效方法，刪除沒有幫助或增加壓力的安排',
]

export function countCjk(text) {
  return text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/gu)?.length ?? 0
}

const MINOR_UNSAFE_FIXTURE_LANGUAGE = /(?:投資|財務|金錢|資產|工作|公司|職場|職業|伴侶|戀愛|結婚|婚姻|買房|法律|未來|成年|長大|修復家庭|承擔修復)/u

export function makeNaturalConsultationParagraph(seed, minimumCjk, label = '', options = {}) {
  const sentences = []
  const openings = options.minorSafe ? OPENINGS.filter((value) => !MINOR_UNSAFE_FIXTURE_LANGUAGE.test(value)) : OPENINGS
  const observations = options.minorSafe ? OBSERVATIONS.filter((value) => !MINOR_UNSAFE_FIXTURE_LANGUAGE.test(value)) : OBSERVATIONS
  const actions = options.minorSafe ? ACTIONS.filter((value) => !MINOR_UNSAFE_FIXTURE_LANGUAGE.test(value)) : ACTIONS
  let state = ((Number(seed) + 1) * 0x9e3779b1) >>> 0
  const next = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    return state >>> 0
  }
  const used = new Set()
  let index = 0
  while (countCjk(sentences.join('')) < minimumCjk) {
    let opening
    let observation
    let action
    let key
    do {
      opening = openings[next() % openings.length]
      observation = observations[next() % observations.length]
      action = actions[next() % actions.length]
      key = `${opening}|${observation}|${action}`
    } while (used.has(key))
    used.add(key)
    const context = label ? `以「${label}」這個主題來看，` : ''
    sentences.push(`第${seed + 1}組第${index + 1}次觀察中，${context}${opening}，${observation}；在第${index + 1}步裡，${action}。`)
    index += 1
  }
  return sentences.join('')
}
