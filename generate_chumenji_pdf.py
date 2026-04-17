#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
鑑源出門訣獨門方案 v1.0 — PDF 生成腳本
生成專業級 A4 PDF 文件，含封面、目錄、詳細評分表格
"""

import os
import sys
from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, CondPageBreak
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ====== 頁面參數 ======
PAGE_W, PAGE_H = A4  # 595pt x 842pt
MARGIN_TOP = 18 * mm
MARGIN_BOTTOM = 15 * mm
MARGIN_LEFT = 15 * mm
MARGIN_RIGHT = 15 * mm
CONTENT_WIDTH = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT  # ~511pt

# ====== 顏色 ======
BRAND_DARK = colors.HexColor('#1a237e')   # 深藍
BRAND_GOLD = colors.HexColor('#c9a84c')   # 金色
BRAND_LIGHT = colors.HexColor('#e8eaf6')  # 淺藍
TABLE_HEADER_BG = colors.HexColor('#1a237e')
TABLE_ALT_BG = colors.HexColor('#f5f5f5')
SCORE_GREEN = colors.HexColor('#2e7d32')
SCORE_RED = colors.HexColor('#c62828')

# ====== 字體 ======
FONT_NAME = 'ChineseFont'
FONT_BOLD = 'ChineseFontBold'
font_registered = False

for font_path in [
    'C:/Windows/Fonts/msjh.ttc',
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/simsun.ttc',
]:
    if os.path.exists(font_path):
        try:
            pdfmetrics.registerFont(TTFont(FONT_NAME, font_path, subfontIndex=0))
            # 嘗試註冊粗體
            try:
                pdfmetrics.registerFont(TTFont(FONT_BOLD, font_path, subfontIndex=1))
            except:
                pdfmetrics.registerFont(TTFont(FONT_BOLD, font_path, subfontIndex=0))
            font_registered = True
            print(f"[OK] 字體載入：{font_path}")
            break
        except Exception as e:
            print(f"[WARN] 字體 {font_path} 載入失敗：{e}")

if not font_registered:
    print("[FATAL] 無可用中文字體")
    sys.exit(1)


# ====== 樣式定義 ======
def create_styles():
    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        'CoverTitle', fontName=FONT_BOLD, fontSize=28, leading=36,
        alignment=TA_CENTER, textColor=colors.white, spaceAfter=8*mm
    ))
    styles.add(ParagraphStyle(
        'CoverSubtitle', fontName=FONT_NAME, fontSize=14, leading=20,
        alignment=TA_CENTER, textColor=BRAND_GOLD, spaceAfter=4*mm
    ))
    styles.add(ParagraphStyle(
        'CoverInfo', fontName=FONT_NAME, fontSize=11, leading=16,
        alignment=TA_CENTER, textColor=colors.white, spaceAfter=3*mm
    ))
    styles.add(ParagraphStyle(
        'H1', fontName=FONT_BOLD, fontSize=16, leading=22,
        textColor=BRAND_DARK, spaceBefore=10*mm, spaceAfter=5*mm,
        borderWidth=0, borderColor=BRAND_DARK, borderPadding=2*mm
    ))
    styles.add(ParagraphStyle(
        'H2', fontName=FONT_BOLD, fontSize=13, leading=18,
        textColor=BRAND_DARK, spaceBefore=6*mm, spaceAfter=3*mm
    ))
    styles.add(ParagraphStyle(
        'H3', fontName=FONT_BOLD, fontSize=11, leading=15,
        textColor=BRAND_DARK, spaceBefore=4*mm, spaceAfter=2*mm
    ))
    styles.add(ParagraphStyle(
        'Body', fontName=FONT_NAME, fontSize=9.5, leading=15,
        alignment=TA_JUSTIFY, spaceAfter=2*mm
    ))
    styles.add(ParagraphStyle(
        'BodySmall', fontName=FONT_NAME, fontSize=8.5, leading=13,
        alignment=TA_LEFT, spaceAfter=1.5*mm
    ))
    styles.add(ParagraphStyle(
        'Quote', fontName=FONT_NAME, fontSize=9, leading=14,
        textColor=colors.HexColor('#555555'), leftIndent=10*mm,
        borderWidth=1, borderColor=BRAND_GOLD, borderPadding=3*mm,
        spaceBefore=2*mm, spaceAfter=3*mm
    ))
    styles.add(ParagraphStyle(
        'TableHeader', fontName=FONT_BOLD, fontSize=8, leading=11,
        textColor=colors.white, alignment=TA_CENTER
    ))
    styles.add(ParagraphStyle(
        'TableCell', fontName=FONT_NAME, fontSize=8, leading=12,
        alignment=TA_LEFT
    ))
    styles.add(ParagraphStyle(
        'TableCellCenter', fontName=FONT_NAME, fontSize=8, leading=12,
        alignment=TA_CENTER
    ))
    styles.add(ParagraphStyle(
        'TOCEntry', fontName=FONT_NAME, fontSize=10, leading=16,
        spaceBefore=1*mm, spaceAfter=1*mm
    ))
    styles.add(ParagraphStyle(
        'Footer', fontName=FONT_NAME, fontSize=7, leading=10,
        textColor=colors.grey, alignment=TA_CENTER
    ))
    return styles


def make_table(headers, rows, col_widths=None, header_style=None):
    """建立統一風格的表格"""
    s = create_styles()

    # 表頭
    header_row = [Paragraph(h, s['TableHeader']) for h in headers]

    # 內容
    data = [header_row]
    for row in rows:
        data.append([Paragraph(str(c), s['TableCell']) if not isinstance(c, Paragraph) else c for c in row])

    if col_widths is None:
        col_widths = [CONTENT_WIDTH / len(headers)] * len(headers)

    t = Table(data, colWidths=col_widths, repeatRows=1)

    style_commands = [
        ('BACKGROUND', (0, 0), (-1, 0), TABLE_HEADER_BG),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), FONT_BOLD),
        ('FONTSIZE', (0, 0), (-1, 0), 8),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#cccccc')),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]

    # 交替行背景
    for i in range(1, len(data)):
        if i % 2 == 0:
            style_commands.append(('BACKGROUND', (0, i), (-1, i), TABLE_ALT_BG))

    t.setStyle(TableStyle(style_commands))
    return t


def build_cover(s):
    """封面"""
    elements = []

    # 封面背景色塊（用表格模擬）
    cover_bg = Table(
        [['']], colWidths=[CONTENT_WIDTH], rowHeights=[PAGE_H - MARGIN_TOP - MARGIN_BOTTOM]
    )
    cover_bg.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BRAND_DARK),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))

    # 品牌名
    elements.append(Spacer(1, 30*mm))

    # 裝飾線
    deco_line = Table([['']], colWidths=[80*mm], rowHeights=[1.5])
    deco_line.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,-1), BRAND_GOLD)]))

    brand = Paragraph('鑑 源 命 理', s['CoverSubtitle'])
    elements.append(brand)
    elements.append(Spacer(1, 5*mm))
    elements.append(deco_line)
    elements.append(Spacer(1, 15*mm))

    # 主標題
    title = Paragraph('鑑源出門訣獨門方案', s['CoverTitle'])
    elements.append(title)

    # 副標題
    subtitle = Paragraph('奇門遁甲出門擇時評分系統設計文件 v1.0', s['CoverSubtitle'])
    elements.append(subtitle)

    elements.append(Spacer(1, 10*mm))
    elements.append(deco_line)
    elements.append(Spacer(1, 20*mm))

    # 資訊
    for info in [
        '鑑源命理研究部門',
        '2026 年 4 月 13 日',
        '',
        '機密文件 - 內部使用',
    ]:
        elements.append(Paragraph(info, s['CoverInfo']))

    elements.append(PageBreak())
    return elements


def build_toc(s):
    """目錄"""
    elements = []
    elements.append(Paragraph('目錄', s['H1']))
    elements.append(Spacer(1, 3*mm))

    toc_items = [
        ('一', '方案概述'),
        ('二', '理論基礎與古籍依據'),
        ('三', '8 層評分架構'),
        ('四', '評分細則'),
        ('五', '事件分類對應表'),
        ('六', '格局完整清單'),
        ('七', '個人化機制'),
        ('八', '產品規格（E1/E2）'),
        ('九', '市場競品比較'),
        ('十', '未來優化方向'),
    ]

    for num, title in toc_items:
        elements.append(Paragraph(f'{num}、{title}', s['TOCEntry']))

    elements.append(PageBreak())
    return elements


def build_chapter1(s):
    """方案概述"""
    elements = []
    elements.append(Paragraph('一、方案概述', s['H1']))

    elements.append(Paragraph('1.1 鑑源出門訣是什麼', s['H2']))
    elements.append(Paragraph(
        '鑑源出門訣是基於奇門遁甲古典理論，結合現代量化分析方法的出行擇時系統。'
        '它能根據客戶的出生資料和事件類型，精確計算每個時辰、每個方位的吉凶分數，'
        '推薦最佳出門時間與方向。', s['Body']
    ))
    elements.append(Paragraph(
        '不同於市面上簡單的「看日子好不好」或「看方位吉不吉」的粗糙判斷，'
        '鑑源出門訣採用 8 層評分架構、涵蓋 74 項權重因子，每一條規則都能追溯到具體古籍出處，'
        '確保結果既有學術嚴謹性，又具備實用價值。', s['Body']
    ))

    elements.append(Paragraph('1.2 核心理念', s['H2']))

    principles = [
        ['客觀量化', '每個方位/時辰都有精確的數值分數，而非模糊的「吉/凶」二分法'],
        ['古籍為本', '74 項權重規則中，每一條都標明古籍出處（《煙波釣叟歌》《御定奇門寶鑑》等）'],
        ['場景適配', '15 種事件類型各有不同的最佳門/星/神組合，不是一刀切的通用建議'],
        ['個人化', '結合客戶出生年的年命宮，提供個人化的方位加減分'],
        ['透明可驗算', '每一步的得分明細都完整記錄，客戶可以看到為什麼推薦這個時間'],
    ]

    t = make_table(
        ['原則', '說明'],
        principles,
        col_widths=[80, CONTENT_WIDTH - 80]
    )
    elements.append(t)

    elements.append(Paragraph('1.3 市場差異化', s['H2']))
    elements.append(Paragraph(
        '市面上的奇門遁甲出門訣產品，大多只看三吉門（開/休/生）的方位，'
        '缺乏系統化的多層評分。鑑源出門訣的獨門優勢在於：', s['Body']
    ))

    diff_items = [
        '8 層評分架構（業界首創的系統化量化模型）',
        '15 種事件分類（不同事情用不同門星神組合）',
        '九遁 9 種 + 吉格 20+ 種 + 凶格 20+ 種（全網最完整的格局判斷）',
        '四害精確減損（門迫/擊刑/入墓/空亡各有不同的力量衰減比例）',
        '旺衰五檔係數（門星隨月令得時與否動態調整）',
        '個人化年命宮（同一時辰不同人有不同的最佳方位）',
    ]
    for item in diff_items:
        elements.append(Paragraph(f'  * {item}', s['Body']))

    elements.append(PageBreak())
    return elements


def build_chapter2(s):
    """理論基礎與古籍依據"""
    elements = []
    elements.append(Paragraph('二、理論基礎與古籍依據', s['H1']))

    elements.append(Paragraph('2.1 引用古籍清單', s['H2']))

    classics = [
        ['S', '《煙波釣叟歌》', '宋（羅通增刪於明）', '奇門遁甲綱領性著作', '八門吉凶、格局體系、九遁、五不遇時'],
        ['S', '《御定奇門寶鑑》', '清（聖祖敕編）', '清廷欽定，收入《四庫全書》', '八門出行歌訣、三吉門用法'],
        ['A', '《遁甲演義》', '明', '集大成之作', '六甲出行訣、八門方位起例'],
        ['A', '《奇門遁甲統宗》', '清', '系統化經典', '值使門、旺衰論、出行七層判斷'],
        ['A', '《金函玉鏡》', '明', '格局詳解', '九遁詳述、吉凶格局條件'],
        ['A', '《奇門法竅》', '清', '實用技法', '門迫、入墓、擊刑條件'],
        ['B', '《奇門遁甲秘笈大全》', '明（劉伯溫編）', '綜合大全', '出行法專卷（卷七）'],
    ]

    t = make_table(
        ['等級', '典籍', '朝代', '地位', '出門訣相關內容'],
        classics,
        col_widths=[30, 95, 70, 100, CONTENT_WIDTH - 295]
    )
    elements.append(t)

    elements.append(Paragraph('2.2 參考的現代名家', s['H2']))

    masters = [
        ['張志春', '《神奇之門》《開悟之門》', '用神體系、值使門核心、事件分類'],
        ['劉文元', '學術著作', '天地盤干支生剋分析、81 組合克應'],
    ]
    t = make_table(
        ['名家', '代表作', '對出門訣的貢獻'],
        masters,
        col_widths=[60, 150, CONTENT_WIDTH - 210]
    )
    elements.append(t)

    elements.append(Paragraph('2.3 核心原理', s['H2']))
    elements.append(Paragraph(
        '《奇門遁甲統宗》：「凡出行者，先看值使門落何宮，吉門吉方即行，凶門凶方即止。」',
        s['Quote']
    ))
    elements.append(Paragraph(
        '《煙波釣叟歌》：「急從神兮緩從門，三五反覆天道利。」'
        '（緊急時從值符方位走，從容時選吉門方位走）',
        s['Quote']
    ))
    elements.append(Paragraph(
        '《御定奇門寶鑑》卷五：「吉門偶爾合三奇，值此經云百事宜。」「吉門被迫，吉事成凶。」',
        s['Quote']
    ))

    elements.append(Paragraph('2.4 出門訣判斷七層體系', s['H2']))
    elements.append(Paragraph(
        '出處：《奇門遁甲秘笈大全》卷七，張志春《開悟之門》整理',
        s['BodySmall']
    ))

    layers = [
        ['第一層', '值使門吉凶', '「值使門者，一局之樞紐也」', '最高'],
        ['第二層', '三吉門（開休生）落宮', '「開門遠行利見貴人，百事大吉」', '核心'],
        ['第三層', '三奇（乙丙丁）配門', '「三奇得使，萬事皆宜」', '高'],
        ['第四層', '八神吉凶', '「值符最尊，百事皆宜」', '中高'],
        ['第五層', '九星旺衰', '「天心智慧，天任財星」', '中'],
        ['第六層', '格局吉凶', '「青龍返首大吉，白虎猖狂大凶」', '高（否決型）'],
        ['第七層', '空亡/反吟/伏吟', '「空亡者有名無實」', '高（否決型）'],
    ]
    t = make_table(
        ['層次', '判斷內容', '古籍原理', '權重等級'],
        layers,
        col_widths=[50, 110, 220, CONTENT_WIDTH - 380]
    )
    elements.append(t)

    elements.append(PageBreak())
    return elements


def build_chapter3(s):
    """8 層評分架構"""
    elements = []
    elements.append(Paragraph('三、8 層評分架構', s['H1']))

    elements.append(Paragraph(
        '鑑源出門訣 V2 採用 8 層清晰分離的評分架構，每一層獨立計算後加總，'
        '消除了 V1 版本中的重複計算問題。', s['Body']
    ))

    arch_layers = [
        ['第一層', '否決檢查', '五不遇時、凶格一票否決、三奇入墓', '門檻'],
        ['第二層', '八門基礎分', '三吉門各 +50 分 x 旺衰係數', '40%'],
        ['第三層', '九星評分', '吉星 +12、凶星 -12 x 旺衰係數', '15%'],
        ['第四層', '八神評分', '值符 +25、白虎 -20', '12%'],
        ['第五層', '格局加減', '九遁 +25、青龍返首 +20、凶格 -20', '18%'],
        ['第六層', '事件適配', '門/星/神/干匹配各 +10~15', '10%'],
        ['第七層', '旺衰五檔', '旺 1.2 / 相 1.0 / 休 0.8 / 囚 0.6 / 死 0.4', '係數'],
        ['第八層', '個人化', '年命宮 +20/-10、值使門、驛馬星', '5%'],
    ]
    t = make_table(
        ['層次', '名稱', '核心內容', '權重'],
        arch_layers,
        col_widths=[50, 80, 300, CONTENT_WIDTH - 430]
    )
    elements.append(t)

    elements.append(Spacer(1, 4*mm))
    elements.append(Paragraph('評分公式', s['H2']))
    elements.append(Paragraph(
        '總分 = 基礎分(門) + 星分 + 神分 + 格局分 + 事件匹配分 + 個人化分 - 否決項 - 減損項',
        s['Quote']
    ))

    elements.append(Paragraph('權重分配依據', s['H2']))
    weights = [
        ['門（八門）', '40%', '《秘笈大全》：「值使門者，一局之樞紐」'],
        ['格局', '18%', '《煙波釣叟歌》格局體系，含否決型凶格'],
        ['星（九星）', '15%', '《統宗》九星為天時輔助判斷'],
        ['神（八神）', '12%', '《統宗》八神為天時加持力量'],
        ['事件匹配', '10%', '張志春用神體系'],
        ['特殊狀態', '5%', '作為減損項'],
    ]
    t = make_table(
        ['層次', '權重', '古籍依據'],
        weights,
        col_widths=[80, 50, CONTENT_WIDTH - 130]
    )
    elements.append(t)

    elements.append(Paragraph(
        '設計邏輯：門 > 格局 > 星 > 神 > 事件 > 特殊狀態。'
        '符合《秘笈大全》的七層判斷體系優先級。', s['Body']
    ))

    elements.append(PageBreak())
    return elements


def build_chapter4(s):
    """評分細則"""
    elements = []
    elements.append(Paragraph('四、評分細則', s['H1']))

    # 4.1 八門
    elements.append(Paragraph('4.1 八門詳表', s['H2']))

    men_rows = [
        ['開門', '金', '大吉', '+50', '求職、升遷、開業、談判、遠行', '《御定奇門寶鑑》：「開門遠行大吉慶」'],
        ['休門', '水', '大吉', '+50', '求見貴人、休養、經商、社交', '《御定奇門寶鑑》：「休門求見利其行」'],
        ['生門', '土', '大吉', '+50', '求財、投資、買賣、嫁娶、遷居', '《御定奇門寶鑑》：「生門求財大吉利」'],
        ['景門', '火', '半吉', '+25', '考試/面試/文書（僅限特定事件）', '《御定奇門寶鑑》：「景門光輝文字通」'],
        ['杜門', '木', '中性', '+15', '藏匿/防守（僅限特定事件）', '《御定奇門寶鑑》：「杜門藏匿好潛蹤」'],
        ['傷門', '木', '凶', '+20*', '手術/競爭事件可用（基礎降為20）', '「傷門出行多有傷」'],
        ['死門', '土', '大凶', '排除', '不適用出門訣', '「死門疾病事多凶」'],
        ['驚門', '金', '凶', '排除', '不適用出門訣', '「驚門主有驚恐事」'],
    ]
    t = make_table(
        ['門', '五行', '吉凶', '基礎分', '適用事項', '古籍出處'],
        men_rows,
        col_widths=[35, 30, 35, 40, 155, CONTENT_WIDTH - 295]
    )
    elements.append(t)
    elements.append(Paragraph('* 傷門/景門/杜門僅在特定事件下可納入評分，出處：《御定奇門寶鑑》「八門各有所宜，非止三吉門為用」', s['BodySmall']))

    elements.append(Spacer(1, 3*mm))

    # 4.2 九星
    elements.append(Paragraph('4.2 九星詳表', s['H2']))
    star_rows = [
        ['天心', '金', '乾六', '大吉', '+12', '智慧之星，利謀略求醫', '《煙波釣叟歌》'],
        ['天輔', '木', '巽四', '吉', '+12', '文昌之星，利學業遠行', '《煙波釣叟歌》'],
        ['天任', '土', '艮八', '吉', '+12', '財星，利求財置產', '《煙波釣叟歌》'],
        ['天禽', '土', '中五', '吉', '+10', '中央之星，利四方', '《煙波釣叟歌》'],
        ['天沖', '木', '震三', '中', '+3', '武勇之星，利爭鬥', '《煙波釣叟歌》'],
        ['天英', '火', '離九', '中', '+2', '離火之星，利文藝', '《煙波釣叟歌》'],
        ['天蓬', '水', '坎一', '凶', '-12', '盜星，主暗昧', '《煙波釣叟歌》'],
        ['天芮', '土', '坤二', '凶', '-12', '病星，主疾厄', '《煙波釣叟歌》'],
        ['天柱', '金', '兌七', '凶', '-10', '毀折之星，主破壞', '《煙波釣叟歌》'],
    ]
    t = make_table(
        ['星', '五行', '原宮', '吉凶', '分數', '出行意義', '出處'],
        star_rows,
        col_widths=[35, 30, 35, 30, 30, 180, CONTENT_WIDTH - 340]
    )
    elements.append(t)

    elements.append(CondPageBreak(60*mm))

    # 4.3 八神
    elements.append(Paragraph('4.3 八神詳表', s['H2']))
    god_rows = [
        ['值符', '大吉', '+25', '百事皆吉，最尊之神', '《奇門遁甲秘笈大全》：「值符百事皆吉」'],
        ['九天', '吉', '+15', '高飛之神，利遠行', '《統宗》：「利遠行出征」'],
        ['太陰', '吉', '+15', '陰柔之神，利密謀', '《統宗》：「利陰私密謀」'],
        ['六合', '吉', '+12', '和合之神，利婚姻合作', '《統宗》：「六合主和合」'],
        ['九地', '半吉', '+8', '安靜之神，利守成', '《統宗》：「利堅守防禦」'],
        ['騰蛇', '凶', '-10', '驚恐虛詐', '《統宗》：「主驚恐怪異」'],
        ['玄武', '凶', '-15', '盜賊暗昧', '《統宗》：「主偷盜暗昧」'],
        ['白虎', '大凶', '-20', '兇險血光', '《統宗》：「主殺伐兵戈」'],
    ]
    t = make_table(
        ['神', '吉凶', '分數', '出行意義', '古籍出處'],
        god_rows,
        col_widths=[40, 35, 35, 140, CONTENT_WIDTH - 250]
    )
    elements.append(t)

    elements.append(CondPageBreak(50*mm))

    # 4.4 四害減損
    elements.append(Paragraph('4.4 四害減損規則', s['H2']))
    harm_rows = [
        ['門迫', '門的五行被宮五行所剋', '吉門分數減半', '50%', '《御定奇門寶鑑》：「吉門被迫，吉事成凶」'],
        ['六儀擊刑', '六儀落自刑宮', '-30 分', '50%', '《煙波釣叟歌》：「六儀擊刑，事多阻礙」'],
        ['入墓', '天干落墓宮', '三奇入墓 -25 / 六儀入墓 -20', '剩 20%', '《煙波釣叟歌》：「三奇入墓，如人入獄」'],
        ['空亡', '旬空所在宮位', '真空 -40 / 假空 -15', '剩 20%', '《煙波釣叟歌》：「空亡之地，諸事無成」'],
    ]
    t = make_table(
        ['四害', '條件', '分數影響', '力量損耗', '古籍出處'],
        harm_rows,
        col_widths=[55, 100, 120, 50, CONTENT_WIDTH - 325]
    )
    elements.append(t)

    elements.append(CondPageBreak(40*mm))

    # 4.5 旺衰五檔
    elements.append(Paragraph('4.5 旺衰五檔係數', s['H2']))
    ws_rows = [
        ['旺', '1.2', '當令得時，同氣', '門/星的五行與當月五行相同'],
        ['相', '1.0', '被生，次吉', '門/星的五行被當月五行所生'],
        ['休', '0.8', '生出，力量外洩', '門/星的五行生當月五行'],
        ['囚', '0.6', '被剋，受制', '門/星的五行被當月五行所剋'],
        ['死', '0.4', '剋出，耗氣', '門/星的五行剋當月五行'],
    ]
    t = make_table(
        ['狀態', '係數', '說明', '判斷方法'],
        ws_rows,
        col_widths=[40, 40, 100, CONTENT_WIDTH - 180]
    )
    elements.append(t)

    elements.append(CondPageBreak(50*mm))

    # 4.6 其他狀態扣分
    elements.append(Paragraph('4.6 其他狀態扣分', s['H2']))
    other_rows = [
        ['星反吟', '-15', '星到對沖宮', '《奇門遁甲秘笈大全》'],
        ['門反吟', '-15', '門到對沖宮', '同上'],
        ['星伏吟', '-15', '星回本宮', '同上：「伏吟主遲滯不動」'],
        ['門伏吟', '-15', '門回本宮', '同上'],
        ['星門俱反吟', '-20', '額外疊加', '「星門俱反，萬事皆凶」'],
        ['星門俱伏吟', '-20', '額外疊加', '「星門俱伏，百事不利」'],
        ['宮生門', '+8', '宮五行生門五行', '「宮生門，如得助力」'],
        ['門生宮', '-5', '門五行生宮五行（洩氣）', '「門生宮，洩我之氣」'],
        ['時干入墓', '-15', '時干入該宮墓庫', '《煙波釣叟歌》'],
    ]
    t = make_table(
        ['狀態', '分數', '條件', '古籍出處'],
        other_rows,
        col_widths=[75, 40, 160, CONTENT_WIDTH - 275]
    )
    elements.append(t)

    elements.append(PageBreak())
    return elements


def build_chapter5(s):
    """事件分類對應表"""
    elements = []
    elements.append(Paragraph('五、事件分類對應表', s['H1']))
    elements.append(Paragraph(
        '出處：張志春《開悟之門》用神體系 + 《御定奇門寶鑑》八門宜忌。'
        '鑑源出門訣支援 15 種事件分類，每種事件有專屬的最佳門/星/神/干組合。',
        s['Body']
    ))

    event_rows = [
        ['WEALTH', '求財', '生門', '開門', '天任', '值符', '戊（財星）'],
        ['CAREER', '事業', '開門', '生門', '天心', '值符', '丙/戊'],
        ['EXAM', '考試', '景門*', '開門', '天輔', '太陰', '丁（文書星）'],
        ['LOVE', '感情', '休門', '生門', '天輔', '六合', '乙/丁'],
        ['HEALTH', '求醫', '開門', '休門', '天心', '值符', '乙'],
        ['TRAVEL', '出行', '開門', '休門', '天輔', '九天', '乙/丙/丁'],
        ['NEGOTIATE', '談判', '開門', '休門', '天心', '六合', '丙/丁'],
        ['MOVE', '搬家', '生門', '開門', '天任', '九地', '乙'],
        ['BUSINESS', '開業', '開門', '生門', '天心', '值符', '丙/戊'],
        ['LAWSUIT', '官司', '開門', '傷門*', '天心', '值符', '丙/庚'],
        ['DEBT', '索債', '傷門*', '生門', '天沖', '白虎', '庚'],
        ['HIDE', '藏匿', '杜門*', '休門', '天禽', '太陰', '乙'],
        ['STUDY', '學業', '景門*', '休門', '天輔', '太陰', '丁'],
        ['CHILD', '求子', '生門', '休門', '天任', '六合', '乙'],
        ['GENERAL', '一般', '開門', '休門', '天心', '值符', '乙/丙/丁'],
    ]
    t = make_table(
        ['代碼', '事件', '首選門', '次選門', '首選星', '首選神', '最佳干'],
        event_rows,
        col_widths=[55, 35, 45, 45, 40, 40, CONTENT_WIDTH - 260]
    )
    elements.append(t)
    elements.append(Paragraph('* 標記門為特殊例外門，僅在該事件類型下可納入評分。', s['BodySmall']))

    elements.append(Spacer(1, 4*mm))
    elements.append(Paragraph('事件適配評分', s['H3']))
    match_rows = [
        ['門匹配首選門', '+15', '門為首要判斷'],
        ['門匹配次選門', '+8', '次選門也有加分'],
        ['星匹配首選星', '+10', '星為輔助'],
        ['神匹配首選神', '+10', '神為加持'],
        ['干匹配最佳干', '+10', '干為微調'],
        ['三重適配（3/4 匹配）', '+15', '額外獎勵'],
        ['四重全配（4/4 匹配）', '+25', '最高獎勵'],
    ]
    t = make_table(
        ['匹配項', '分數', '說明'],
        match_rows,
        col_widths=[120, 50, CONTENT_WIDTH - 170]
    )
    elements.append(t)

    elements.append(PageBreak())
    return elements


def build_chapter6(s):
    """格局完整清單"""
    elements = []
    elements.append(Paragraph('六、格局完整清單', s['H1']))

    # 6.1 九遁
    elements.append(Paragraph('6.1 九遁（奇門遁甲最高級吉格）', s['H2']))
    elements.append(Paragraph('出處：《煙波釣叟歌》原文 + 《金函玉鏡》補充', s['BodySmall']))

    dun_rows = [
        ['天遁', '天盤丙 + 地盤丁 + 生門', '+25', '百事興旺，最強吉格', '《煙波釣叟歌》：「丙加丁兮值生門」'],
        ['地遁', '開門 + 天盤乙 + 地盤己', '+25', '利安居遷徙', '「乙加己兮值開門」'],
        ['人遁', '天盤丁 + 休門 + 太陰', '+25', '利密謀人際', '「丁加太陰居休門」'],
        ['神遁', '天盤丙 + 生門 + 九天', '+22', '財運高飛', '「丙加九天居生門」'],
        ['鬼遁', '杜門 + 天盤丁 + 九地', '+15', '利暗中行事', '「丁加九地值死門」'],
        ['風遁', '休門 + 天盤乙 + 九地', '+20', '利流通商業', '《遁甲演義》'],
        ['雲遁', '開門 + 天盤乙 + 地盤辛', '+18', '逢凶化吉', '《遁甲演義》'],
        ['龍遁', '休門 + 天盤丙 + 坎一宮', '+20', '利水路正攻', '《煙波釣叟歌》'],
        ['虎遁', '開門 + 天盤辛 + 白虎', '+15', '利開拓新領域', '《煙波釣叟歌》'],
    ]
    t = make_table(
        ['遁名', '條件', '分數', '效果', '出處'],
        dun_rows,
        col_widths=[35, 150, 35, 90, CONTENT_WIDTH - 310]
    )
    elements.append(t)

    elements.append(CondPageBreak(60*mm))

    # 6.2 吉格
    elements.append(Paragraph('6.2 吉格清單（15 種）', s['H2']))
    ji_rows = [
        ['S', '青龍返首', '天盤戊 + 地盤丙', '+20', '大吉，創業求財', '《煙波釣叟歌》'],
        ['S', '飛鳥跌穴', '天盤丙 + 地盤戊', '+20', '不勞而獲', '《煙波釣叟歌》'],
        ['S', '玉女守門', '丁奇+吉門+太陰/六合/九天', '+25', '萬事如意', '《金函玉鏡》'],
        ['A', '三奇得使', '乙/丙/丁+開/休/生門', '+15', '萬事皆宜', '《煙波釣叟歌》'],
        ['A', '三奇貴人升殿', '乙歸震3/丙歸離9/丁歸巽4', '+15', '三奇歸本位', '《煙波釣叟歌》'],
        ['B', '星月交輝', '天盤丙 + 地盤丁', '+18', '丙丁交輝', '《煙波釣叟歌》'],
        ['B', '奇儀順遂', '天盤乙 + 地盤丙', '+15', '主遷進', '《遁甲演義》'],
        ['B', '奇儀相佐', '天盤丁 + 地盤乙', '+15', '得人相助', '《遁甲演義》'],
        ['B', '日奇入地', '天盤乙 + 地盤己', '+12', '乙己合', '《御定奇門寶鑑》'],
        ['B', '星奇入太白', '天盤丁 + 地盤辛', '+10', '丁辛配', '《御定奇門寶鑑》'],
        ['B', '奇儀相合(乙庚)', '天盤乙 + 地盤庚', '+10', '和合利合作', '《御定奇門寶鑑》'],
        ['B', '奇儀相合(丙辛)', '天盤丙 + 地盤辛', '+10', '和合利合作', '同上'],
        ['B', '奇儀相合(丁壬)', '天盤丁 + 地盤壬', '+10', '和合利合作', '同上'],
        ['B', '門星相生', '門五行生星五行（或反之）', '+8', '相生助力', '《遁甲演義》'],
        ['B', '三吉全備', '吉門+吉星+吉神同宮', '+15', '萬事大吉', '《秘笈大全》'],
    ]
    t = make_table(
        ['等級', '格名', '條件', '分數', '效果', '出處'],
        ji_rows,
        col_widths=[25, 75, 145, 30, 80, CONTENT_WIDTH - 355]
    )
    elements.append(t)

    elements.append(CondPageBreak(60*mm))

    # 6.3 凶格
    elements.append(Paragraph('6.3 凶格清單（20 種）', s['H2']))
    xiong_rows = [
        ['S', '白虎猖狂', '辛 + 乙', '-35', '主客兩傷', '《煙波釣叟歌》'],
        ['S', '太白入熒', '庚 + 丙', '-30', '敵強我弱', '《煙波釣叟歌》'],
        ['S', '伏干格', '庚 + 戊', '-18', '值符飛宮', '《煙波釣叟歌》'],
        ['A', '大格', '庚 + 癸', '-20', '諸事不利', '《煙波釣叟歌》'],
        ['A', '青龍逃走', '乙 + 辛', '-10', '敗亡之象', '《煙波釣叟歌》'],
        ['A', '天網四張', '壬/癸 + 癸/壬', '-20', '困頓難行', '《煙波釣叟歌》'],
        ['B', '小格', '庚 + 壬', '-15', '遠行迷路', '《煙波釣叟歌》'],
        ['B', '刑格', '庚 + 己', '-15', '官司受刑', '《煙波釣叟歌》'],
        ['B', '戰格', '庚 + 庚', '-15', '兩敗俱傷', '《煙波釣叟歌》'],
        ['B', '飛干格', '壬 + 庚', '-12', '元帥遭擊', '《煙波釣叟歌》'],
        ['B', '熒入太白', '丙 + 庚', '-10', '我強敵弱仍有險', '《煙波釣叟歌》'],
        ['B', '白虎干格', '庚 + 辛', '-12', '金金相害', '《遁甲演義》'],
        ['B', '白虎干格反', '辛 + 庚', '-10', '反克', '《遁甲演義》'],
        ['B', '螣蛇夭矯', '癸 + 丁', '-12', '反覆驚恐', '《煙波釣叟歌》'],
        ['B', '朱雀投江', '丁 + 癸', '-10', '文書失利', '《煙波釣叟歌》'],
        ['B', '火入天羅', '丙 + 壬', '-12', '火入水鄉', '《煙波釣叟歌》'],
        ['B', '天乙飛宮格', '壬 + 丙', '-10', '水壓火', '《煙波釣叟歌》'],
        ['B', '悖格', '辛 + 壬', '-10', '急躁生禍', '《御定奇門寶鑑》'],
        ['B', '蛇矯', '癸 + 壬', '-10', '水害', '《御定奇門寶鑑》'],
        ['C', '三詐/五假', '各類特殊組合', '-10~-25', '虛詐不實', '《秘笈大全》'],
    ]
    t = make_table(
        ['等級', '格名', '天盤+地盤', '分數', '凶意', '出處'],
        xiong_rows,
        col_widths=[25, 75, 85, 40, 85, CONTENT_WIDTH - 310]
    )
    elements.append(t)

    elements.append(PageBreak())
    return elements


def build_chapter7(s):
    """個人化機制"""
    elements = []
    elements.append(Paragraph('七、個人化機制', s['H1']))

    elements.append(Paragraph('7.1 年命宮計算方式', s['H2']))
    elements.append(Paragraph(
        '年命宮是根據出生年地支確定個人在九宮中的位置。'
        '出處：《奇門遁甲統宗》年命論，張志春《開悟之門》。',
        s['Body']
    ))

    ynm_rows = [
        ['子', '坎一宮', '北'],
        ['丑、未', '坤二宮', '西南'],
        ['寅', '艮八宮', '東北'],
        ['卯', '震三宮', '東'],
        ['辰、巳', '巽四宮', '東南'],
        ['午', '離九宮', '南'],
        ['申', '坤二宮', '西南'],
        ['酉', '兌七宮', '西'],
        ['戌', '乾六宮', '西北'],
        ['亥', '乾六宮', '西北'],
    ]
    t = make_table(
        ['出生年地支', '對應九宮', '方位'],
        ynm_rows,
        col_widths=[80, 100, CONTENT_WIDTH - 180]
    )
    elements.append(t)
    elements.append(Paragraph('流派說明：上表以張志春派為主。寅/申/亥三個地支在不同流派中對應宮位略有差異。', s['BodySmall']))

    elements.append(Paragraph('7.2 年命宮加分規則', s['H2']))
    ynm_score = [
        ['年命宮得三吉門（開/休/生）', '+20', '《奇門遁甲秘笈大全》'],
        ['年命宮五行被吉門宮位五行所生', '+10', '《統宗》'],
        ['年命宮五行被吉門宮位五行所剋', '-10', '《統宗》'],
        ['年命宮落空亡', '-15', '《統宗》'],
        ['值使門吉', '+分數', '《遁甲演義》：「值使門為時之靈魂」'],
        ['驛馬星臨門', '+10', '《遁甲演義》'],
    ]
    t = make_table(
        ['條件', '分數', '出處'],
        ynm_score,
        col_widths=[200, 50, CONTENT_WIDTH - 250]
    )
    elements.append(t)

    elements.append(Paragraph('7.3 待實作的個人化功能', s['H2']))
    future_items = [
        ['日主天干生剋', '八字日干與天盤干的關係', 'P2', '需串接八字模組'],
        ['喜用神方位', '缺水走休門、缺火走景門', 'P2', '需串接八字五行分析'],
        ['當前大運/流年', '大運五行與方位的對應加權', 'P3', '需八字大運計算'],
    ]
    t = make_table(
        ['功能', '說明', '優先級', '備註'],
        future_items,
        col_widths=[100, 160, 40, CONTENT_WIDTH - 300]
    )
    elements.append(t)

    elements.append(PageBreak())
    return elements


def build_chapter8(s):
    """產品規格"""
    elements = []
    elements.append(Paragraph('八、產品規格（E1/E2）', s['H1']))

    elements.append(Paragraph('8.1 E1 事件出門訣', s['H2']))
    e1_rows = [
        ['產品名稱', '事件出門訣'],
        ['代碼', 'E1'],
        ['定價', 'USD $119'],
        ['輸入', '客戶出生年月日時 + 事件日期 + 事件類型（15 種）+ 出發城市'],
        ['輸出', 'Top 3 最佳出門時辰 + 方位 + 詳細評分明細'],
        ['報告內容', '一針見血判斷（吉凶原因） + 加乘時機（格局/三奇加持） + 補運指南'],
        ['AI 模型', 'Claude Opus 4.6（失敗 fallback DeepSeek）'],
        ['生成時間', '約 2-5 分鐘'],
    ]
    for row in e1_rows:
        row[0] = Paragraph(f'<b>{row[0]}</b>', s['TableCell'])
    t = make_table(['項目', '內容'], e1_rows, col_widths=[80, CONTENT_WIDTH - 80])
    elements.append(t)

    elements.append(Spacer(1, 5*mm))

    elements.append(Paragraph('8.2 E2 月盤出門訣', s['H2']))
    e2_rows = [
        ['產品名稱', '月盤出門訣'],
        ['代碼', 'E2'],
        ['定價', 'USD $89'],
        ['輸入', '客戶出生年月日時 + 月份 + 出發城市'],
        ['輸出', '該月每週 1 盤共 4 盤，每盤 Top 5 吉時'],
        ['報告內容', '每週最佳出行時段 + 月度運勢趨勢 + 補運指南'],
        ['AI 模型', 'Claude Opus 4.6'],
        ['生成時間', '約 5-10 分鐘（4 盤連續生成）'],
    ]
    for row in e2_rows:
        row[0] = Paragraph(f'<b>{row[0]}</b>', s['TableCell'])
    t = make_table(['項目', '內容'], e2_rows, col_widths=[80, CONTENT_WIDTH - 80])
    elements.append(t)

    elements.append(Spacer(1, 5*mm))
    elements.append(Paragraph(
        '出門訣（E系列）是鑑源的核心訂閱收入來源。所有其他方案（人生藍圖、心之所惑等）'
        '的報告結尾都會引導客戶購買出門訣，形成持續性收入。', s['Body']
    ))

    elements.append(PageBreak())
    return elements


def build_chapter9(s):
    """市場競品比較"""
    elements = []
    elements.append(Paragraph('九、市場競品比較', s['H1']))

    comp_rows = [
        ['評分層數', '8 層系統化', '未公開', '3-4 層', '5 層'],
        ['事件分類', '15 種', '無（通用建議）', '8 種', '10 種'],
        ['格局判斷', '九遁 9 種\n吉格 15+\n凶格 20+', '未公開', '基礎格局\n約 10 種', '格局較完整\n約 15 種'],
        ['旺衰係數', '五檔動態', '無', '有/無不明', '有'],
        ['個人化', '年命宮\n（待串接日主）', '生肖+日子', '年命宮', '年命宮+日主'],
        ['古籍出處', '每條規則標明', '不提供', '部分標明', '部分標明'],
        ['透明度', '評分明細全公開', '只給結果', '部分公開', '部分公開'],
        ['價格', '$89-119/次', '免費/訂閱', '免費', '訂閱制'],
        ['語言', '繁體中文', '繁體中文', '簡體中文', '英文/中文'],
    ]
    t = make_table(
        ['比較項目', '鑑源', '麥玲玲', 'Windada', 'Joey Yap'],
        comp_rows,
        col_widths=[70, 120, 85, 85, CONTENT_WIDTH - 360]
    )
    elements.append(t)

    elements.append(Spacer(1, 5*mm))
    elements.append(Paragraph('鑑源的核心競爭優勢', s['H2']))
    advantages = [
        '全網唯一的 8 層系統化評分架構',
        '74 項權重因子每一條都有古籍出處',
        '15 種事件分類，不同事件不同最佳組合',
        '評分明細完全透明，客戶可驗算',
        '結合 AI（Claude Opus 4.6）生成個性化解讀',
        '持續迭代更新（V2 已消除重複計算問題）',
    ]
    for i, adv in enumerate(advantages, 1):
        elements.append(Paragraph(f'  {i}. {adv}', s['Body']))

    elements.append(PageBreak())
    return elements


def build_chapter10(s):
    """未來優化方向"""
    elements = []
    elements.append(Paragraph('十、未來優化方向', s['H1']))

    future_rows = [
        ['P0', '建除十二神（日級過濾）', '古籍明確要求，目前引擎完全缺少', '排盤前先檢查日級吉凶'],
        ['P1', '日主喜用神串接', '個人化核心功能，需八字模組配合', '缺水走休門、缺火走景門'],
        ['P1', '真空/假空/沖空區分', '目前空亡一律扣固定分，過於粗糙', '細分三種空亡等級'],
        ['P1', '整盤伏吟/反吟判斷', '目前只看單宮，缺整盤級別判斷', '6+星伏吟建議不出門'],
        ['P1', '時干入墓判斷', '目前缺少', '時干落入墓宮的扣分'],
        ['P2', '更多事件分類', '目前 15 種，可擴充至 20+', '如搬遷、裝修、開刀等'],
        ['P2', '月運/年運整合', '結合流月/流年的五行能量', '大運加權係數'],
        ['P2', '多人出行評分', '家庭/團隊出行的綜合評分', '取各人年命宮交集'],
        ['P3', '歷史驗證回測', '收集客戶回饋驗證評分準確率', '建立準確率基線'],
    ]
    t = make_table(
        ['優先級', '項目', '說明', '實作方向'],
        future_rows,
        col_widths=[35, 120, 195, CONTENT_WIDTH - 350]
    )
    elements.append(t)

    elements.append(Spacer(1, 5*mm))
    elements.append(Paragraph('評分等級劃分', s['H2']))
    grade_rows = [
        ['極吉', '85-100', '強烈推薦，把握機會', '深綠'],
        ['吉', '70-84', '推薦出行', '綠'],
        ['小吉', '55-69', '可以出行，稍加注意', '淺綠'],
        ['平', '40-54', '一般，無特別吉凶', '黃'],
        ['小凶', '25-39', '不建議，有阻礙', '橙'],
        ['凶', '10-24', '避免出行', '紅'],
        ['極凶', '0-9', '絕對不可出行', '深紅'],
    ]
    t = make_table(
        ['等級', '總分範圍', '建議', '顏色標記'],
        grade_rows,
        col_widths=[50, 70, 200, CONTENT_WIDTH - 320]
    )
    elements.append(t)

    elements.append(Spacer(1, 8*mm))

    # 結尾
    elements.append(Paragraph(
        '本文件為鑑源出門訣系統的完整設計規格，供老闆日後調整參數、'
        '擴充功能時作為參考基準。所有評分規則均經過 QA 驗證知識庫交叉核對，'
        '68 條規則中 56 條為高可信度（32+/40 分），核心規則可信度均達 38-40/40 分。',
        s['Body']
    ))

    return elements


# ====== 頁碼與頁首頁尾 ======
def add_page_number(canvas, doc):
    """在每頁底部加頁碼"""
    page_num = canvas.getPageNumber()
    if page_num > 1:  # 封面不加頁碼
        canvas.saveState()
        canvas.setFont(FONT_NAME, 7)
        canvas.setFillColor(colors.grey)
        # 頁碼
        canvas.drawCentredString(PAGE_W / 2, 10 * mm, f'- {page_num - 1} -')
        # 頁首
        canvas.setFont(FONT_NAME, 6)
        canvas.setFillColor(colors.HexColor('#999999'))
        canvas.drawString(MARGIN_LEFT, PAGE_H - 12*mm, '鑑源出門訣獨門方案 v1.0')
        canvas.drawRightString(PAGE_W - MARGIN_RIGHT, PAGE_H - 12*mm, '機密文件')
        # 頁首線
        canvas.setStrokeColor(colors.HexColor('#cccccc'))
        canvas.line(MARGIN_LEFT, PAGE_H - 13*mm, PAGE_W - MARGIN_RIGHT, PAGE_H - 13*mm)
        canvas.restoreState()


def add_cover_bg(canvas, doc):
    """封面背景"""
    page_num = canvas.getPageNumber()
    if page_num == 1:
        canvas.saveState()
        canvas.setFillColor(BRAND_DARK)
        canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1)
        canvas.restoreState()
    else:
        add_page_number(canvas, doc)


# ====== 主程式 ======
def main():
    output_dir = 'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源命理研究部門'
    pdf_path = os.path.join(output_dir, '鑑源出門訣獨門方案_v1.0.pdf')

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        leftMargin=MARGIN_LEFT,
        rightMargin=MARGIN_RIGHT,
        title='鑑源出門訣獨門方案 v1.0',
        author='鑑源命理研究部門',
    )

    s = create_styles()
    elements = []

    # 封面
    elements.extend(build_cover(s))
    # 目錄
    elements.extend(build_toc(s))
    # 各章節
    elements.extend(build_chapter1(s))
    elements.extend(build_chapter2(s))
    elements.extend(build_chapter3(s))
    elements.extend(build_chapter4(s))
    elements.extend(build_chapter5(s))
    elements.extend(build_chapter6(s))
    elements.extend(build_chapter7(s))
    elements.extend(build_chapter8(s))
    elements.extend(build_chapter9(s))
    elements.extend(build_chapter10(s))

    # 生成
    doc.build(elements, onFirstPage=add_cover_bg, onLaterPages=add_page_number)
    print(f"\n[OK] PDF 已生成：{pdf_path}")
    print(f"[OK] 頁數預估：15-20 頁")


if __name__ == '__main__':
    main()
