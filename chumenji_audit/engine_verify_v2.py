#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
出門訣引擎驗證 v2（使用真實出生資料）
比對 AI 報告宣稱的排盤 vs 引擎實際算出的排盤。
"""
import sys, os, json, io
from datetime import date, datetime, timedelta

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
ENG_DIR = r'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源命理研究部門/api_server'
sys.path.insert(0, ENG_DIR)

from calculators.qimen_dunjia import (
    hourly_qimen_chart,
    find_best_chumenji_times,
    _derive_personalization_from_birth,
)
from calculators._base import BirthInput

out_lines = []
def P(line):
    out_lines.append(str(line))

# 真實客戶資料
CUSTOMERS = {
    '施俊光': {'year': 1983, 'month': 8, 'day': 20, 'hour': 16, 'minute': 0,
              'birth_year_dizhi': '亥', 'plan': 'E1',
              'available_slots': [(9,11),(11,13),(13,15),(15,17),(17,19),(19,21),(21,23)],
              'event_start': '2026-04-13', 'event_end': '2026-04-15',
              'claim': '4/14 申時 艮八(東北) 開門+天心+玄武'},
    '何宣逸_E1': {'year': 1990, 'month': 10, 'day': 12, 'hour': 20, 'minute': 41,
              'birth_year_dizhi': '午', 'plan': 'E1',
              'available_slots': [(21,23),(23,1)],
              'event_start': '2026-04-14', 'event_end': '2026-05-13',
              'claim': '5/13 子時 乾六(西北) 生門+天輔+六合'},
    '何紀萳_E2': {'year': 1994, 'month': 10, 'day': 4, 'hour': 8, 'minute': 0,
              'birth_year_dizhi': '戌', 'plan': 'E2',
              'available_slots': [(19,21),(21,23)],
              'claim': '第1週 4/16 亥時 兌七(西) 休門+天心+六合'},
    '何宣逸_E2': {'year': 1990, 'month': 10, 'day': 12, 'hour': 20, 'minute': 41,
              'birth_year_dizhi': '午', 'plan': 'E2',
              'available_slots': [(21,23),(23,1)],
              'claim': '第1週 4/18 子時 乾六(西北) 陽遁7局 生門+天輔+六合'},
}

P('=' * 80)
P('出門訣引擎驗證 v2（真實出生資料）')
P('=' * 80)

for name, c in CUSTOMERS.items():
    P('\n' + '-' * 80)
    P(f'客戶: {name} ({c["year"]}-{c["month"]:02d}-{c["day"]:02d} {c["hour"]:02d}:{c["minute"]:02d})')
    P(f'年命地支: {c["birth_year_dizhi"]}')
    P(f'AI 報告宣稱: {c["claim"]}')

    # 個人化
    try:
        bi = BirthInput(year=c['year'], month=c['month'], day=c['day'],
                        hour=c['hour'], minute=c['minute'])
        gan, xi, ji, stg = _derive_personalization_from_birth(bi)
        P(f'日主={gan} 喜用={xi} 忌={ji} 強弱={stg}')
    except Exception as e:
        P(f'個人化失敗: {e}')
        gan, xi, ji, stg = '', [], [], ''

    # E1/E2 掃描
    if c['plan'] == 'E1':
        start = date.fromisoformat(c['event_start'])
        end = date.fromisoformat(c['event_end'])
        slots_pairs = c['available_slots']
        hour_ranges = [(s, e-1 if e < 24 else 23) for (s, e) in slots_pairs]

        all_results = []
        cur = start
        while cur <= end:
            for sh, eh in hour_ranges:
                try:
                    daily = find_best_chumenji_times(
                        cur.year, cur.month, cur.day,
                        birth_year_dizhi=c['birth_year_dizhi'],
                        event_type='求財' if '財' in name or 'E1' in name else '面試',
                        start_hour=sh, end_hour=eh,
                        rizhu_gan=gan, xiyongshen_wx=xi, jishen_wx=ji,
                        bazi_strength=stg,
                    )
                    for r in daily:
                        r['date'] = cur.isoformat()
                    all_results.extend(daily)
                except Exception as e:
                    pass
            cur += timedelta(days=1)

        all_results.sort(key=lambda x: x.get('score', 0), reverse=True)
        P(f'\n引擎 Top5（E1 事件日期範圍內）:')
        for r in all_results[:5]:
            P(f"  {r.get('date')} {r.get('shichen','')}時 {r.get('direction','')} "
              f"{r.get('gong','')} 門={r.get('door','')} 星={r.get('star','').replace('(+天禽)','').strip()} "
              f"神={r.get('shen','')} 分={r.get('score',0)} 局={r.get('ju','')}")
    else:
        # E2 掃描 4 週
        today = date(2026, 4, 13)
        P(f'\n引擎 4 週 Top1:')
        for wk in range(4):
            ws = today + timedelta(days=wk*7)
            we = ws + timedelta(days=6)
            week_results = []
            cur = ws
            slots_pairs = c['available_slots']
            hour_ranges = [(s, e-1 if e < 24 else 23) for (s, e) in slots_pairs]
            while cur <= we:
                for sh, eh in hour_ranges:
                    try:
                        daily = find_best_chumenji_times(
                            cur.year, cur.month, cur.day,
                            birth_year_dizhi=c['birth_year_dizhi'],
                            event_type='出行',
                            start_hour=sh, end_hour=eh,
                            rizhu_gan=gan, xiyongshen_wx=xi, jishen_wx=ji,
                            bazi_strength=stg,
                        )
                        for r in daily:
                            r['date'] = cur.isoformat()
                        week_results.extend(daily)
                    except Exception:
                        pass
                cur += timedelta(days=1)
            week_results.sort(key=lambda x: x.get('score', 0), reverse=True)
            if week_results:
                r = week_results[0]
                P(f"  第{wk+1}週 {ws}~{we}: {r.get('date')} {r.get('shichen','')}時 "
                  f"{r.get('direction','')} {r.get('gong','')} "
                  f"門={r.get('door','')} 星={r.get('star','').replace('(+天禽)','').strip()} "
                  f"神={r.get('shen','')} 分={r.get('score',0)} 局={r.get('ju','')}")

outpath = 'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/chumenji_audit/engine_verify_v2_result.txt'
with open(outpath, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out_lines))
print(f'輸出: {outpath}')
