#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
從 Supabase 抽取 4 份 R 報告完整內容，丟給 5 LLM 評核
"""
import os
import sys
import json
import urllib.request
import urllib.error
import concurrent.futures
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

# 載入 env
ENV_PATH = Path.home() / '.claude' / '.env'
if ENV_PATH.exists():
    for line in ENV_PATH.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())

LLM_PATH = Path(r'D:\Users\Desktop\Claude專案\Claude-鑑源\llm_collab')
sys.path.insert(0, str(LLM_PATH))
from multi_llm import ask_gpt, ask_kimi, ask_deepseek, ask_qwen, ask_gemini

# Supabase 抽取
SUPABASE_URL = 'https://jvmnntavizbjsgofnusy.supabase.co'
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')

REPORT_IDS = [
    ('R1_進壹×思齊', 'ccb28867-8f4f-4573-a959-648cd8f9e0e5'),
    ('R2_宣逸×沅霖_合夥', '14a0cade-0574-4416-ae18-3f8c670c7edc'),
    ('R3_紀萳×宥諄_母子', 'c899a986-fe97-46ef-b218-7663003229fe'),
    ('R4_紀萳×宣逸_夫妻', 'e11ad178-22e1-4a5f-8654-61a49df12378'),
]

# 地面真相（人工用 lunar-python 核對）
GROUND_TRUTHS = {
    'R1_進壹×思齊': """
李進壹 1995-01-05 13:54 男：
  八字 甲戌/丙子/丙申/乙未
  日主丙 日支申  生肖狗（1995年農曆前立春於2/4，1/5屬甲戌年，生肖狗）

馮思齊 1996-10-05 22:00 女：
  八字 丙子/丁酉/乙亥/丁亥
  日主乙 日支亥  生肖鼠

生肖關係：狗(戌) vs 鼠(子) — 無合無沖無刑，但『酉戌害』，不是『子戌刑』
日支互動：申 vs 亥 — 『申亥六害』（六害之一！必講）
同時『申亥』確實不是相沖、也不是三合，但是六害
五行生剋：申金生亥水 OK（但必須在六害前提下討論）
""",
    'R2_宣逸×沅霖_合夥': """
何宣逸 1990-10-12 20:41 男：
  八字 庚午/丙戌/庚戌/丙戌
  日主庚 日支戌  生肖馬（庚午年）

林沅霖 1993-05-20 08:00 男：
  八字 癸酉/丁巳/辛丑/壬辰
  日主辛 日支丑  生肖雞

生肖關係：馬(午) vs 雞(酉) — 無合無沖無刑無害（中性）
五行生剋：宣逸日支戌土，沅霖日支丑土，都是土庫；『丑戌未三刑』只出現在有 未土 時；兩戌+一丑 不成三刑
紫微：宣逸命宮天府在亥 OK；沅霖命宮貪狼 要看真實排盤
""",
    'R3_紀萳×宥諄_母子': """
何紀萳 1994-10-04 08:00 女：
  八字 甲戌/癸酉/癸亥/丙辰
  日主癸 日支亥  生肖狗（1994甲戌年）

何宥諄 2023-05-08 10:48 男：
  八字 癸卯/丁巳/丙寅/癸巳
  日主丙 日支寅  生肖兔（2023癸卯年）

生肖關係：狗(戌) vs 兔(卯) — 『卯戌六合』 ✓
癸水+丙火：天干『戊癸合化火』，但 癸+丙 不是『正官合』——癸見己是七殺、癸見戊才是正官
癸水遇丙火：丙是癸的正財
""",
    'R4_紀萳×宣逸_夫妻': """
何紀萳 1994-10-04 08:00 女：
  八字 甲戌/癸酉/癸亥/丙辰
  日主癸 日支亥  生肖狗

何宣逸 1990-10-12 20:41 男：
  八字 庚午/丙戌/庚戌/丙戌
  日主庚 日支戌  生肖馬

生肖關係：狗(戌) vs 馬(午) — 『寅午戌三合火局』的兩支 ✓
癸水+庚金：庚生癸（正印生我）✓
日支：紀萳亥 vs 宣逸戌 — 無合無沖無刑無害
紀萳年支戌 vs 宣逸年支午 — 午戌半合火局
""",
}


def fetch_report(rid):
    url = f'{SUPABASE_URL}/rest/v1/paid_reports?id=eq.{rid}&select=report_result'
    req = urllib.request.Request(url, headers={
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if data and data[0].get('report_result'):
                return data[0]['report_result'].get('ai_content', '')
    except Exception as e:
        print(f'ERROR fetch {rid}: {e}')
    return ''


RUBRIC = """你是鑑源命理平台的嚴苛審核員。以下是 R 方案「合否？」$59 雙人合盤報告全文。
你必須扮演付費 $59 的客戶，用最挑剔的標準評分（0-100）。

## 評核 4 大維度（每項獨立 0-100）

### 1. 命理正確性（最重要，任一錯扣 20 分起跳）
檢查：
- 八字四柱是否無誤
- 日主、生肖、十神關係是否對
- 生肖合/沖/刑/害關係是否正確（最容易出錯）
- 五行生剋論述是否合邏輯（不自相矛盾）
如有「錯把屬狗說成屬鼠」「錯把卯戌六合說成子戌相刑」這種致命錯誤：直接 ≤ 60 分

