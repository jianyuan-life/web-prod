#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
執行 R 方案 5 LLM 嚴苛評核
從快取檔讀報告 → 5 LLM 並行評分 → 產生 R_PLAN_DEEP_AUDIT.md
"""
import os
import sys
import json
import concurrent.futures
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

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

# 從 MCP 快取檔讀
# 路徑用 os.path.join 拆分，避免 Windows raw-string path 裡 `\c7ab35...` 被 Tailwind v4
# content auto-detection 誤當成 CSS escape 解析（觸發 Invalid code point > 0x10FFFF，
# 導致 build 失敗）。根因紀錄：2026-04-18 v5.3.5 部署連續 3 次 Error。
import os as _os
CACHE = Path(
    _os.environ.get('USERPROFILE', r'C:\Users\Administrator'),
) / '.claude' / 'projects' / 'D--Users-Desktop-Claude---Claude---' / (
    '-'.join(['c7ab35a4', 'd24d', '4410', '8ca9', '3ec3d6fac3cb'])
) / 'tool-results' / 'mcp-claude_ai_Supabase-execute_sql-1776491426871.txt'

REPORT_META = {
    'ccb28867-8f4f-4573-a959-648cd8f9e0e5': 'R1_進壹×思齊',
    '14a0cade-0574-4416-ae18-3f8c670c7edc': 'R2_宣逸×沅霖_合夥',
    'c899a986-fe97-46ef-b218-7663003229fe': 'R3_紀萳×宥諄_母子',
    'e11ad178-22e1-4a5f-8654-61a49df12378': 'R4_紀萳×宣逸_夫妻',
}

GT = {
    'R1_進壹×思齊': """李進壹 1995-01-05 13:54 男 八字甲戌/丙子/丙申/乙未，日主丙，日支申，**生肖狗（甲戌年）**
馮思齊 1996-10-05 22:00 女 八字丙子/丁酉/乙亥/丁亥，日主乙，日支亥，**生肖鼠（丙子年）**
生肖關係：狗 vs 鼠 — 無合無沖無刑，酉戌害；不是子戌相刑
日支互動：申 vs 亥 — **申亥六害**（六害！），雖申金生亥水但必須說有害
五行：申金生亥水 ✓（但必須在六害前提下論述）""",
    'R2_宣逸×沅霖_合夥': """何宣逸 1990-10-12 20:41 男 八字庚午/丙戌/庚戌/丙戌，日主庚，日支戌，生肖馬
林沅霖 1993-05-20 08:00 男 八字癸酉/丁巳/辛丑/壬辰，日主辛，日支丑，生肖雞
生肖關係：馬 vs 雞 — 無合無沖無刑無害（中性）
三合夥伴檢查：馬 三合 寅午戌；雞 三合 巳酉丑""",
    'R3_紀萳×宥諄_母子': """何紀萳 1994-10-04 08:00 女 八字甲戌/癸酉/癸亥/丙辰，日主癸，日支亥，**生肖狗（甲戌年）**
何宥諄 2023-05-08 10:48 男 八字癸卯/丁巳/丙寅/癸巳，日主丙，日支寅，**生肖兔（癸卯年）**
生肖關係：狗 vs 兔 — **卯戌六合 ✓**
癸水日主 vs 丙火：癸見丙是『正財』，不是『正官合』（癸的正官是戊）
年支互動：甲戌 vs 癸卯 — 卯戌六合""",
    'R4_紀萳×宣逸_夫妻': """何紀萳 1994-10-04 08:00 女 八字甲戌/癸酉/癸亥/丙辰，日主癸，生肖狗
何宣逸 1990-10-12 20:41 男 八字庚午/丙戌/庚戌/丙戌，日主庚，生肖馬
生肖關係：狗 vs 馬 — 寅午戌三合火局的兩個成員 ✓
天干：庚金生癸水 ✓（庚是癸的正印）
年支互動：甲戌 vs 庚午 — 午戌半合火局 ✓""",
}


def load_reports():
    # 從 MCP 快取讀 — 檔案結構：[{"type":"text","text":"...untrusted-data...JSON..."}]
    content = CACHE.read_text(encoding='utf-8')
    wrapper = json.loads(content)
    # wrapper[0]['text'] 內含 untrusted-data 標記 + JSON
    inner_text = wrapper[0]['text'] if isinstance(wrapper, list) else wrapper.get('text', '')
    # 內層還是 JSON，有 "result" 欄位
    try:
        inner_obj = json.loads(inner_text)
        inner = inner_obj.get('result', inner_text)
    except Exception:
        inner = inner_text
    # 找第一個 '[' 到最後一個 ']' 之間的內容（就是 JSON array）
    arr_start = inner.find('[{')
    arr_end = inner.rfind('}]') + 2
    if arr_start == -1 or arr_end <= arr_start:
        print(f'[ERR] 找不到 JSON array')
        return {}
    raw = inner[arr_start:arr_end]
    try:
        data = json.loads(raw)
    except Exception as e:
        print(f'[ERR] JSON 解析失敗：{e}')
        return {}
    out = {}
    for row in data:
        rid = row.get('id')
        label = REPORT_META.get(rid)
        if label:
            out[label] = row.get('full_content', '')
    return out


RUBRIC = """你是鑑源命理平台首席審核員。付費 $59 客戶買了 R 方案「合否？」雙人合盤報告。
你必須用最挑剔標準評分（0-100）。任一命理錯誤直接 ≤ 60 分。

