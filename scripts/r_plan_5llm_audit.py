#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
R 方案「合否？」— 5 LLM 嚴苛評核腳本
作用：取 4 份歷史 R 報告，用 GPT/Qwen/Gemini/Kimi/DeepSeek 分別打分
評核維度：命理正確性、結論明確度、可讀性、值不值 $59
標準：任一 LLM < 95 即不過關
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

RUBRIC = """你是嚴苛的命理報告審核員。以下是鑑源 R 方案「合否？」($59) 雙人合盤報告摘要。
請從 4 個維度各 0-100 分打分，並給總分（平均）。

## 評核維度
1. **命理正確性** (0-100)
   - 八字四柱/十神/納音是否無誤
   - 紫微主星/宮位是否對得上排盤
   - 生肖合/沖/刑/害關係是否正確
   - 五行生剋是否合邏輯
   - 禁止虛構：若有編造命盤元素直接扣 50 分

2. **結論明確度** (0-100)
   - 必須出現「你們合」「你們不合」「你們合，但有雷區」之一
   - 禁止「可能/也許/大致/某種程度」模糊詞
   - 具體建議需可執行（不可「多溝通」這種空話）

3. **可讀性** (0-100)
   - 白話結論優先、命理術語放後
   - 雙方互動分析 ≥ 40% 段落
   - 有三段式總結（🟢好的地方 / 🟡需要注意 / 🔵改善建議）

4. **$59 值不值** (0-100)
   - 客戶讀完會不會有「終於有人敢說實話」的感覺
   - 有沒有對客戶具體關係問題對症下藥
   - 有沒有刻意練習 + 流年展望

## 輸出格式（嚴格 JSON）
```json
{
  "scores": {
    "correctness": 數字,
    "clarity": 數字,
    "readability": 數字,
    "value": 數字
  },
  "overall": 數字（四項平均，最多 2 位小數）,
  "critical_issues": ["列出扣分的致命問題，每條 1-2 句"],
  "improvements": ["3-5 條具體改進建議，針對 prompt 或 UI"]
}
```
"""


def score_with_llm(llm_name, llm_fn, report_summary, ground_truth_note):
    """呼叫單一 LLM 評分"""
    system = RUBRIC
    user = f"""## 地面真相（已人工用 lunar-python 核對）
{ground_truth_note}

## 報告內容（摘要）
{report_summary}

請按 JSON 格式嚴格輸出。"""
    r = llm_fn(system, user)
    if 'error' in r:
        return {'llm': llm_name, 'error': r['error']}
    content = r.get('content', '')
    # 嘗試解析 JSON
    try:
        # 抽取 JSON 區塊
        start = content.find('{')
        end = content.rfind('}') + 1
        if start >= 0 and end > start:
            data = json.loads(content[start:end])
            return {'llm': llm_name, 'data': data, 'raw': content[:500]}
    except Exception as e:
        return {'llm': llm_name, 'parse_error': str(e), 'raw': content[:500]}
    return {'llm': llm_name, 'raw': content[:500]}


def audit_one_report(label, summary, gt_note):
    """對單份報告並行跑 5 LLM"""
    llms = [
        ('gpt', ask_gpt),
        ('qwen', ask_qwen),
        ('gemini', ask_gemini),
        ('kimi', ask_kimi),
        ('deepseek', ask_deepseek),
    ]
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        futs = {ex.submit(score_with_llm, name, fn, summary, gt_note): name
                for name, fn in llms}
        for f in concurrent.futures.as_completed(futs, timeout=240):
            name = futs[f]
            try:
                results[name] = f.result()
            except Exception as e:
                results[name] = {'llm': name, 'error': str(e)}
    return results


def print_summary(label, results):
    print(f"\n{'='*60}")
    print(f"【{label}】5 LLM 評核結果")
    print('='*60)
    overall_scores = []
    for llm, r in results.items():
        if 'error' in r:
            print(f"  {llm}: ERROR {r['error'][:80]}")
            continue
        if 'data' not in r:
            pe = r.get('parse_error', 'no_data')
            print(f"  {llm}: PARSE_FAIL {pe} (raw: {r.get('raw', '')[:100]})")
            continue
        d = r['data']
        s = d.get('scores', {})
        ov = d.get('overall', 0)
        overall_scores.append((llm, ov))
        pass_icon = '✓' if ov >= 95 else '✗'
        print(f"  {pass_icon} {llm}: 正確{s.get('correctness',0)}/明確{s.get('clarity',0)}/可讀{s.get('readability',0)}/值{s.get('value',0)} = 總分 {ov}")
        issues = d.get('critical_issues', [])
        if issues:
            for i, iss in enumerate(issues[:3], 1):
                print(f"     × {iss}")
    if overall_scores:
        avg = sum(s for _, s in overall_scores) / len(overall_scores)
        min_s = min(s for _, s in overall_scores)
        print(f"  → 平均 {avg:.1f} 分 | 最低 {min_s} 分 | 全過 95 閘門？ {'✓' if min_s >= 95 else '✗'}")
    return overall_scores


if __name__ == '__main__':
    # 入口由 stdin 讀 JSON list: [{label, summary, ground_truth}, ...]
    data = json.load(sys.stdin)
    all_results = {}
    for item in data:
        results = audit_one_report(item['label'], item['summary'], item['ground_truth'])
        all_results[item['label']] = results
        print_summary(item['label'], results)
    # 輸出 JSON 結果到檔
    out = Path(r'D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\scripts\r_audit_results.json')
    out.write_text(json.dumps(all_results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"\n結果已存到 {out}")