### 2. 結論明確度（老闆鐵律）
檢查：
- 必須出現「你們合」「你們不合」「你們合，但有雷區」
- 禁止「可能/也許/大致/某種程度」模糊詞
- 如客戶問「該不該離婚」，AI 必須給出明確界線，不能只是兩邊討好

### 3. 可讀性/白話優先
檢查：
- 白話結論放前、命理術語放後
- 段落流暢，不是術語堆砌
- 有明確的三段式總結（🟢好的地方 / 🟡需要注意 / 🔵改善建議）

### 4. $59 值不值
檢查：
- 客戶讀完會不會有「終於有人敢說實話」
- 有沒有具體到行為層面的建議（而非「多溝通」）
- 流年+刻意練習+寫給你們的話是否夠深入

## 輸出必須嚴格 JSON（不要 markdown 代碼塊）：
{
  "scores": {"correctness": N, "clarity": N, "readability": N, "value": N},
  "overall": N,
  "critical_issues": ["致命問題，每條 1 句"],
  "improvements": ["改進建議（for prompt），每條 1 句"]
}
"""


def score_llm(llm_name, llm_fn, label, report, gt):
    user = f"""## 地面真相（人工用 lunar-python 驗算）
{gt}

## 報告全文（{label}）
{report}

請對此報告嚴格評分並只輸出 JSON。"""
    r = llm_fn(RUBRIC, user)
    if 'error' in r:
        return {'llm': llm_name, 'error': r['error']}
    content = r.get('content', '')
    # 抽 JSON
    try:
        s_idx = content.find('{')
        e_idx = content.rfind('}') + 1
        if s_idx >= 0 and e_idx > s_idx:
            obj = json.loads(content[s_idx:e_idx])
            return {'llm': llm_name, 'data': obj}
    except Exception as e:
        return {'llm': llm_name, 'parse_error': str(e), 'raw': content[:400]}
    return {'llm': llm_name, 'raw': content[:400]}


def main():
    audit_round = sys.argv[1] if len(sys.argv) > 1 else 'round1'
    # 抽報告
    print(f'\n=== 從 Supabase 抽取 {len(REPORT_IDS)} 份 R 報告 ===')
    reports = {}
    for label, rid in REPORT_IDS:
        content = fetch_report(rid)
        reports[label] = content
        print(f'  {label}: {len(content)} 字')

    # 為每份報告並行跑 5 LLM
    llms = [
        ('gpt', ask_gpt),
        ('qwen', ask_qwen),
        ('gemini', ask_gemini),
        ('kimi', ask_kimi),
        ('deepseek', ask_deepseek),
    ]

    all_results = {}
    summary_rows = []

    for label, report in reports.items():
        if not report:
            print(f'\n[跳過 {label}：無內容]')
            continue
        print(f'\n=== 評核 {label} ===')
        gt = GROUND_TRUTHS.get(label, '')
        # 裁到 40K chars 避免某些 LLM token 超限
        report_trim = report[:42000]
        results = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
            futs = {ex.submit(score_llm, n, fn, label, report_trim, gt): n for n, fn in llms}
            for f in concurrent.futures.as_completed(futs, timeout=300):
                n = futs[f]
                try:
                    results[n] = f.result()
                except Exception as e:
                    results[n] = {'llm': n, 'error': str(e)}
        all_results[label] = results
        # 印總覽
        ovs = []
        for llm, r in results.items():
            if 'data' in r:
                d = r['data']
                s = d.get('scores', {})
                ov = d.get('overall', 0)
                ovs.append((llm, ov))
                icon = '✓' if ov >= 95 else '✗'
                print(f'  {icon} {llm}: 正{s.get("correctness",0)}/明{s.get("clarity",0)}/讀{s.get("readability",0)}/值{s.get("value",0)} = {ov}')
                for iss in d.get('critical_issues', [])[:2]:
                    print(f'       × {iss}')
            else:
                err = r.get('error', r.get('parse_error', 'unknown'))
                print(f'  ✗ {llm}: ERROR {str(err)[:100]}')
        if ovs:
            avg = sum(x for _, x in ovs) / len(ovs)
            min_s = min(x for _, x in ovs)
            print(f'  → 平均 {avg:.1f} / 最低 {min_s} / 95閘門? {"✓" if min_s >= 95 else "✗"}')
            summary_rows.append((label, avg, min_s))

    # 存 JSON
    out = Path(f'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/scripts/r_audit_{audit_round}.json')
    out.write_text(json.dumps(all_results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n結果已存到 {out}')

    # 最終摘要
    print('\n=== 最終總覽 ===')
    for label, avg, mn in summary_rows:
        print(f'  {label}: 平均{avg:.1f} / 最低{mn} / {"PASS" if mn >= 95 else "FAIL"}')
    if summary_rows and all(mn >= 95 for _, _, mn in summary_rows):
        print('\n✓✓✓ 全部通過 95 閘門！')
    else:
        print('\n✗ 未達標，需要修 prompt / 演算法')


if __name__ == '__main__':
    main()