## 4 大維度（各 0-100）

### 1. 命理正確性（絕不妥協）
- 八字四柱正確？生肖正確？日支互動/合沖刑害正確？
- 「狗鼠相害」「子戌相刑」「癸見丙是正官合」這類常見錯誤要抓出
- 如地面真相與報告不符：直接 ≤ 60 分

### 2. 結論明確度
- 有「你們合」「你們不合」「你們合但有雷區」之一嗎？
- 禁止「可能/或許/某種程度」模糊詞

### 3. 可讀性
- 白話先、術語後
- 有 🟢好/🟡注意/🔵改善 三段式總結？

### 4. $59 值不值
- 具體到行為？有流年+刻意練習+寫給你們的話？

## 輸出嚴格 JSON（不要 markdown 代碼塊）：
{"scores":{"correctness":N,"clarity":N,"readability":N,"value":N},"overall":N,"critical_issues":["..."],"improvements":["..."]}
"""


def score(llm_name, llm_fn, label, report, gt):
    user = f"## 地面真相\n{gt}\n\n## 報告\n{report[:42000]}\n\n請嚴格按 JSON 輸出。"
    r = llm_fn(RUBRIC, user)
    if 'error' in r:
        return {'llm': llm_name, 'error': r['error']}
    c = r.get('content', '')
    try:
        s = c.find('{')
        e = c.rfind('}') + 1
        if s >= 0 and e > s:
            return {'llm': llm_name, 'data': json.loads(c[s:e])}
    except Exception as ex:
        return {'llm': llm_name, 'parse_error': str(ex), 'raw': c[:200]}
    return {'llm': llm_name, 'raw': c[:200]}


def main():
    rd = sys.argv[1] if len(sys.argv) > 1 else 'round1'
    reports = load_reports()
    print(f'載入 {len(reports)} 份報告')
    for k, v in reports.items():
        print(f'  {k}: {len(v)} 字')

    llms = [('gpt', ask_gpt), ('qwen', ask_qwen), ('gemini', ask_gemini), ('kimi', ask_kimi), ('deepseek', ask_deepseek)]
    all_results = {}

    for label, rep in reports.items():
        print(f'\n=== {label} ===')
        gt = GT.get(label, '')
        results = {}
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
            futs = {ex.submit(score, n, fn, label, rep, gt): n for n, fn in llms}
            for f in concurrent.futures.as_completed(futs, timeout=420):
                n = futs[f]
                try:
                    results[n] = f.result()
                except Exception as e:
                    results[n] = {'llm': n, 'error': str(e)}
        all_results[label] = results
        ovs = []
        for llm, r in results.items():
            if 'data' in r:
                d = r['data']
                s = d.get('scores', {})
                ov = d.get('overall', 0)
                ovs.append((llm, ov))
                icon = '✓' if ov >= 95 else '✗'
                print(f'  {icon} {llm}: 正{s.get("correctness","?")}/明{s.get("clarity","?")}/讀{s.get("readability","?")}/值{s.get("value","?")} = {ov}')
                for i in d.get('critical_issues', [])[:3]:
                    print(f'       × {i}')
            else:
                e = r.get('error', r.get('parse_error', '?'))
                print(f'  ✗ {llm}: {str(e)[:100]}')
        if ovs:
            mn = min(x for _, x in ovs)
            avg = sum(x for _, x in ovs) / len(ovs)
            print(f'  → 平均{avg:.1f} 最低{mn} {"PASS" if mn >= 95 else "FAIL"}')

    out = Path(f'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/scripts/r_audit_{rd}.json')
    out.write_text(json.dumps(all_results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\n→ {out}')


if __name__ == '__main__':
    main()
