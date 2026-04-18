#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""出門訣引擎驗證腳本（UTF-8 文件輸出）"""
import sys, os, json, io
from datetime import date

# 強制 UTF-8
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ENG_DIR = r'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源命理研究部門/api_server'
sys.path.insert(0, ENG_DIR)

from calculators.qimen_dunjia import (
    hourly_qimen_chart,
    find_best_chumenji_times,
    _derive_personalization_from_birth,
)
from calculators._base import BirthInput


CASES = [
    {
        'label': '施俊光 E1 Top1 (2026-04-14 16:00 申時)',
        'year': 2026, 'month': 4, 'day': 14, 'hour': 16,
        'expected_gong': '艮八',
        'expected_door': '開門',
        'expected_star': '天心',
        'expected_shen': '玄武',
        'expected_direction': '東北',
    },
    {
        'label': '何宣逸 E1 Top1 (2026-05-13 23:00 子時)',
        'year': 2026, 'month': 5, 'day': 13, 'hour': 23,
        'expected_gong': '乾六',
        'expected_door': '生門',
        'expected_star': '天輔',
        'expected_shen': '六合',
        'expected_direction': '西北',
    },
    {
        'label': '何宣逸 E2 第1週 (2026-04-18 23:00 子時, 陽遁7局)',
        'year': 2026, 'month': 4, 'day': 18, 'hour': 23,
        'expected_gong': '乾六',
        'expected_door': '生門',
        'expected_star': '天輔',
        'expected_shen': '六合',
        'expected_ju_num': 7,
        'expected_direction': '西北',
    },
    {
        'label': '何紀萳 E2 第1週 (2026-04-16 22:00 亥時)',
        'year': 2026, 'month': 4, 'day': 16, 'hour': 22,
        'expected_gong': '兌七',
        'expected_door': '休門',
        'expected_star': '天心',
        'expected_shen': '六合',
        'expected_direction': '西',
    },
]

out_lines = []
def P(line):
    out_lines.append(str(line))

P('=' * 80)
P('出門訣引擎驗證報告')
P('=' * 80)

pass_cnt = 0
fail_cnt = 0

for c in CASES:
    try:
        chart = hourly_qimen_chart(c['year'], c['month'], c['day'], c['hour'])
        if 'error' in chart:
            P(f"\n[{c['label']}] ERROR: {chart['error']}")
            fail_cnt += 1
            continue

        ju_str = chart.get('ju', '')
        ju_num = chart.get('ju_num', 0)
        hour_gz = chart.get('hour_gz', '')
        day_gz = chart.get('day_gz', '')
        month_gz = chart.get('month_gz', '')
        year_gz = chart.get('year_gz', '')

        P(f"\n--- {c['label']} ---")
        P(f"四柱: {year_gz}年 {month_gz}月 {day_gz}日 {hour_gz}時")
        P(f"局: {ju_str} (ju_num={ju_num})")

        expected_ju = c.get('expected_ju_num')
        if expected_ju and expected_ju != ju_num:
            P(f"  [FAIL] 局數不符：期待{expected_ju}，實際{ju_num}")
        elif expected_ju:
            P(f"  [OK] 局數 {ju_num} 符合")

        expected_gong = c['expected_gong']
        chart_data = chart.get('chart', {})
        if expected_gong not in chart_data:
            P(f"  [FAIL] {expected_gong}宮 不存在於盤中")
            fail_cnt += 1
            continue

        gd = chart_data[expected_gong]
        actual_door = gd.get('door', '')
        actual_star = gd.get('star', '').replace('(+天禽)', '').strip()
        actual_shen = gd.get('shen', '')
        direction = gd.get('direction', '')
        tpg = gd.get('tianpan_gan', '')
        dpg = gd.get('dipan_gan', '')

        P(f"{expected_gong}宮: 門={actual_door} 星={actual_star} 神={actual_shen} 天盤={tpg} 地盤={dpg} 方位={direction}")

        # 比對
        exp_door = c.get('expected_door', '')
        exp_star = c.get('expected_star', '')
        exp_shen = c.get('expected_shen', '')
        exp_dir = c.get('expected_direction', '')
        ok = True
        msgs = []
        if exp_door and actual_door != exp_door:
            ok = False
            msgs.append(f"門 期待{exp_door} 實際{actual_door}")
        if exp_star and actual_star != exp_star:
            ok = False
            msgs.append(f"星 期待{exp_star} 實際{actual_star}")
        if exp_shen and actual_shen != exp_shen:
            ok = False
            msgs.append(f"神 期待{exp_shen} 實際{actual_shen}")
        if exp_dir and direction != exp_dir:
            ok = False
            msgs.append(f"方位 期待{exp_dir} 實際{direction}")
        if ok:
            P(f"  [PASS] 門+星+神+方位全部符合")
            pass_cnt += 1
        else:
            P(f"  [FAIL] " + "；".join(msgs))
            fail_cnt += 1

        # 列印全盤
        P("全盤:")
        for g in ['坎一', '坤二', '震三', '巽四', '乾六', '兌七', '艮八', '離九']:
            if g in chart_data:
                d = chart_data[g]
                door = d.get('door', '')
                star = d.get('star', '').replace('(+天禽)', '').strip()
                shen = d.get('shen', '')
                P(f"  {g}: 門={door:>3s} 星={star:<6s} 神={shen:<3s} 天={d.get('tianpan_gan','')} 地={d.get('dipan_gan','')}")
    except Exception as e:
        P(f"[{c['label']}] EXCEPTION: {e}")
        import traceback
        P(traceback.format_exc())
        fail_cnt += 1

P(f"\n總結: PASS={pass_cnt}, FAIL={fail_cnt}")

# 個人化測試
P('\n' + '=' * 80)
P('八字個人化串接測試')
P('=' * 80)
for name, y, m, d, h in [
    ('施俊光', 1984, 6, 4, 19),
    ('何宣逸', 1991, 11, 20, 13),
    ('何則興', 1992, 2, 16, 3),
    ('何紀萳', 1984, 9, 1, 10),
]:
    try:
        tmp = BirthInput(year=y, month=m, day=d, hour=h, minute=0)
        gan, xi, ji, stg = _derive_personalization_from_birth(tmp)
        P(f"{name}({y}-{m:02d}-{d:02d} {h:02d}:00): 日主={gan} 喜用={xi} 忌={ji} 強弱={stg}")
    except Exception as e:
        P(f'{name} 個人化失敗: {e}')

# 輸出到文件
outpath = 'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/chumenji_audit/engine_verify_result.txt'
with open(outpath, 'w', encoding='utf-8') as f:
    f.write('\n'.join(out_lines))
print(f'結果寫入 {outpath}')
