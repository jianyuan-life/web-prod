#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
鑑源 E1/E2 出門訣報告 PDF 生成器 v2.0 （客戶版）
=========================================================
輸入：客戶姓名、方案（E1/E2）、Top3 吉時（E1）或 4 週吉時（E2）、補運指南、忌方
輸出：A4 客戶報告 PDF（金色封面、日曆卡、方位圖、補運操作法、忌方清單）

設計目標：
- E1：Top3 吉時日曆卡（排版類似機票/演唱會票）+ 方位圖 + 補運操作
- E2：4 週月度式排版（四張週卡）+ 每週重點 + 補運
- 封面：客戶姓名 + 方案名 + 生成日期 + 金色品牌色
- 每頁頁眉/頁尾：鑑源金色徽記 + 頁碼 + 客戶名

本檔也可作為 Fly.io Python API `generate-pdf` 端點生成 E1/E2 PDF 時的參考版型。
若作為 CLI 使用：`python generate_chumenji_pdf.py <E1|E2> [sample|path/to/data.json]`
"""

from __future__ import annotations

import os
import sys
import json
import argparse
from datetime import datetime
from typing import Any

from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame,
    Paragraph, Spacer, Table, TableStyle,
    PageBreak, CondPageBreak, Flowable,
)
from reportlab.platypus.doctemplate import NextPageTemplate
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ============================================================
# 頁面參數（嚴格遵守全域 PDF 規則 ~/.claude/rules/pdf-generation.md）
# ============================================================
PAGE_W, PAGE_H = A4  # 595pt x 842pt
MARGIN_TOP = 18 * mm
MARGIN_BOTTOM = 15 * mm
MARGIN_LEFT = 15 * mm
MARGIN_RIGHT = 15 * mm
CONTENT_WIDTH = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT   # 511pt
CONTENT_HEIGHT = PAGE_H - MARGIN_TOP - MARGIN_BOTTOM  # ~780pt

# ============================================================
# 品牌色（與前端 /report/[token] 金色 #c9a84c + 深藍 #0a0e1a 對齊）
# ============================================================
BRAND_DARK = colors.HexColor('#0a0e1a')           # 深藍（封面底 / 頁眉線）
BRAND_DARK2 = colors.HexColor('#111a33')          # 淺一階深藍（漸層用）
BRAND_GOLD = colors.HexColor('#c9a84c')           # 金色主色
BRAND_GOLD_LIGHT = colors.HexColor('#e8c87a')     # 淺金（漸層 / 裝飾）
BRAND_GOLD_PALE = colors.HexColor('#f7dfa0')      # 珠光金（高光）
BRAND_IVORY = colors.HexColor('#faf6ec')          # 米白（卡片底）
BRAND_INK = colors.HexColor('#1f2438')            # 文字主色（非純黑，較溫潤）
BRAND_INK_MUTED = colors.HexColor('#6b7280')      # 輔助文字灰
CARD_BORDER = colors.HexColor('#d4c48a')          # 卡片金邊
SEP_LINE = colors.HexColor('#e3d9b5')             # 分隔線
GOOD_GREEN = colors.HexColor('#2e7d32')
BAD_RED = colors.HexColor('#c62828')

# ============================================================
# 字體註冊（Windows 優先；Fly.io 容器用 Noto Sans CJK）
# ============================================================
FONT_NAME = 'ChineseFont'
FONT_BOLD = 'ChineseFontBold'
_font_registered = False

FONT_SEARCH_PATHS = [
    # Windows
    'C:/Windows/Fonts/msjh.ttc',
    'C:/Windows/Fonts/msyh.ttc',
    'C:/Windows/Fonts/simsun.ttc',
    # macOS
    '/System/Library/Fonts/PingFang.ttc',
    '/System/Library/Fonts/STHeiti Medium.ttc',
    # Linux / Fly.io
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
    '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
]

for _fp in FONT_SEARCH_PATHS:
    if os.path.exists(_fp):
        try:
            pdfmetrics.registerFont(TTFont(FONT_NAME, _fp, subfontIndex=0))
            try:
                pdfmetrics.registerFont(TTFont(FONT_BOLD, _fp, subfontIndex=1))
            except Exception:
                pdfmetrics.registerFont(TTFont(FONT_BOLD, _fp, subfontIndex=0))
            _font_registered = True
            break
        except Exception:
            continue

if not _font_registered:
    print('[FATAL] 無可用中文字體', file=sys.stderr)
    sys.exit(1)


# ============================================================
# 樣式
# ============================================================
def build_styles() -> dict[str, ParagraphStyle]:
    s: dict[str, ParagraphStyle] = {}
    # 封面
    s['CoverBrand'] = ParagraphStyle(
        'CoverBrand', fontName=FONT_BOLD, fontSize=13, leading=18,
        alignment=TA_CENTER, textColor=BRAND_GOLD, spaceAfter=3 * mm,
    )
    s['CoverTitle'] = ParagraphStyle(
        'CoverTitle', fontName=FONT_BOLD, fontSize=28, leading=38,
        alignment=TA_CENTER, textColor=colors.white, spaceAfter=4 * mm,
    )
    s['CoverSub'] = ParagraphStyle(
        'CoverSub', fontName=FONT_NAME, fontSize=13, leading=20,
        alignment=TA_CENTER, textColor=BRAND_GOLD_LIGHT, spaceAfter=2 * mm,
    )
    s['CoverName'] = ParagraphStyle(
        'CoverName', fontName=FONT_BOLD, fontSize=20, leading=28,
        alignment=TA_CENTER, textColor=colors.white,
    )
    s['CoverLabel'] = ParagraphStyle(
        'CoverLabel', fontName=FONT_NAME, fontSize=9, leading=14,
        alignment=TA_CENTER, textColor=BRAND_GOLD_LIGHT,
    )
    s['CoverDate'] = ParagraphStyle(
        'CoverDate', fontName=FONT_NAME, fontSize=11, leading=16,
        alignment=TA_CENTER, textColor=colors.white,
    )
    s['CoverFooter'] = ParagraphStyle(
        'CoverFooter', fontName=FONT_NAME, fontSize=8.5, leading=12,
        alignment=TA_CENTER, textColor=BRAND_GOLD_LIGHT,
    )

    # 章節
    s['H1'] = ParagraphStyle(
        'H1', fontName=FONT_BOLD, fontSize=18, leading=26,
        textColor=BRAND_DARK, spaceBefore=6 * mm, spaceAfter=4 * mm,
        borderPadding=(0, 0, 3, 0),
    )
    s['H2'] = ParagraphStyle(
        'H2', fontName=FONT_BOLD, fontSize=13.5, leading=20,
        textColor=BRAND_DARK, spaceBefore=4 * mm, spaceAfter=2.5 * mm,
    )
    s['Lead'] = ParagraphStyle(
        'Lead', fontName=FONT_NAME, fontSize=10.5, leading=18,
        textColor=BRAND_INK, alignment=TA_JUSTIFY, spaceAfter=4 * mm,
    )
    s['Body'] = ParagraphStyle(
        'Body', fontName=FONT_NAME, fontSize=10, leading=17,
        textColor=BRAND_INK, alignment=TA_JUSTIFY, spaceAfter=2.5 * mm,
    )
    s['BodyMuted'] = ParagraphStyle(
        'BodyMuted', fontName=FONT_NAME, fontSize=8.5, leading=13,
        textColor=BRAND_INK_MUTED, alignment=TA_LEFT,
    )

    # 日曆卡
    s['CardRank'] = ParagraphStyle(
        'CardRank', fontName=FONT_BOLD, fontSize=22, leading=26,
        textColor=BRAND_GOLD, alignment=TA_CENTER,
    )
    s['CardRankLabel'] = ParagraphStyle(
        'CardRankLabel', fontName=FONT_NAME, fontSize=8.5, leading=11,
        textColor=BRAND_GOLD_LIGHT, alignment=TA_CENTER,
    )
    s['CardDate'] = ParagraphStyle(
        'CardDate', fontName=FONT_BOLD, fontSize=14, leading=20,
        textColor=BRAND_DARK, alignment=TA_LEFT,
    )
    s['CardTime'] = ParagraphStyle(
        'CardTime', fontName=FONT_BOLD, fontSize=20, leading=26,
        textColor=BRAND_DARK, alignment=TA_LEFT,
    )
    s['CardDir'] = ParagraphStyle(
        'CardDir', fontName=FONT_BOLD, fontSize=18, leading=24,
        textColor=BRAND_GOLD, alignment=TA_CENTER,
    )
    s['CardLabel'] = ParagraphStyle(
        'CardLabel', fontName=FONT_NAME, fontSize=8, leading=11,
        textColor=BRAND_INK_MUTED, alignment=TA_LEFT,
    )
    s['CardValue'] = ParagraphStyle(
        'CardValue', fontName=FONT_BOLD, fontSize=10.5, leading=14,
        textColor=BRAND_INK, alignment=TA_LEFT,
    )
    s['CardReason'] = ParagraphStyle(
        'CardReason', fontName=FONT_NAME, fontSize=10, leading=16,
        textColor=BRAND_INK, alignment=TA_JUSTIFY,
    )

    # 週卡（E2）
    s['WeekTag'] = ParagraphStyle(
        'WeekTag', fontName=FONT_BOLD, fontSize=10, leading=13,
        textColor=colors.white, alignment=TA_CENTER,
    )
    s['WeekTitle'] = ParagraphStyle(
        'WeekTitle', fontName=FONT_BOLD, fontSize=13, leading=18,
        textColor=BRAND_DARK, alignment=TA_LEFT,
    )
    s['WeekRange'] = ParagraphStyle(
        'WeekRange', fontName=FONT_NAME, fontSize=9, leading=12,
        textColor=BRAND_INK_MUTED, alignment=TA_LEFT,
    )

    # 操作列表
    s['StepNum'] = ParagraphStyle(
        'StepNum', fontName=FONT_BOLD, fontSize=11, leading=15,
        textColor=BRAND_GOLD, alignment=TA_CENTER,
    )
    s['StepTitle'] = ParagraphStyle(
        'StepTitle', fontName=FONT_BOLD, fontSize=10.5, leading=15,
        textColor=BRAND_DARK, alignment=TA_LEFT,
    )
    s['StepDesc'] = ParagraphStyle(
        'StepDesc', fontName=FONT_NAME, fontSize=9.5, leading=16,
        textColor=BRAND_INK, alignment=TA_JUSTIFY,
    )

    # 提醒/警告
    s['Warn'] = ParagraphStyle(
        'Warn', fontName=FONT_NAME, fontSize=9, leading=14,
        textColor=BAD_RED, alignment=TA_LEFT,
    )
    return s


# ============================================================
# 自訂 Flowable：方位羅盤圖（八卦方位）
# ============================================================
class CompassRose(Flowable):
    """
    小型方位圖，標示出門方位。
    lucky_directions: list[str]  吉方位（用金色大字）
    avoid_directions: list[str]  忌方位（用紅色）
    """

    DIRECTIONS = ['北', '東北', '東', '東南', '南', '西南', '西', '西北']
    # 對應角度（0° = 3點鐘方向=東；90° = 12點鐘方向=北，逆時針為正）
    ANGLES = [90, 45, 0, -45, -90, -135, 180, 135]

    def __init__(self, width: float = 60 * mm, lucky: list[str] | None = None,
                 avoid: list[str] | None = None):
        super().__init__()
        self.width = width
        self.height = width
        self.lucky = set(lucky or [])
        self.avoid = set(avoid or [])

    def wrap(self, availWidth: float, availHeight: float):
        return self.width, self.height

    def draw(self) -> None:
        from math import cos, sin, radians
        c = self.canv
        cx, cy = self.width / 2, self.height / 2
        r_outer = self.width / 2 - 2
        r_inner = r_outer * 0.55

        # 外圈金邊
        c.setStrokeColor(BRAND_GOLD)
        c.setLineWidth(1.2)
        c.circle(cx, cy, r_outer, stroke=1, fill=0)
        c.setStrokeColor(SEP_LINE)
        c.setLineWidth(0.4)
        c.circle(cx, cy, r_inner, stroke=1, fill=0)

        # 八條方位射線
        for ang in [0, 45, 90, 135, 180, 225, 270, 315]:
            a = radians(ang)
            x1, y1 = cx + r_inner * cos(a), cy + r_inner * sin(a)
            x2, y2 = cx + r_outer * cos(a), cy + r_outer * sin(a)
            c.setStrokeColor(SEP_LINE)
            c.line(x1, y1, x2, y2)

        # 標註八方位
        for d, ang in zip(self.DIRECTIONS, self.ANGLES):
            a = radians(ang)
            rr = r_outer - 6
            x = cx + rr * cos(a)
            y = cy + rr * sin(a) - 3
            if d in self.lucky:
                c.setFillColor(BRAND_GOLD)
                c.setFont(FONT_BOLD, 9)
            elif d in self.avoid:
                c.setFillColor(BAD_RED)
                c.setFont(FONT_NAME, 8)
            else:
                c.setFillColor(BRAND_INK_MUTED)
                c.setFont(FONT_NAME, 8)
            c.drawCentredString(x, y, d)

        # 中心金色 ✦ 符號
        c.setFillColor(BRAND_GOLD)
        c.setFont(FONT_BOLD, 10)
        c.drawCentredString(cx, cy - 3, '✦')


# ============================================================
# 封面
# ============================================================
def build_cover(styles: dict[str, ParagraphStyle], client_name: str, plan_code: str,
                plan_name: str, generated_date: str,
                event_label: str | None = None) -> list[Flowable]:
    """封面文字流（深藍底 + 金邊由頁面模板繪製；額外加三奇金色印記）"""
    els: list[Flowable] = []

    els.append(Spacer(1, 20 * mm))
    els.append(Paragraph('鑑 源 命 理', styles['CoverBrand']))
    els.append(Spacer(1, 5 * mm))

    line = Table([['']], colWidths=[80 * mm], rowHeights=[1.2])
    line.setStyle(TableStyle([('BACKGROUND', (0, 0), (-1, -1), BRAND_GOLD)]))
    els.append(line)
    els.append(Spacer(1, 10 * mm))

    # 金色三奇符號（乙丙丁）印記作為視覺焦點
    seal = Paragraph(
        '<font face="ChineseFontBold" color="#e8c87a" size="24">乙 &nbsp; 丙 &nbsp; 丁</font>',
        styles['CoverLabel'],
    )
    els.append(seal)
    els.append(Spacer(1, 14 * mm))

    els.append(Paragraph(plan_name, styles['CoverTitle']))
    els.append(Spacer(1, 3 * mm))
    sub_text = 'Top 3 加乘時機' if plan_code == 'E1' else '四週吉時月度'
    els.append(Paragraph(sub_text, styles['CoverSub']))

    els.append(Spacer(1, 8 * mm))
    els.append(line)
    els.append(Spacer(1, 22 * mm))

    els.append(Paragraph('專為', styles['CoverLabel']))
    els.append(Spacer(1, 3 * mm))
    els.append(Paragraph(client_name, styles['CoverName']))
    els.append(Spacer(1, 2 * mm))
    els.append(Paragraph('量身排算', styles['CoverLabel']))

    if event_label:
        els.append(Spacer(1, 6 * mm))
        tag = Table(
            [[Paragraph(event_label, styles['CoverLabel'])]],
            colWidths=[90 * mm],
        )
        tag.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.Color(1, 1, 1, alpha=0.08)),
            ('BOX', (0, 0), (-1, -1), 0.5, BRAND_GOLD),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ]))
        els.append(tag)

    els.append(Spacer(1, 22 * mm))
    els.append(Paragraph(f'生成日期：{generated_date}', styles['CoverDate']))

    els.append(Spacer(1, 40 * mm))
    els.append(Paragraph(
        '本報告基於奇門遁甲古典理論量身排算  ·  jianyuan.life',
        styles['CoverFooter'],
    ))

    return els


# ============================================================
# E1：Top3 吉時日曆卡
# ============================================================
def _h1_with_bar(styles: dict[str, ParagraphStyle], text: str,
                 subtitle: str | None = None) -> Flowable:
    """
    H1 標題：金色左側細條（2mm）+ 深藍粗體文字 + 底部金色細線
    升級版：更精緻、更像出版品章節頁
    """
    # 左側細金條（雙線設計：粗+細）
    bar = Table([['']], colWidths=[2.5 * mm], rowHeights=[24])
    bar.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BRAND_GOLD),
    ]))
    title_para = Paragraph(text, styles['H1'])
    if subtitle:
        text_block = Table(
            [
                [title_para],
                [Paragraph(
                    f'<font face="ChineseFont" color="#6b7280" size="9">{subtitle}</font>',
                    styles['BodyMuted'])],
            ],
            colWidths=[CONTENT_WIDTH - 6 * mm],
        )
        text_block.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
    else:
        text_block = Table(
            [[title_para]],
            colWidths=[CONTENT_WIDTH - 6 * mm],
        )
        text_block.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))

    row = Table([[bar, text_block]], colWidths=[3.5 * mm, CONTENT_WIDTH - 3.5 * mm])
    row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LINEBELOW', (0, 0), (-1, 0), 0.4, BRAND_GOLD_LIGHT),
    ]))
    return row


def build_e1_top3_cards(styles: dict[str, ParagraphStyle],
                        timings: list[dict[str, Any]]) -> list[Flowable]:
    els: list[Flowable] = []

    els.append(_h1_with_bar(styles, '一、Top 3 加乘時機',
                            subtitle='奇門遁甲為你排算的三個最佳出行時段'))
    els.append(Paragraph(
        '以下三個時段為奇門遁甲引擎為你排算出的最佳出行時機，按強度排序。'
        '請配合建議方位與補運動作一併進行，以強化當下天時加持。',
        styles['Lead'],
    ))
    els.append(Spacer(1, 4 * mm))

    for i, t in enumerate(timings[:3]):
        card = _build_e1_card(styles, t, i + 1)
        els.append(card)
        if i < 2:
            els.append(Spacer(1, 6 * mm))

    return els


def _build_e1_summary(styles: dict[str, ParagraphStyle],
                      timings: list[dict[str, Any]]) -> Flowable:
    """Top3 速查條：三格並排顯示 rank/date/time/direction（強化首觸印象）"""
    cells = []
    for i, t in enumerate(timings):
        rank = t.get('rank', i + 1)
        date_str = t.get('date', '') or t.get('solar_date', '')
        time_range = t.get('time_range', '')
        if not time_range and (t.get('time_start') or t.get('time_end')):
            time_range = f"{t.get('time_start', '')}–{t.get('time_end', '')}"
        direction = t.get('direction', '')

        cell_body = Paragraph(
            f'<font face="ChineseFont" color="#e8c87a" size="8">TOP {rank}</font><br/>'
            f'<font face="ChineseFontBold" color="#ffffff" size="10">{date_str}</font><br/>'
            f'<font face="ChineseFont" color="#ffffff" size="9">{time_range}</font><br/>'
            f'<font face="ChineseFontBold" color="#c9a84c" size="14">{direction}</font>',
            styles['CardValue'],
        )
        cells.append(cell_body)

    summary = Table(
        [cells],
        colWidths=[CONTENT_WIDTH / 3] * 3,
    )
    summary.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BRAND_DARK),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LINEAFTER', (0, 0), (0, 0), 0.5, BRAND_GOLD_LIGHT),
        ('LINEAFTER', (1, 0), (1, 0), 0.5, BRAND_GOLD_LIGHT),
        ('BOX', (0, 0), (-1, -1), 1, BRAND_GOLD),
    ]))
    return summary


def _build_e1_card(styles: dict[str, ParagraphStyle], t: dict[str, Any],
                   fallback_rank: int) -> Flowable:
    rank = t.get('rank', fallback_rank)
    date_str = t.get('date', '') or t.get('solar_date', '')
    time_range = t.get('time_range', '')
    if not time_range and (t.get('time_start') or t.get('time_end')):
        time_range = f"{t.get('time_start', '')}–{t.get('time_end', '')}"
    direction = t.get('direction', '')
    star = t.get('star', '')
    door = t.get('door', '')
    shen = t.get('shen', '') or t.get('god', '')
    shichen = t.get('shichen', '')
    score = t.get('score', '')
    reason = t.get('reason', '')

    # ── 頂欄：深藍「TOP N ｜ 加乘時機」金色標題條 ──
    grade_text = {1: '最強加乘', 2: '次強加乘', 3: '強烈推薦'}.get(rank, '推薦時機')
    score_text = f'<font color="#e8c87a">匹配度 {score}</font>' if score else ''
    header_bar = Table(
        [[
            Paragraph(
                f'<font color="#e8c87a" size="9">TOP</font>'
                f' <font color="#ffffff" size="18"><b>{rank}</b></font>'
                f' <font color="#e8c87a" size="10">｜{grade_text}</font>',
                styles['CardLabel'],
            ),
            Paragraph(score_text, styles['CardLabel']),
        ]],
        colWidths=[CONTENT_WIDTH * 0.55, CONTENT_WIDTH * 0.45],
    )
    header_bar.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BRAND_DARK),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))

    # ── 主視覺列：大字日期 ｜ 大字時間 ｜ 大字方位 ──
    hero_cells = [
        Paragraph(
            f'<font face="ChineseFont" color="#6b7280" size="8">DATE</font><br/>'
            f'<font face="ChineseFontBold" color="#0a0e1a" size="15">{date_str or "—"}</font>',
            styles['CardValue'],
        ),
        Paragraph(
            f'<font face="ChineseFont" color="#6b7280" size="8">TIME</font><br/>'
            f'<font face="ChineseFontBold" color="#0a0e1a" size="17">{time_range or "—"}</font>'
            f'<font face="ChineseFont" color="#6b7280" size="9">  {shichen}時</font>' if shichen
            else f'<font face="ChineseFont" color="#6b7280" size="8">TIME</font><br/>'
                 f'<font face="ChineseFontBold" color="#0a0e1a" size="17">{time_range or "—"}</font>',
            styles['CardValue'],
        ),
        Paragraph(
            f'<font face="ChineseFont" color="#6b7280" size="8">DIRECTION</font><br/>'
            f'<font face="ChineseFontBold" color="#c9a84c" size="20">{direction or "—"}</font>',
            styles['CardValue'],
        ),
    ]
    hero_row = Table(
        [hero_cells],
        colWidths=[CONTENT_WIDTH * 0.34, CONTENT_WIDTH * 0.36, CONTENT_WIDTH * 0.30],
    )
    hero_row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('ALIGN', (2, 0), (2, 0), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 14),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ('LEFTPADDING', (0, 0), (-1, -1), 16),
        ('RIGHTPADDING', (0, 0), (-1, -1), 16),
        ('LINEAFTER', (0, 0), (0, 0), 0.4, SEP_LINE),
        ('LINEAFTER', (1, 0), (1, 0), 0.4, SEP_LINE),
    ]))

    # ── 第二列：羅盤 + 門星神分 ──
    compass_col = Table(
        [
            [CompassRose(width=30 * mm, lucky=[direction] if direction else [])],
        ],
        colWidths=[34 * mm],
        rowHeights=[30 * mm],
    )
    compass_col.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))

    # 門星神分：四格橫排
    stat_cells = [
        ('門', door or '—'),
        ('星', star or '—'),
        ('神', shen or '—'),
    ]
    if score not in (None, '', 0):
        stat_cells.append(('分', str(score)))

    stat_row = []
    for lab, val in stat_cells:
        col = '#c9a84c' if lab == '分' else '#0a0e1a'
        stat_row.append(Paragraph(
            f'<font face="ChineseFont" color="#6b7280" size="8">{lab}</font><br/>'
            f'<font face="ChineseFontBold" color="{col}" size="14">{val}</font>',
            styles['CardValue'],
        ))
    stat_table = Table(
        [stat_row],
        colWidths=[(CONTENT_WIDTH - 34 * mm) / len(stat_row)] * len(stat_row),
    )
    stat_style = [
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fafbfc')),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]
    for i in range(1, len(stat_row)):
        stat_style.append(('LINEBEFORE', (i, 0), (i, 0), 0.3, SEP_LINE))
    stat_table.setStyle(TableStyle(stat_style))

    middle_row = Table(
        [[hero_row], [
            Table(
                [[compass_col, stat_table]],
                colWidths=[34 * mm, CONTENT_WIDTH - 34 * mm],
            )
        ]],
        colWidths=[CONTENT_WIDTH],
    )
    middle_row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('LINEBELOW', (0, 0), (-1, 0), 0.4, SEP_LINE),
    ]))

    # ── 底欄：米白底 + 金色左側粗條 + 標籤獨立一列的「為什麼加乘」段落 ──
    reason_box_inner = Table(
        [
            [Paragraph(
                '<font face="ChineseFontBold" color="#c9a84c" size="11">✦ 為什麼這個時間能加乘</font>',
                styles['CardReason'])],
            [Paragraph(
                f'<font face="ChineseFont" color="#1f2438" size="10">{reason or "—"}</font>',
                styles['CardReason'])],
        ],
        colWidths=[CONTENT_WIDTH - 20 * mm],
    )
    reason_box_inner.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    reason_box = Table(
        [[reason_box_inner]],
        colWidths=[CONTENT_WIDTH],
    )
    reason_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fcf6e3')),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
        ('LINEBEFORE', (0, 0), (0, 0), 4, BRAND_GOLD),
    ]))

    card = Table(
        [[header_bar], [middle_row], [reason_box]],
        colWidths=[CONTENT_WIDTH],
    )
    card.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1.2, BRAND_GOLD),
        ('INNERGRID', (0, 0), (-1, -1), 0, colors.white),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    return card


# ============================================================
# E2：4 週月度式
# ============================================================
def build_e2_week_cards(styles: dict[str, ParagraphStyle],
                        timings: list[dict[str, Any]]) -> list[Flowable]:
    els: list[Flowable] = []

    els.append(_h1_with_bar(styles, '一、本月四週吉時月度',
                            subtitle='每週一次最佳出行時段，共四次建議'))
    els.append(Paragraph(
        '以下為整月每一週最強的出行時段。每週一張卡，顯示該週吉日、吉時、吉方與重點活動建議。'
        '建議將本表列印後貼於辦公桌或行事曆旁，作為整月的出行指引。',
        styles['Lead'],
    ))
    els.append(Spacer(1, 4 * mm))

    for t in timings[:4]:
        els.append(_build_e2_week_card(styles, t))
        els.append(Spacer(1, 5 * mm))
    return els


def _build_e2_week_card(styles: dict[str, ParagraphStyle], t: dict[str, Any]) -> Flowable:
    week_num = t.get('week', t.get('week_number', '—'))
    week_label = t.get('week_label', f'第 {week_num} 週')
    week_range = t.get('week_range', '')
    date_str = t.get('date', '') or t.get('solar_date', '')
    time_range = t.get('time_range', '')
    if not time_range and (t.get('time_start') or t.get('time_end')):
        time_range = f"{t.get('time_start', '')}–{t.get('time_end', '')}"
    direction = t.get('direction', '')
    star = t.get('star', '')
    door = t.get('door', '')
    shen = t.get('shen', '') or t.get('god', '')
    reason = t.get('reason', '')

    # ── 頂欄：深藍 WEEK N 條 ──
    header_bar = Table(
        [[
            Paragraph(
                f'<font color="#e8c87a" size="9">WEEK</font>'
                f' <font color="#ffffff" size="18"><b>{week_num}</b></font>'
                f' <font color="#e8c87a" size="10">｜{week_label}</font>',
                styles['CardLabel'],
            ),
            Paragraph(
                f'<font color="#f7dfa0" size="9">{week_range}</font>',
                styles['CardLabel'],
            ),
        ]],
        colWidths=[CONTENT_WIDTH * 0.55, CONTENT_WIDTH * 0.45],
    )
    header_bar.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BRAND_DARK),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 12),
        ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))

    # ── 左側資訊：改為 2x2 格狀資訊塊（吉日/吉時/門星神/分），每項有淡底 ──
    def info_cell(label: str, value: str, value_size: int = 13) -> Table:
        t = Table(
            [
                [Paragraph(
                    f'<font face="ChineseFont" color="#6b7280" size="8">{label}</font>',
                    styles['CardLabel'])],
                [Paragraph(
                    f'<font face="ChineseFontBold" color="#0a0e1a" size="{value_size}">{value or "—"}</font>',
                    styles['CardValue'])],
            ],
            colWidths=[(CONTENT_WIDTH - 60 * mm) / 2 - 2 * mm],
        )
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fafbfc')),
            ('BOX', (0, 0), (-1, -1), 0.3, SEP_LINE),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ]))
        return t

    left_info = Table(
        [
            [info_cell('吉日', date_str, 12), info_cell('吉時', time_range, 12)],
            [info_cell('門 · 星 · 神',
                       f'{door or "—"}  ·  {star or "—"}  ·  {shen or "—"}', 10),
             info_cell('建議方向', direction, 13)],
        ],
        colWidths=[(CONTENT_WIDTH - 60 * mm) / 2, (CONTENT_WIDTH - 60 * mm) / 2],
    )
    left_info.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))

    # ── 右側方位羅盤（純視覺標記；方向大字已移到左側「建議方向」格） ──
    right_col = Table(
        [
            [Paragraph(
                '<font face="ChineseFont" color="#6b7280" size="8">吉方標記</font>',
                styles['CardLabel'])],
            [CompassRose(width=42 * mm, lucky=[direction] if direction else [])],
        ],
        colWidths=[56 * mm],
        rowHeights=[14, 42 * mm],
    )
    right_col.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))

    mid_row = Table(
        [[left_info, right_col]],
        colWidths=[CONTENT_WIDTH - 60 * mm, 60 * mm],
    )
    mid_row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (0, 0), 8),
        ('RIGHTPADDING', (1, 0), (1, 0), 8),
        ('LINEBEFORE', (1, 0), (1, 0), 0.4, SEP_LINE),
    ]))

    # ── 底欄：金色左側條 + 本週重點（提升視覺權重：標籤獨立一列+加大字體） ──
    reason_box_inner = Table(
        [
            [Paragraph(
                '<font face="ChineseFontBold" color="#c9a84c" size="11">✦ 本週重點活動建議</font>',
                styles['CardReason'])],
            [Paragraph(
                f'<font face="ChineseFont" color="#1f2438" size="10">{reason or "—"}</font>',
                styles['CardReason'])],
        ],
        colWidths=[CONTENT_WIDTH - 20 * mm],
    )
    reason_box_inner.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    bottom = Table(
        [[reason_box_inner]],
        colWidths=[CONTENT_WIDTH],
    )
    bottom.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fcf6e3')),  # 淡金底提升權重
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 9),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
        ('LINEBEFORE', (0, 0), (0, 0), 4, BRAND_GOLD),
    ]))

    card = Table(
        [[header_bar], [mid_row], [bottom]],
        colWidths=[CONTENT_WIDTH],
    )
    card.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1.2, BRAND_GOLD),
        ('INNERGRID', (0, 0), (-1, -1), 0, colors.white),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    return card


# ============================================================
# 補運操作法（共用）
# ============================================================
def build_buyun_guide(styles: dict[str, ParagraphStyle],
                      steps: list[dict[str, str]]) -> list[Flowable]:
    els: list[Flowable] = []
    els.append(CondPageBreak(50 * mm))
    els.append(_h1_with_bar(styles, '二、補運操作法',
                            subtitle='五個儀式強化出行能量，配合吉時執行效果加倍'))
    els.append(Paragraph(
        '出門訣的力量不只在於「挑對時間方位」，也在於「出門當下的儀式感」。'
        '以下動作建議配合上方吉時一併執行，能強化當下奇門能量對你的加持。',
        styles['Lead'],
    ))
    els.append(Spacer(1, 3 * mm))

    for i, step in enumerate(steps, 1):
        title = step.get('title', f'步驟 {i}')
        desc = step.get('desc', '')

        # 編號徽章（縮小讓步標題視覺權重）
        num_label = Paragraph(
            f'<font face="ChineseFontBold" color="#c9a84c" size="12">{i:02d}</font>',
            styles['StepTitle'],
        )
        num_cell = Table([[num_label]], colWidths=[11 * mm], rowHeights=[11 * mm])
        num_cell.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOX', (0, 0), (-1, -1), 1.2, BRAND_GOLD),
        ]))

        body_cell = Table(
            [
                [Paragraph(
                    f'<font face="ChineseFontBold" color="#0a0e1a" size="12">{title}</font>',
                    styles['StepTitle'],
                )],
                [Spacer(1, 0.8 * mm)],
                [Paragraph(desc, styles['StepDesc'])],
            ],
            colWidths=[CONTENT_WIDTH - 15 * mm],
        )
        body_cell.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
            ('RIGHTPADDING', (0, 0), (-1, -1), 4),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))

        row = Table(
            [[num_cell, body_cell]],
            colWidths=[11 * mm, CONTENT_WIDTH - 11 * mm],
        )
        row.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LINEBELOW', (0, 0), (-1, 0), 0.3, SEP_LINE),
        ]))
        els.append(row)
        els.append(Spacer(1, 3.5 * mm))
    return els


# ============================================================
# 忌方/警告清單
# ============================================================
def build_warnings(styles: dict[str, ParagraphStyle],
                   avoid_directions: list[str],
                   avoid_notes: list[str]) -> list[Flowable]:
    els: list[Flowable] = []
    els.append(CondPageBreak(50 * mm))
    els.append(_h1_with_bar(styles, '三、忌方與注意事項',
                            subtitle='本期須避開的方位與時段，避免能量反噬'))

    # 整合成一個紅色淡底盒子（羅盤左 + 注意項右）
    # 左側：忌方羅盤 + 方位標籤
    compass_col = Table(
        [
            [Paragraph('<font color="#c62828"><b>忌方</b></font>', styles['CardLabel'])],
            [CompassRose(width=40 * mm, avoid=avoid_directions)],
            [Paragraph(
                '  '.join(f'<font color="#c62828"><b>{d}</b></font>' for d in avoid_directions)
                if avoid_directions else '—',
                styles['CardValue'],
            )],
        ],
        colWidths=[50 * mm],
        rowHeights=[12, 40 * mm, 20],
    )
    compass_col.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))

    # 右側：注意項列表
    note_rows = []
    for note in avoid_notes:
        note_rows.append([
            Paragraph('<font color="#c62828"><b>⚠</b></font>', styles['CardValue']),
            Paragraph(note, styles['Body']),
        ])
    if not note_rows:
        note_rows = [[Paragraph('', styles['Body']), Paragraph('—', styles['Body'])]]

    note_col = Table(note_rows, colWidths=[8 * mm, CONTENT_WIDTH - 50 * mm - 8 * mm - 6 * mm])
    note_col.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 2),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
    ]))

    warn_box = Table(
        [[compass_col, note_col]],
        colWidths=[50 * mm, CONTENT_WIDTH - 50 * mm],
    )
    warn_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#fef5f5')),
        ('BOX', (0, 0), (-1, -1), 0.8, colors.HexColor('#f3c7c7')),
        ('LINEAFTER', (0, 0), (0, 0), 0.5, colors.HexColor('#f3c7c7')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    els.append(warn_box)
    return els


# ============================================================
# 結語 / 使用說明
# ============================================================
def build_closing(styles: dict[str, ParagraphStyle], plan_code: str,
                  client_name: str) -> list[Flowable]:
    els: list[Flowable] = []
    els.append(CondPageBreak(30 * mm))
    els.append(_h1_with_bar(styles, '四、使用說明',
                            subtitle='如何最大化本份出門訣的效用'))

    continuity = (
        'E1 單次事件建議配合「月度出門訣」使用整月能量，'
        if plan_code == 'E1'
        else '本月結束前可回購下一月的月度，'
    )
    tips = [
        '<b>下載日曆：</b>登入鑑源會員後，可將本報告的吉時一鍵加入 Google Calendar，'
        '出門前 30 分鐘會收到提醒。',
        '<b>提前準備：</b>出門前 30 分鐘靜坐 5 分鐘，整理當天目標，心情平穩時最能承接吉時能量。',
        '<b>方位判讀：</b>「方位」指的是從你出發地點（家/公司）看出去的大方向，'
        '不是絕對指南針方位——用出發點為中心畫八卦即可。',
        '<b>若時段錯過：</b>可改用備用方向或延後至下一個吉時，不要勉強在凶時出門。',
        f'<b>後續服務：</b>{continuity}形成連續性加持。',
    ]
    for tip in tips:
        els.append(Paragraph(f'• {tip}', styles['Body']))

    els.append(Spacer(1, 6 * mm))
    els.append(Paragraph(
        f'感謝 {client_name} 選擇鑑源，願此報告為您開啟順遂之路。'
        '如有疑問請來信 support@jianyuan.life，我們將在 24 小時內回覆。',
        styles['Lead'],
    ))
    return els


# ============================================================
# 頁眉/頁尾
# ============================================================
def make_body_page(client_name: str, plan_name: str):
    def draw(canvas, doc) -> None:
        canvas.saveState()
        # 頁眉：只保留左側鑑源品牌 + 右側方案名（客戶名移到頁尾，減少干擾）
        canvas.setFont(FONT_BOLD, 8.5)
        canvas.setFillColor(BRAND_GOLD)
        canvas.drawString(MARGIN_LEFT, PAGE_H - MARGIN_TOP + 8 * mm, '鑑 源 命 理')
        canvas.setFont(FONT_NAME, 8)
        canvas.setFillColor(BRAND_INK_MUTED)
        canvas.drawRightString(PAGE_W - MARGIN_RIGHT, PAGE_H - MARGIN_TOP + 8 * mm,
                               plan_name)
        # 金色細分隔線
        canvas.setStrokeColor(BRAND_GOLD)
        canvas.setLineWidth(0.4)
        canvas.line(MARGIN_LEFT, PAGE_H - MARGIN_TOP + 5 * mm,
                    PAGE_W - MARGIN_RIGHT, PAGE_H - MARGIN_TOP + 5 * mm)

        # 頁尾：客戶名（左）/ 頁碼中 / 域名（右）
        canvas.setFont(FONT_NAME, 7.5)
        canvas.setFillColor(BRAND_INK_MUTED)
        canvas.drawString(MARGIN_LEFT, 8 * mm, f'為 {client_name} 量身排算')
        canvas.drawCentredString(PAGE_W / 2, 8 * mm, f'第 {doc.page - 1} 頁')
        canvas.drawRightString(PAGE_W - MARGIN_RIGHT, 8 * mm, 'jianyuan.life')
        canvas.restoreState()

    return draw


def make_cover_page():
    def draw(canvas, doc) -> None:
        canvas.saveState()
        canvas.setFillColor(BRAND_DARK)
        canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
        canvas.setFillColor(BRAND_DARK2)
        canvas.rect(0, PAGE_H * 0.55, PAGE_W, PAGE_H * 0.45, stroke=0, fill=1)
        canvas.setStrokeColor(BRAND_GOLD)
        canvas.setLineWidth(1.2)
        canvas.rect(14, 14, PAGE_W - 28, PAGE_H - 28, stroke=1, fill=0)
        canvas.setStrokeColor(BRAND_GOLD_LIGHT)
        canvas.setLineWidth(0.4)
        canvas.rect(22, 22, PAGE_W - 44, PAGE_H - 44, stroke=1, fill=0)
        canvas.restoreState()

    return draw


# ============================================================
# 主建構函式
# ============================================================
def build_pdf(output_path: str, plan_code: str, client_name: str,
              timings: list[dict[str, Any]],
              buyun_steps: list[dict[str, str]],
              avoid_directions: list[str],
              avoid_notes: list[str],
              event_label: str | None = None,
              generated_date: str | None = None) -> str:
    if plan_code not in ('E1', 'E2'):
        raise ValueError(f'plan_code 必須是 E1 或 E2，收到 {plan_code}')

    plan_name = {'E1': '事件出門訣', 'E2': '月度出門訣'}[plan_code]
    generated_date = generated_date or datetime.now().strftime('%Y 年 %m 月 %d 日')

    styles = build_styles()

    doc = BaseDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=MARGIN_LEFT, rightMargin=MARGIN_RIGHT,
        topMargin=MARGIN_TOP, bottomMargin=MARGIN_BOTTOM,
        title=f'鑑源{plan_name} - {client_name}',
        author='鑑源命理 jianyuan.life',
    )

    cover_frame = Frame(0, 0, PAGE_W, PAGE_H, leftPadding=MARGIN_LEFT,
                        rightPadding=MARGIN_RIGHT, topPadding=20 * mm,
                        bottomPadding=20 * mm, id='cover')
    body_frame = Frame(MARGIN_LEFT, MARGIN_BOTTOM, CONTENT_WIDTH, CONTENT_HEIGHT,
                       leftPadding=0, rightPadding=0,
                       topPadding=0, bottomPadding=0, id='body')

    doc.addPageTemplates([
        PageTemplate(id='cover', frames=[cover_frame],
                     onPage=make_cover_page()),
        PageTemplate(id='body', frames=[body_frame],
                     onPage=make_body_page(client_name, plan_name)),
    ])

    story: list[Flowable] = []
    story.extend(build_cover(styles, client_name, plan_code, plan_name,
                             generated_date, event_label))
    story.append(NextPageTemplate('body'))
    story.append(PageBreak())

    if plan_code == 'E1':
        story.extend(build_e1_top3_cards(styles, timings))
    else:
        story.extend(build_e2_week_cards(styles, timings))

    story.extend(build_buyun_guide(styles, buyun_steps))
    story.extend(build_warnings(styles, avoid_directions, avoid_notes))
    story.extend(build_closing(styles, plan_code, client_name))

    doc.build(story)
    return output_path


# ============================================================
# 範例資料（用於樣本生成 + 5 LLM 評審）
# ============================================================
def sample_e1_data() -> dict[str, Any]:
    return {
        'plan_code': 'E1',
        'client_name': '林詠心',
        'event_label': '重要商務簽約  ·  2026/05/12–05/20',
        'timings': [
            {
                'rank': 1, 'date': '2026/05/14（三）', 'time_range': '09:00–11:00',
                'shichen': '巳', 'direction': '東南', 'door': '開門', 'star': '天心',
                'shen': '值符', 'score': 96,
                'reason': '開門落東南巽宮配天心星，主謀略與貴人相助。值符八神加持，此時出門談判最易獲得對方關鍵讓步，並鞏固長期合作關係。建議攜帶合約正本，現場簽署。',
            },
            {
                'rank': 2, 'date': '2026/05/17（六）', 'time_range': '13:00–15:00',
                'shichen': '未', 'direction': '南', 'door': '生門', 'star': '天任',
                'shen': '六合', 'score': 91,
                'reason': '生門落離宮配天任財星，主資金流動與財務合約。六合神主合作順遂，適合在此時段處理簽約的財務條款或款項交付，避免因細節爭議影響大局。',
            },
            {
                'rank': 3, 'date': '2026/05/19（一）', 'time_range': '07:00–09:00',
                'shichen': '辰', 'direction': '東', 'door': '休門', 'star': '天輔',
                'shen': '九天', 'score': 88,
                'reason': '休門落震宮配天輔文昌，主文書與契約。九天神加持，利於在此時段進行合約覆核、簽字與歸檔。若為異地簽約，東方向出行能獲貴人引薦。',
            },
        ],
        'buyun_steps': [
            {'title': '出門前 30 分鐘靜坐定神',
             'desc': '於出發地點靜坐 5–10 分鐘，雙手自然放膝，專注呼吸。'
                     '默念當日目標三遍，如「今日簽約順利，雙方共贏」。靜坐能讓心神收攝，承接吉時能量。'},
            {'title': '朝東南方鞠躬三次',
             'desc': '面朝當日吉方（東南）鞠躬三次，感謝天地賜予加持。鞠躬時意念專注，不必出聲。'
                     '此動作對應《奇門遁甲》「感天地之氣，成人間之事」的古法儀式。'},
            {'title': '攜帶金色物件或配件',
             'desc': '金色能量與本月吉方共振，可佩戴金色手錶、金屬筆或金色領帶夾。'
                     '女士可以金色耳環、墜飾為主。此物件將陪伴你完成簽約，成為個人能量錨點。'},
            {'title': '出發時走大門或主要通道',
             'desc': '從家中或辦公室的正門出發，象徵「堂堂正正」出行。避免走後門、側門，'
                     '也避免繞路至吉方——直線前進即可獲天時之利。'},
            {'title': '簽約完成後回饋天地',
             'desc': '完成簽約後，心中默念「感謝」三遍。若方便，可於當週前往附近廟宇、教堂或山林'
                     '靜坐 10 分鐘，圓滿此次出門訣的能量循環。'},
        ],
        'avoid_directions': ['西北', '北'],
        'avoid_notes': [
            '事件期間（5/12–5/20）西北與北方向為空亡位，請避免往此方向出差、談判或簽約。',
            '5/15（日）全日為「五不遇時」，不建議重大決策，建議改為陪伴家人或休息日。',
            '遇雨、雷、颱風等惡劣天氣時，即使在吉時吉方也請延後行動，天象為先。',
        ],
    }


def sample_e2_data() -> dict[str, Any]:
    return {
        'plan_code': 'E2',
        'client_name': '陳子揚',
        'event_label': '2026 年 5 月  ·  月度吉時指南',
        'timings': [
            {
                'week': 1, 'week_label': '第 1 週', 'week_range': '2026/05/04–05/10',
                'date': '2026/05/06（二）', 'time_range': '09:00–11:00',
                'direction': '東南', 'door': '開門', 'star': '天心', 'shen': '值符',
                'reason': '第一週最佳出行時段。適合本月最重要的商務會議、重大決策、對外談判。東南方位利貴人扶持，出行前可先致電對方確認會面時間。',
            },
            {
                'week': 2, 'week_label': '第 2 週', 'week_range': '2026/05/11–05/17',
                'date': '2026/05/14（五）', 'time_range': '13:00–15:00',
                'direction': '南', 'door': '生門', 'star': '天任', 'shen': '六合',
                'reason': '第二週財運時段。適合處理投資決策、簽署財務合約、拜訪重要客戶或合作夥伴。南方位利財祿，此時段出門洽商成功率高。',
            },
            {
                'week': 3, 'week_label': '第 3 週', 'week_range': '2026/05/18–05/24',
                'date': '2026/05/20（四）', 'time_range': '07:00–09:00',
                'direction': '東', 'door': '休門', 'star': '天輔', 'shen': '九天',
                'reason': '第三週文書與學習時段。適合簽約、送件、面試、考試、提交申請案。東方位利文昌，此時段出門辦理文書事務特別順利。',
            },
            {
                'week': 4, 'week_label': '第 4 週', 'week_range': '2026/05/25–05/31',
                'date': '2026/05/28（五）', 'time_range': '15:00–17:00',
                'direction': '東北', 'door': '生門', 'star': '天任', 'shen': '太陰',
                'reason': '第四週收尾時段。適合總結、結案、年度規劃、家宅遷動。東北方位利穩定紮根，此時段出門適合拜訪長輩、處理家族事務。',
            },
        ],
        'buyun_steps': [
            {'title': '每週一早晨靜坐 5 分鐘',
             'desc': '週一早晨出門前，面朝該週吉方靜坐 5 分鐘，回顧上週收穫、設定本週目標。'
                     '此動作能讓整週出行自然對準吉時能量。'},
            {'title': '每週準備一項金色或白色物件',
             'desc': '本月吉方多為東南、南、東、東北，配合金色或白色物件能強化能量。'
                     '可以是領帶、絲巾、手錶、鋼筆、首飾等，每週替換可避免「能量疲乏」。'},
            {'title': '記錄每週出門後的成果',
             'desc': '出門當日晚間簡單記錄「做了什麼、遇到誰、收穫什麼」三行字。'
                     '此動作能讓吉時加持的經驗持續累積，日後回顧時能看見命運紋理。'},
            {'title': '月末前往戶外吸收地氣',
             'desc': '本月 5/28 後找一天前往公園、山林、海邊靜坐 20 分鐘，'
                     '感恩整月收穫。此動作對應古法「謝天地」，為下月能量打底。'},
            {'title': '進入下月前回購續約',
             'desc': '5 月底前可在鑑源回購 6 月月度，保持月月連續排算。'
                     '連續使用月度出門訣滿 3 個月，運勢曲線會呈現明顯的穩定提升。'},
        ],
        'avoid_directions': ['西北'],
        'avoid_notes': [
            '本月（2026/05）西北方位全月為月破空亡位，請盡量避免該方向的長途出行或重大決策。',
            '5/15（日）、5/22（日）為五不遇時，不建議做重大出行安排，可作為休息或家庭日。',
            '若週中確實需要臨時出門而非吉時，建議改走備用方向（南方）或延後 2 小時。',
        ],
    }


# ============================================================
# CLI
# ============================================================
def main() -> None:
    parser = argparse.ArgumentParser(description='鑑源 E1/E2 出門訣 PDF 生成器')
    parser.add_argument('plan_code', nargs='?', default='E1', help='E1 或 E2')
    parser.add_argument('data', nargs='?', default='sample',
                        help='sample 使用內建範例，或傳入 JSON 檔路徑')
    parser.add_argument('-o', '--output', default=None, help='輸出 PDF 檔名')
    args = parser.parse_args()

    plan_code = args.plan_code.upper()

    if args.data == 'sample':
        data = sample_e1_data() if plan_code == 'E1' else sample_e2_data()
    else:
        with open(args.data, 'r', encoding='utf-8') as f:
            data = json.load(f)

    output = args.output or f'sample_{plan_code}.pdf'
    build_pdf(
        output_path=output,
        plan_code=plan_code,
        client_name=data['client_name'],
        timings=data['timings'],
        buyun_steps=data['buyun_steps'],
        avoid_directions=data.get('avoid_directions', []),
        avoid_notes=data.get('avoid_notes', []),
        event_label=data.get('event_label'),
    )
    print(f'[OK] PDF 已輸出：{output}')


if __name__ == '__main__':
    main()
