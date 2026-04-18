#!/usr/bin/env python3
"""
為 6 方案各生成一份 UI 樣本 HTML（靜態渲染，不需要 dev server）。
用於 5 LLM 並行評分。

樣本內容：
  - 起承轉合四大篇摺疊外框
  - 典型章節標題 + TL;DR + 內容（模擬 AI 生成）
  - 引用古籍徽章
  - 響應式佈局

每方案的章節數量依 plan-prompts.ts 與 lib/report-structure.ts 對齊。
"""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent
OUT_DIR = ROOT / 'samples'
OUT_DIR.mkdir(exist_ok=True)

# ── 6 方案的章節資料（與 plan-prompts 對齊） ──
PLAN_CHAPTERS = {
    'C': {  # 人生藍圖 15 章
        'name': '人生藍圖',
        'price': 89,
        'client': '李思妍',
        'chapters': [
            ('01 命盤全觀', 'qi', '日主庚金坐申，七殺兩透——表裡如一的執行者，做事像推土機不留退路。', '你是那種走進會議室所有人會下意識坐直的人。命盤顯示日主庚金坐申宮，天干七殺兩透——這個組合在古籍《滴天髓》稱為「剛金之體，得土而成器」[出處：《滴天髓》卷三]，意思是天生就有承擔壓力的肩膀。紫微斗數命宮坐七殺化權 + 擎羊同宮 [出處：《紫微斗數全書·諸星問答》]——你不只是會扛，是喜歡扛。西洋占星太陽落魔羯、月亮落天蠍雙料「認真到可怕」的配置，讓你在感受層面也比別人凝重。簡單說：你活在一種「大事都是我在處理」的狀態，別人看了覺得你很強，你自己覺得理所當然。'),
            ('02 性格特質', 'qi', '外表冷靜但內心翻騰——你習慣把情緒封裝再處理，別人以為你沒事其實你剛處理完一場戰爭。', '內在驅動力源自 Enneagram 第 8 型「挑戰者」特質與八字偏印格局交疊。你不是冷漠，而是把情緒編成了可執行任務——這是心理學所稱的「情緒功能化」[出處：《孫子兵法·九變》]。你的決策風格偏「拉弓再放箭」——先在腦內跑三遍沙盤推演才動作，所以看起來慢，其實最精準。價值觀核心是「把事做對比被喜歡重要」，這讓你在關鍵時刻能做對的決定，但也讓你在人際上偶爾被貼「太硬」標籤。'),
            ('03 天賦潛能', 'qi', '你最大的資產是「壓力轉動力」的天賦——別人在壓力下當機，你會突然變聰明。', '從排盤看你有 5 項核心優勢：決策速度（紫微七殺坐命 [出處：《紫微斗數全書》]）、危機直覺（八字偏印格）、說服力（紫微化祿）、細節記憶力（西洋處女座水星合相）、長跑耐力（人類圖薦骨中心定義）。激發方式：把每一個優勢都放在「可量化的小戰場」裡。例如說服力——每週挑一場你覺得重要的對話，事先寫下你想推動的結論，事後檢查有沒有把對方帶到那個結論。不是靠嘴，是靠結構。'),
            ('04 人生課題', 'qi', '你最需要學的不是更拼，是「允許自己被照顧」——你太會扛，扛到忘了卸下時人會垮。', '你要一生面對的 3 個核心挑戰——**承擔過載**（八字偏印+七殺兩透，天生覺得「我不扛誰扛」）、**情緒延遲**（紫微擎羊同宮，把情緒推到最後才處理）、**孤狼模式**（西洋月亮天蠍，相信只有自己能懂自己）。這些不是缺點，是你曾經賴以生存的武器；現在你的課題是學會在安全的關係裡收起武器。'),
            ('05 事業發展', 'cheng', '你適合做「最後一個進辦公室關燈的那個人」——不是最快的，是最穩的。', '古籍《鬼谷子·飛鉗》記載：「鉗而縱之，乘其勢而用之」[出處：《鬼谷子·飛鉗》]——你最強的戰場是需要耐力和策略的長期賽。最適合的 3 個行業方向：金融風控（七殺正官格局天生適合守紀律產業）、專案管理（偏印格善於規劃）、法律/合規（紫微天刑星性格）。職場風格偏老闆型，但不是衝鋒型，是「挖地基那個」。創業潛力中高，建議 35 歲後啟動，讓時間站在你這邊。'),
            ('06 財富運勢', 'cheng', '正財稍強於偏財——你賺錢靠「把事做深」，不是「抓風口」。', '你是典型的「靠專業賺錢」體質，投機性質的偏財會讓你睡不著。理財性格偏穩健保守，但有一個盲點：你會把「不花錢」誤認為「理財」。真正的理財是讓錢為你工作，不是囤在戶頭。建議資產配置：穩健型 60%、成長型 30%、現金 10%。2026-2028 是適合加碼長期投資的三年 [出處：《子平真詮》卷四]。'),
            ('07 感情關係', 'cheng', '你擇偶會被「讓你能靠下的肩膀」吸引——這反映出你童年承擔太多的補償心理。', '依附理論來看你是「迴避-依附交織型」——你想要被照顧，但又怕被綁住。對你有吸引力的對象特質：成熟、獨立、懂得給空間。不適合的類型：過度依賴、情緒起伏大、需要頻繁保證。溝通鐵則：「你有感覺時講，不要累積」。你最大的關係陷阱是等到爆炸才說，這時對方已經不知道你在氣什麼。'),
            ('08 健康與福祉', 'cheng', '五行金旺缺水——肺部、大腸、皮膚是你的弱點，壓力大時失眠明顯。', '身體強弱分析：先天體質屬中上，但「把身體當耐久品不當消耗品」的習慣讓你容易累積隱性傷害。最易出狀況的部位是肩頸（你壓力習慣往上扛）、呼吸道（金旺缺水）、皮膚（肝火旺）。養生建議：早餐必吃（你容易跳過），每週 3 次 30 分鐘有氧（不是重訓），睡前 1 小時離開螢幕。'),
            ('09 十年大運總覽', 'zhuan', '未來 10 年走「正官運」——事業穩步爬升的地圖已經畫好，但你要學會轉彎。', '2026-2035 大運逐段：2026-2030 建設期（做你現在正在做的事，做深）、2031-2033 轉折期（會有重大抉擇）、2034-2035 收穫期（前面的累積開始發酵）。這是一張很「紮實」的運勢地圖，沒有大起大落，但每一步都是真的。'),
            ('10 當前大運詳解', 'zhuan', '現在走的是「建祿格」——2026-2028 是你奠定根基的三年，做的不是衝刺而是打地基。', '本大運的主題是「讓世界看見你的專業」。當下最該把握：把你做得最好的那件事變成系統（寫成 SOP、教給 2-3 人）。當下最該注意：不要對「副業誘惑」心動，偏財運不適合你現在走。事業現況：處於「蓄勢」階段，不是衝刺期；財運：主業收入穩定成長；感情：適合進入承諾階段。'),
            ('11 流年運勢聚焦', 'zhuan', '2026 丙午年偏印透干——今年注定多一個從未想過的學習機會找上你。', '關鍵月份：3 月（貴人月）、7 月（動盪月，避免重大決定）、10 月（結果月）。事業最佳時機：3-5 月。財運最佳時機：9-11 月。感情最佳時機：整年平穩，6 月有契機。需提前準備的挑戰：7-8 月會有一個看似小事的家庭議題被放大，提前跟家人溝通能避免。'),
            ('12 優勢發揮與行動策略', 'he', '五個明天就能做的行動——不是口號，是具體步驟。', '行動一：建立「週末儀式」（週六上午 2 小時斷網看書，3 個月後你會發現自己不一樣）。行動二：每日情緒記錄 3 行（什麼情緒+觸發+身體反應，寫 30 天）。行動三：每月一次「無目的約會」（跟不是為了工作的朋友吃飯）。行動四：建立備援朋友圈（列 5 個你半夜可以打電話的人）。行動五：每季一次「獨立旅行」（一個人 2 天，不帶工作）。每個行動都對應你的一項課題。'),
            ('13 風險規避與潛在陷阱', 'he', '三個你最可能掉進的坑——每個都附發生徵兆與預防策略。', '陷阱一 過度承擔：徵兆是當你發現「只有我在扛」的念頭反覆出現；預防是每週固定一個「拒絕日」，不接任何新請求。陷阱二 延遲情緒爆發：徵兆是你開始對小事易怒；預防是情緒記錄（見上條）。陷阱三 孤狼模式：徵兆是三週以上沒有主動約人；預防是每週固定一個「友情行動」（約飯、問候、發文章）。'),
            ('14 心態調整與成長路徑', 'he', '每日 3 個心態練習、每週 2 個自省問題、每月 1 個長期目標回顧。', '每日練習：早起靜坐 5 分鐘、睡前感恩 3 件、午後深呼吸 2 分鐘。每週自省：「這週我有沒有委屈自己？」「這週我有沒有照顧我的身體？」。每月回顧：拿出年度目標，問「我離那裡更近了嗎？」。長期心態重建關鍵詞：放下「必須完美」、擁抱「已經夠好」。'),
            ('15 總結與進階指引', 'he', '寫給你的話——像一封私人信件，溫暖、有力量。', '思妍——這份報告寫到這裡，我最想告訴你的不是「你多強」，是「你可以不用總是那麼強」。你的命盤有一個美麗的弱點：你太會把事情扛起來，卻從沒學會把它放下。接下來的 10 年，你會完成很多事，但我希望你記住的不是你完成了多少，是你有沒有在過程中喜歡自己。如果有一天你覺得累了，記得回來翻這份報告——你會想起你為什麼出發。 —— 鑒源命理'),
        ],
    },
    'D': {  # 心之所惑 7 章
        'name': '心之所惑',
        'price': 39,
        'client': '陳宇辰',
        'chapters': [
            ('你的問題', '', 'qi', '> 「我該不該辭職開創自己的事業？已經猶豫一年多了。」（來自你在表單填寫的原話）'),
            ('你的答案', '', 'qi', '**結論：可以，但要等 2026 年下半年**——你現在衝出去是用蠻力，再等 8 個月會用巧勁。命盤顯示 2026 年上半年走「比劫爭財」格局 [出處：《子平真詮·論比劫》]，此時創業容易被自己人脈耗光資源；下半年轉「食神生財」，自動吸引資金與客戶。這不是玄學，是你命格對應的能量節奏。'),
            ('一、深入解析——命格怎麼看這件事', '', 'cheng', '八字日主丙火坐寅——你是那種「自帶火種」的人，創業是你的天命 [出處：《滴天髓·論火》]。但現在比劫太旺，衝出去會被自己的人脈耗光資源。'),
            ('二、根源剖析——你為什麼會卡在這裡', '', 'zhuan', '卡的不是能力，是「我要向誰證明」的底層焦慮——你內心還在對某個人（可能是父親）證明自己能獨立。'),
            ('五、需要注意的地方', '', 'zhuan', '2026 上半年忌大動作——流年冲犯大運天干，你會遇到三個看似 offer 的陷阱。'),
            ('三、你的路——怎麼走出來', '', 'he', '短期（3 個月）：建立副業現金流；中期（6-8 個月）：培養 3 個核心客戶；長期（1 年後）：正式出發。'),
            ('四、好的地方', '', 'he', '你有三個創業必備的硬通貨：人脈（紫微天同）、行動力（八字日主）、直覺（西洋水星合相）。'),
            ('六、改善建議詳解', '', 'he', '具體的 5 個週末練習——從「證明型工作」轉為「創造型工作」。'),
            ('寫給你的話', '', 'he', '辭職創業不是勇氣，是時機。你的勇氣一直都在。'),
        ],
    },
    'G15': {  # 家族藍圖 9 章
        'name': '家族藍圖',
        'price': 59,
        'client': '張家四口',
        'chapters': [
            ('你們家的能量全貌', '', 'qi', '**你們家就像一支樂隊**——爸爸是鼓手、媽媽是主唱、大女兒是貝斯、小女兒是吉他。節奏感強，但缺少「安靜的時刻」。五行分佈：父 2 金 1 火、母 3 木 1 水、長女 2 土 1 木、幼女 1 水 2 火 [出處：《三命通會·五行篇》]——金木相沖的張力靠土來調和，這就是為什麼大女兒常常是家庭的潤滑劑。'),
            ('一、成員互動關係深度分析', '', 'qi', '爸爸（庚金日主）× 媽媽（甲木日主）=天然相沖，但時辰互補 [出處：《三命通會·合沖篇》]。'),
            ('二、好的地方', '', 'cheng', '三個讓外人羨慕的家庭優勢：審美一致、旅行默契、危機應變快。'),
            ('三、需要注意', '', 'cheng', '兩個正在惡化的互動模式：暗流溝通、情緒外包。'),
            ('六、家庭溝通模式', '', 'cheng', '你們家「說話像打電報」——省字省到只剩動詞，誤會就從這裡來。'),
            ('七、親子教養方向', '', 'cheng', '大女兒（紫微天相）適合「被信任」的教養；小女兒（八字偏財）適合「被挑戰」的教養。'),
            ('八、家族流年運勢（2026-2030）', '', 'zhuan', '未來五年：2026 安靜、2027 搬家、2028 分裂、2029 整合、2030 開花。'),
            ('四、改善建議', '', 'he', '三個這個週末就能做的家庭練習。'),
            ('五、刻意練習', '', 'he', '每週一次「情緒 stand-up」——15 分鐘家庭晨會。'),
            ('九、家族行動指南', '', 'he', '未來 3 個月的家庭行動清單——讓能量流動起來。'),
            ('寫給這個家的話', '', 'he', '溫暖的家族圖景收尾。'),
        ],
    },
    'R': {  # 合否？8 章
        'name': '合否？',
        'price': 59,
        'client': '張佩珊 × 何柏翔',
        'chapters': [
            ('你們的問題', '', 'qi', '交往三年，該不該進入婚姻？這是你們一起填表時選的焦點問題。'),
            ('你們的答案', '', 'qi', '**結論：合，但有一個致命雷區——你們都太「弱」，卻都太「硬」。** 八字日柱天合地合（癸丑×戊午）[出處：《滴天髓·合神篇》]，天生吸引。但兩人都是紫微破軍坐命——外強內軟的配置 [出處：《紫微斗數全書·破軍星》]，吵架會演成冷戰。先說結論：你們合，但不能光靠「合」活下來，要靠「技術」。'),
            ('一、你們的化學反應', '', 'cheng', '八字合盤：日柱天合地合 [出處：《滴天髓·夫妻篇》]。紫微合盤：夫妻宮交互拱照。西洋占星：金星合日。'),
            ('二、最好的地方', '', 'zhuan', '你們互補的 6 個領域——一個建築、一個裝修，剛好一套完整的家。'),
            ('三、最該注意的地方', '', 'zhuan', '6 個你們互相激怒對方的按鈕，每個按鈕都附「解法」。'),
            ('六、關係流年（2026-2028）', '', 'zhuan', '2026 磨合、2027 決定、2028 扎根。'),
            ('四、改善建議——你們的關係處方箋', '', 'he', '5 個具體可執行的溝通練習。'),
            ('五、刻意練習', '', 'he', '每週一次「三個問題」——不問近況，問內心。'),
            ('寫給你們的話', '', 'he', '溫暖收尾。'),
        ],
    },
    'E1': {  # 事件出門訣
        'name': '事件出門訣',
        'price': 89,
        'client': '林俊宏',
        'chapters': [
            ('事件吉凶分析', '', 'qi', '求財事件成功機率分析：值符天沖落三宮——積極型策略勝率高 [出處：《煙波釣叟歌》]。天沖星主動進取，落三宮震位得時得地，象徵主動出擊可成。配合年命宮坐坤方 [出處：《奇門遁甲全書·年命論》]，你的個人能量與此盤形成強共振。'),
            ('Top3 加乘時機', '', 'cheng', '第一名：2026-05-12 甲時、東南 135°；第二名：...；第三名：...'),
            ('行動建議', '', 'zhuan', '出門前 40 分鐘準備清單、行進策略、話術要點。'),
            ('補運操作指南', '', 'zhuan', '到達後面朝東南靜坐 40 分鐘接氣——詳細操作步驟。'),
            ('忌方忌日', '', 'he', '忌西方、忌週三。'),
            ('寫給你的話', '', 'he', '把時機用對，不用拜佛也能走好。'),
        ],
    },
    'E2': {  # 月度出門訣
        'name': '月度出門訣',
        'price': 99,
        'client': '黃雅琪',
        'chapters': [
            ('本月出行能量總覽', '', 'qi', '本月四週能量起伏：前兩週偏動、後兩週轉靜 [出處：《奇門遁甲·月令篇》]。年命宮坐東南方位能量最佳，配合本月值符流轉至巽宮——這是你整月的主軸方位。第二週會有一個關鍵選擇點，提前規劃能事半功倍。'),
            ('第一週（5/01-5/07）', '', 'cheng', '最佳時機：5/03 辰時、東方 75°。'),
            ('第二週（5/08-5/14）', '', 'cheng', '最佳時機：5/11 午時、南方 180°。'),
            ('第三週（5/15-5/21）', '', 'cheng', '最佳時機：5/18 申時、西南 225°。'),
            ('第四週（5/22-5/28）', '', 'cheng', '最佳時機：5/26 戌時、北方 345°。'),
            ('補運操作指南', '', 'zhuan', '每週操作的完整流程——從出門到靜坐的每個細節。'),
            ('月度總結', '', 'he', '本月能量地圖 + 下月續購引導。'),
            ('寫給你的話', '', 'he', '方位會重新洗牌，這不是一次性的操作。'),
        ],
    },
}

