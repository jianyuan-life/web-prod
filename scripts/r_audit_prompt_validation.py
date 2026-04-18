#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
第二輪：驗證新 prompt + 事實表注入，對 5 LLM 證明能阻止 Round1 的 6 種錯誤
做法：把新 prompt + 事實表 userPrompt 給 5 LLM 評「這個 prompt 能否阻止 AI 編造？」
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

# 讀新 prompt
R_PROMPT_PATH = Path(r'D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\prompts\r_plan_v2.ts')
new_prompt = R_PROMPT_PATH.read_text(encoding='utf-8')

# 模擬真實 userPrompt（以 R1 進壹×思齊為例）
USER_PROMPT_SAMPLE = """合否？關係合盤分析 — 共 2 位成員

【關係描述】男女朋友

【客戶想了解的問題】是否適合當夫妻

════════════════════════════════════════════
【合盤事實表（違反即不合格，所有論述必須以此為準）】
════════════════════════════════════════════
李進壹：八字「甲戌 丙子 丙申 乙未」
  → 日主：丙  日支：申
  → 年支：戌  生肖：狗
馮思齊：八字「丙子 丁酉 乙亥 丁亥」
  → 日主：乙  日支：亥
  → 年支：子  生肖：鼠

【雙方年支生肖關係】戌(狗) × 子(鼠) = 中性（無合無沖無刑無害）
【雙方日支關係】申 × 亥 = 六害
【雙方日干關係】丙 × 乙 = 乙(木)被生 丙(火)
【十神（以李進壹為我）】丙見乙 = 正印
【十神（以馮思齊為我）】乙見丙 = 傷官

※ 所有事實來自 lunar-python 精算，禁止 AI 自行推測生肖、日主、十神、合沖刑害。
※ 若你寫的論述與此事實表衝突，你必須立刻修正。
════════════════════════════════════════════

（以下為完整系統排盤數據...）

請根據以上所有成員的排盤數據，撰寫完整的關係合盤分析報告。
重要提醒：
1. 所有分析必須基於排盤數據中的具體結果，不得編造。
2. 【最高優先】合盤事實表（生肖、日主、合沖刑害、十神）為絕對事實，違反即不合格。
3. 每個分析論點都必須引用至少一個系統的具體合盤結果。
4. 禁止任何評分或分數。
5. 現在是2026年丙午年。
6. 好的地方和需要注意的地方都必須涉及雙方互動。
7. 先給明確結論（合/不合/合但有致命雷區），再展開分析。
8. 寫完每章後，請自我檢查：「我剛寫的生肖是否與事實表一致？合沖刑害是否與事實表一致？十神是否與事實表一致？」如有不符立刻修正。
"""

RUBRIC = """你是命理 AI prompt 品質審核員。我剛修復了鑑源 R 方案的 prompt，加入了「合盤事實表」硬編碼注入機制。
請你嚴格評估：這個新 prompt 是否能阻止第一輪發現的 6 種嚴重錯誤？

## 第一輪發現的 6 種必須阻止的錯誤
1. **生肖自行推測錯誤**（例：把「1995年甲戌生」錯說成屬鼠）
2. **地支關係查表錯誤**（例：「子戌相刑」「狗鼠相害」這些不存在的關係）
3. **天干關係查表錯誤**（例：「丙庚相沖」——實際只有甲庚/乙辛/壬丙/癸丁四沖）
4. **十神關係錯誤**（例：「癸見丙是正官合」——實際癸見丙是正財）
5. **五行論述自相矛盾**（例：「完全沒水和木」緊接「地支戌藏丁辛戊補水木」）
6. **漏掉重要關係**（例：進壹日支申+思齊日支亥 = 六害，但報告只說「申金生亥水」沒提害）

## 新 prompt 機制
- 在 userPrompt 中硬編碼注入「合盤事實表」（含生肖、日主、合沖刑害、十神，全部來自 lunar-python 精算）
- 在 systemPrompt 加入「命理正確性硬規則」，明文列出：
  - 生肖查表對應（子鼠、丑牛...）
  - 地支六合/六沖/六害/三刑 完整查表
  - 天干五合/四沖 完整查表
  - 十神計算法
  - 五行論述自洽檢查

## 評分（0-100）
請評估「新 prompt 能阻止多少 Round1 錯誤？」：
- 100 分：完全阻止 6 種錯誤，AI 不可能再犯
- 90+：高度可阻止，只有極端 hallucination 才會漏
- 80：主要錯誤阻止，但仍可能漏掉細節
- < 80：prompt 不夠強

## 輸出嚴格 JSON：
{
  "scores": {
    "error_1_zodiac": N, "error_2_dizhi": N, "error_3_tiangan": N,
    "error_4_shishen": N, "error_5_contradiction": N, "error_6_missing": N
  },
  "overall": N,
  "remaining_risks": ["還有哪些漏洞"],
  "strengths": ["新 prompt 的優點"]
}
"""


def score_llm(llm_name, llm_fn):
    user = f"""## 新的 R 方案 systemPrompt（已加入命理正確性硬規則）

```
{new_prompt[:12000]}
```

## 真實 userPrompt 範例（含事實表）

{USER_PROMPT_SAMPLE}

請嚴格評分，只輸出 JSON。"""
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
        return {'llm': llm_name, 'parse_error': str(ex), 'raw': c[:300]}
    return {'llm': llm_name, 'raw': c[:300]}


def main():
    llms = [('gpt', ask_gpt), ('qwen', ask_qwen), ('gemini', ask_gemini), ('kimi', ask_kimi), ('deepseek', ask_deepseek)]
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        futs = {ex.submit(score_llm, n, fn): n for n, fn in llms}
        for f in concurrent.futures.as_completed(futs, timeout=240):
            n = futs[f]
            try:
                results[n] = f.result()
            except Exception as e:
                results[n] = {'llm': n, 'error': str(e)}

    print('=== Prompt 驗證結果 ===')
    ovs = []
    for llm, r in results.items():
        if 'data' in r:
            d = r['data']
            s = d.get('scores', {})
            ov = d.get('overall', 0)
            ovs.append((llm, ov))
            icon = '✓' if ov >= 95 else '✗'
            print(f'  {icon} {llm}: ovr={ov}')
            for k, v in s.items():
                print(f'     {k}: {v}')
            for rsk in d.get('remaining_risks', [])[:3]:
                print(f'     ⚠ {rsk}')
        else:
            err = r.get('error', r.get('parse_error', '?'))
            print(f'  ✗ {llm}: {str(err)[:120]}')

    if ovs:
        mn = min(x for _, x in ovs)
        avg = sum(x for _, x in ovs) / len(ovs)
        print(f'\n→ 平均{avg:.1f} 最低{mn} {"PASS" if mn >= 95 else "FAIL"}')

    out = Path(r'D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\scripts\r_audit_prompt_validation.json')
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'→ {out}')


if __name__ == '__main__':
    main()