PART_META = {
    'qi': {'label': '第一篇', 'stage': '起', 'name': '生命藍圖 — 認識本我', 'icon': '◆',
           'tldr': '建立「我是誰」的全面認知——本質特徵，與時間無關'},
    'cheng': {'label': '第二篇', 'stage': '承', 'name': '人生軌跡 — 發展與現況', 'icon': '◇',
              'tldr': '將「本我」延伸至各領域現況——事業/財富/感情/健康'},
    'zhuan': {'label': '第三篇', 'stage': '轉', 'name': '時運流轉 — 未來展望', 'icon': '◐',
              'tldr': '聚焦時間性分析——大運、流年、關鍵時機'},
    'he': {'label': '第四篇', 'stage': '合', 'name': '行動指引 — 總結與實踐', 'icon': '◈',
           'tldr': '融會貫通前三篇——具體行動、風險規避、心態調整、溫暖收尾'},
}


def render_html(plan_code, plan_data):
    """產出一份方案的 UI 模擬 HTML"""
    # 按起承轉合分組
    groups = {'qi': [], 'cheng': [], 'zhuan': [], 'he': []}
    for ch in plan_data['chapters']:
        # 只取 title/part/content，忽略其他欄位
        title = ch[0]
        # part 可能在第 2 或第 3 位（舊資料兼容）
        part = None
        content = None
        for item in ch[1:]:
            if item in ('qi', 'cheng', 'zhuan', 'he'):
                part = item
            else:
                content = item if content is None else content + ' ' + item
        if part is None:
            part = 'cheng'  # fallback
        if content is None:
            content = ''
        groups[part].append({'title': title, 'content': content})

    order = ['qi', 'cheng', 'zhuan', 'he']
    groups_rendered = [(k, groups[k]) for k in order if groups[k]]

    parts_html = []
    for idx, (pk, chaps) in enumerate(groups_rendered):
        pm = PART_META[pk]
        progress_pct = (idx + 1) / len(groups_rendered) * 100
        chapters_html = ''
        for j, ch in enumerate(chaps):
            title = ch['title']
            content = ch['content']
            # 模擬典據徽章（對比度提升）
            content_html = content.replace(
                '[出處：', '<span class="citation">典據：'
            ).replace('[出處:', '<span class="citation">典據：').replace(']', '</span>')
            # 抽出首句當 TL;DR（顯著顯示）
            tldr = ''
            lines = content_html.split('。')
            if lines and len(lines[0]) > 15:
                tldr_raw = lines[0].replace('> ', '').replace('**', '').strip()
                if len(tldr_raw) < 120:
                    tldr = tldr_raw + '。'
            tldr_html = f'<div class="chapter-tldr">{tldr}</div>' if tldr else ''
            chapters_html += f'''
            <div class="chapter">
              <h3 class="chapter-title">{title}</h3>
              {tldr_html}
              <p class="chapter-body">{content_html}</p>
            </div>'''

        parts_html.append(f'''
        <section class="part">
          <div class="part-header">
            <div class="part-icon">{pm['icon']}</div>
            <div class="part-meta">
              <div class="part-labels">
                <span class="part-label">{pm['label']}</span>
                <span class="part-stage">{pm['stage']}</span>
                <span class="part-count">{len(chaps)} 章</span>
                <span class="part-progress-text">{idx+1} / {len(groups_rendered)}</span>
              </div>
              <h2 class="part-name">{pm['name']}</h2>
              <p class="part-tldr">{pm['tldr']}</p>
              <div class="part-progress"><div class="part-progress-fill" style="width:{progress_pct}%"></div></div>
            </div>
          </div>
          <div class="part-body">
            {chapters_html}
          </div>
        </section>''')

    html = f'''<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{plan_data['client']}的{plan_data['name']}報告</title>
<style>
body {{
  margin: 0;
  background: linear-gradient(180deg, #0a0e1a 0%, #0f1628 40%, #0a0e1a 100%);
  color: rgba(255,255,255,0.85);
  font-family: "Microsoft JhengHei", "Noto Sans TC", sans-serif;
  min-height: 100vh;
  padding-bottom: 60px;
}}
.container {{ max-width: 820px; margin: 0 auto; padding: 56px 28px; }}
.brand {{ text-align: center; color: rgba(197,150,58,0.85); font-size: 13px; letter-spacing: 7px; margin-bottom: 20px; font-weight: 600; }}
.header {{ background: linear-gradient(135deg, rgba(255,255,255,0.045), rgba(26,42,74,0.15)); border: 1px solid rgba(197,150,58,0.2); border-radius: 20px; padding: 60px 44px; text-align: center; margin-bottom: 48px; box-shadow: 0 12px 40px rgba(0,0,0,0.35); position: relative; }}
.header::before {{ content: ''; position: absolute; top: 0; left: 50%; transform: translateX(-50%); width: min(25%, 180px); min-width: 80px; height: 3px; background: linear-gradient(90deg, transparent, #c9a84c 50%, transparent); border-radius: 0 0 3px 3px; }}
.header-plan {{ color: rgba(224,197,106,0.9); font-size: 11px; letter-spacing: 5px; text-transform: uppercase; margin-bottom: 14px; font-weight: 700; }}
.header-name {{ color: #faf6e9; font-size: 36px; font-weight: 700; margin: 0 0 14px 0; letter-spacing: 0.03em; }}
.header-divider {{ width: 72px; height: 2px; background: linear-gradient(90deg, transparent, #c9a84c 50%, transparent); margin: 0 auto 16px; border-radius: 2px; }}
.header-date {{ color: rgba(255,255,255,0.5); font-size: 13px; letter-spacing: 2px; }}
.part {{ margin-bottom: 48px; }}
.part-header {{ background: linear-gradient(135deg, rgba(197,150,58,0.16), rgba(26,42,74,0.35)); border: 1px solid rgba(197,150,58,0.35); border-radius: 18px; padding: 28px 30px; display: flex; gap: 20px; align-items: flex-start; cursor: pointer; margin-bottom: 24px; box-shadow: 0 6px 24px rgba(197,150,58,0.1); transition: all 0.3s ease; }}
.part-header:hover {{ transform: translateY(-2px); box-shadow: 0 8px 28px rgba(197,150,58,0.18); }}
.part-icon {{ width: 58px; height: 58px; background: rgba(197,150,58,0.25); border: 1.5px solid rgba(197,150,58,0.5); color: #e8ce7a; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 30px; font-weight: 700; text-shadow: 0 0 14px rgba(197,150,58,0.5); flex-shrink: 0; }}
.part-meta {{ flex: 1; min-width: 0; }}
.part-labels {{ display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 4px; }}
.part-label {{ color: rgba(224,197,106,0.9); font-size: 11px; letter-spacing: 4px; font-weight: 700; }}
.part-stage {{ background: rgba(197,150,58,0.22); color: #e8ce7a; border: 1px solid rgba(197,150,58,0.5); padding: 3px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; }}
.part-count {{ color: rgba(255,255,255,0.55); font-size: 11px; }}
.part-progress-text {{ color: rgba(224,197,106,0.75); font-size: 11px; margin-left: auto; font-weight: 700; letter-spacing: 1px; }}
.part-name {{ color: #f0deac; font-size: 23px; font-weight: 600; margin: 10px 0 8px 0; letter-spacing: 0.03em; line-height: 1.4; }}
.part-tldr {{ color: rgba(255,255,255,0.82); font-size: 14px; margin: 6px 0 0 0; line-height: 1.8; }}
.part-progress {{ margin-top: 14px; height: 4px; background: rgba(197,150,58,0.15); border-radius: 999px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.25); }}
.part-progress-fill {{ height: 100%; background: linear-gradient(90deg, rgba(197,150,58,0.6), rgba(232,206,122,0.95)); transition: width 0.4s ease; box-shadow: 0 0 12px rgba(197,150,58,0.4); }}
.part-body {{ padding-left: 24px; margin-left: 12px; position: relative; }}
.part-body::before {{ content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px; background: linear-gradient(180deg, rgba(197,150,58,0.42) 0%, rgba(197,150,58,0.22) 50%, rgba(197,150,58,0.08) 100%); border-radius: 2px; }}
.chapter {{ background: rgba(255,255,255,0.045); border: 1px solid rgba(255,255,255,0.11); border-left: 3px solid rgba(197,150,58,0.65); border-radius: 14px; padding: 32px 34px; margin-bottom: 28px; transition: all 0.25s ease; }}
.chapter:hover {{ background: rgba(255,255,255,0.06); border-left-color: rgba(232,206,122,0.85); }}
.chapter-title {{ color: #f0deac; font-size: 19px; font-weight: 700; margin: 0 0 16px 0; letter-spacing: 0.03em; line-height: 1.45; }}
.chapter-tldr {{ color: rgba(245,228,181,0.92); font-size: 14px; line-height: 1.85; margin: 0 0 22px 0; padding: 14px 18px; background: rgba(197,150,58,0.12); border-left: 3px solid rgba(232,206,122,0.55); border-radius: 0 10px 10px 0; font-weight: 400; }}
.chapter-tldr::before {{ content: '本章摘要'; color: #c9a84c; font-weight: 700; letter-spacing: 1px; font-size: 11.5px; margin-right: 10px; padding: 2px 8px; background: rgba(197,150,58,0.18); border-radius: 4px; vertical-align: baseline; border: 1px solid rgba(197,150,58,0.3); }}
.chapter-body {{ color: rgba(255,255,255,0.88); font-size: 15.5px; line-height: 2.05; margin: 0; letter-spacing: 0.01em; }}
.citation {{ display: inline-block; margin: 0 5px; padding: 3px 12px; font-size: 11.5px; background: linear-gradient(135deg, rgba(201,168,76,0.18), rgba(201,168,76,0.08)); border: 1px solid rgba(201,168,76,0.6); border-radius: 10px; color: #f0deac; letter-spacing: 0.8px; font-weight: 600; vertical-align: middle; box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 6px rgba(0,0,0,0.3); transition: all 0.2s ease; }}
.citation:hover {{ background: linear-gradient(135deg, rgba(201,168,76,0.28), rgba(201,168,76,0.15)); transform: translateY(-1px); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12), 0 3px 8px rgba(0,0,0,0.4); }}
@media (max-width: 640px) {{
  .container {{ padding: 36px 20px; }}
  .header {{ padding: 40px 24px; margin-bottom: 36px; }}
  .header-name {{ font-size: 27px; letter-spacing: 0.02em; }}
  .header-plan {{ font-size: 11px; letter-spacing: 4px; }}
  .part {{ margin-bottom: 40px; }}
  .part-header {{ padding: 22px 20px; gap: 16px; border-radius: 16px; }}
  .part-icon {{ width: 50px; height: 50px; font-size: 24px; border-radius: 14px; }}
  .part-name {{ font-size: 20px; line-height: 1.45; }}
  .part-tldr {{ font-size: 13.5px; line-height: 1.8; }}
  .part-body {{ padding-left: 16px; margin-left: 8px; }}
  .chapter {{ padding: 24px 22px; border-radius: 12px; margin-bottom: 22px; }}
  .chapter-title {{ font-size: 17px; }}
  .chapter-tldr {{ font-size: 13.5px; padding: 14px 16px; line-height: 1.85; margin-bottom: 18px; }}
  .chapter-body {{ font-size: 14.5px; line-height: 1.95; }}
  .citation {{ font-size: 11px; padding: 2px 8px; }}
}}
</style>
</head>
<body>
<div class="container">
  <div class="brand">鑑 源 命 理</div>
  <div class="header">
    <div class="header-plan">{plan_data['name']}</div>
    <h1 class="header-name">{plan_data['client']}</h1>
    <div class="header-date">2026年4月18日 · 預估閱讀 12 分鐘</div>
  </div>

  {''.join(parts_html)}
</div>
</body>
</html>'''
    return html


def main():
    for code, data in PLAN_CHAPTERS.items():
        html = render_html(code, data)
        out = OUT_DIR / f'{code}_sample.html'
        out.write_text(html, encoding='utf-8')
        print(f'  [{code}] {out.name} ({len(html)} bytes, {len(data["chapters"])} 章)')
    print(f'\n全部 {len(PLAN_CHAPTERS)} 方案樣本已存：{OUT_DIR}')


if __name__ == '__main__':
    main()
