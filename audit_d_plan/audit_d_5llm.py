#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
D 方案「心之所惑」$39 — 5 LLM 嚴苛評核
老闆鐵律：
  1. 每條判斷必須引用具體命盤欄位（日主/十神/命宮主星/大運/流年/格局）
  2. 回答客戶問題必須精準（不是泛泛命格分析）
  3. 可讀性清晰（10秒結論 + 具體行動）
  4. 值不值 $39
標準：任一 LLM < 95 不通過，禁用 fallback。
"""
import os
import sys
import json
import time
import io
from pathlib import Path

# 確保 UTF-8 輸出
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'llm_collab'))

from multi_llm import ask_gpt, ask_kimi, ask_deepseek, ask_qwen, ask_gemini  # noqa

REPORTS_DIR = Path(__file__).parent
OUT_DIR = REPORTS_DIR / 'scores'
OUT_DIR.mkdir(exist_ok=True)


def load_reports():
    """從本地 JSON 讀取 D 方案歷史（reports_data.json 只有摘要，實際內容從 full_reports/ 讀）"""
    with open(REPORTS_DIR / 'reports_data.json', encoding='utf-8') as f:
        meta = json.load(f)
    full_dir = REPORTS_DIR / 'full_reports'
    full_dir.mkdir(exist_ok=True)
    reports = []
    # 環境變數 SUFFIX 可指定讀 _v2 版本
    suffix = os.environ.get('REPORT_SUFFIX', '')
    for r in meta['reports']:
        f = full_dir / f"{r['id']}{suffix}.md"
        if not f.exists():
            f = full_dir / f"{r['id']}.md"
        if f.exists():
            r['ai_content'] = f.read_text(encoding='utf-8')
        reports.append(r)
    return reports


EVAL_SYSTEM = """你是一位極度嚴苛的命理報告評審員。你花了 $39 買這份 D 方案「心之所惑」報告——它應該是一份「針對客戶具體問題的命理解答」，不是泛泛的命格分析。

【老闆鐵律——違反一條直接扣 30 分以上】
1. 每一條論述必須引用具體命盤欄位（「日主庚金」「紫微武曲天府坐命」「庚申月柱」「申酉空亡」等具體八字干支/主星/大運/流年/格局名稱）。禁止「命盤顯示...」這種空話。
2. 必須圍繞客戶原始問題展開，不是把 D 寫成縮小版 C 方案。
3. 「10 秒結論」必須明確（該/不該、哪個選項、怎麼做），不能模稜兩可。
4. 「你的路」必須是具體 3 步驟行動，不是泛泛建議。
5. 不得出現禁止詞：命中注定、前世業障、宿命、注定、100%保證。

【評分維度（每項 20 分，總分 100）】
- 命盤引用具體度（20）：每個論述是否都標明「從哪個系統的哪個具體欄位看出來的」？空話扣 10 分起跳。
- 問題聚焦度（20）：客戶問 A，整份是否 100% 圍繞 A？偏離主題（像 C 方案）扣 15 分以上。
- 10 秒結論衝擊力（20）：第一段是否讓客戶有「靠，這也太準了」的反應？泛泛回答扣 10 分以上。
- 具體行動可執行（20）：改善建議是否具體到「明天就能做」？空泛建議如「多注意健康」扣 10 分以上。
- 物超所值感（20）：$39 買這份報告，客戶會不會覺得值回票價？

禁用 fallback — 任何不確定直接扣分，不給緩衝。你必須嚴格。"""


def eval_prompt(report):
    bazi_facts = '\n'.join([f"- {x}" for x in report.get('verified_facts', [])])
    return f"""以下是 D 方案「心之所惑」$39 的歷史報告。請評分。

【客戶資料】
- 姓名：{report['name']}
- 原始問題：{report['question']}
- 排盤驗證（這些是已用 Windada/lunar-python 獨立核算過的真實命盤）：
  - 八字：{report['bazi']}
  - 日主：{report['rizhu']}
{bazi_facts}

【評分任務】
1. 檢查報告中每一條「引用命盤的論述」是否真的引用了具體欄位（不是空話）
2. 檢查報告是否 100% 圍繞客戶原始問題（不是寫成縮小版 C 方案）
3. 檢查「你的問題 / 你的答案 / 深入解析 / 根源剖析 / 你的路 / 好的地方 / 需要注意 / 改善建議 / 寫給你的話」是否齊全
4. 檢查「你的答案」是否給出明確方向（不是模稜兩可）
5. 檢查「改善建議」是否具體到可執行

【必要輸出格式 — 嚴格 JSON】
{{
  "score": <0-100 整數>,
  "dimensions": {{
    "命盤引用具體度": <0-20>,
    "問題聚焦度": <0-20>,
    "10秒結論衝擊力": <0-20>,
    "具體行動可執行": <0-20>,
    "物超所值感": <0-20>
  }},
  "critical_issues": ["致命問題1", "致命問題2"],
  "improvements": ["改進建議1", "改進建議2", "改進建議3"],
  "verdict": "值 $39 / 不值 $39"
}}

報告全文（{len(report.get('ai_content',''))} 字）：
<<<REPORT_START>>>
{report.get('ai_content','')}
<<<REPORT_END>>>

只輸出 JSON，不要前言不要 markdown。"""


def parse_json(text):
    """容錯解析 LLM JSON 回覆"""
    if not text:
        return None
    # 去除 markdown code block
    text = text.strip()
    if text.startswith('```'):
        text = text.split('```', 2)[1]
        if text.startswith('json'):
            text = text[4:]
    # 找第一個 { 到最後一個 }
    start = text.find('{')
    end = text.rfind('}')
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(text[start:end+1])
    except Exception as e:
        return {'_parse_error': str(e), '_raw': text[start:end+1][:500]}


LLMS = [
    ('gpt-4o', lambda sp, up: ask_gpt(sp, up, max_tokens=2500)),
    ('kimi-128k', lambda sp, up: ask_kimi(sp, up, max_tokens=2500)),
    ('deepseek', lambda sp, up: ask_deepseek(sp, up, max_tokens=2500)),
    ('qwen-max', lambda sp, up: ask_qwen(sp, up, max_tokens=2500)),
    ('gemini-2.5', lambda sp, up: ask_gemini(sp, up, max_tokens=3000)),
]


def eval_one_report(report, round_tag='r1'):
    """一份報告跑 5 LLM 評核"""
    results = {}
    up = eval_prompt(report)
    print(f"\n{'='*60}")
    print(f"評核 {report['id']} {report['name']} — {round_tag}")
    print(f"{'='*60}")
    for name, fn in LLMS:
        print(f"  → {name} ...", end=' ', flush=True)
        t0 = time.time()
        try:
            r = fn(EVAL_SYSTEM, up)
            if 'error' in r:
                print(f"ERROR: {r['error'][:80]}")
                results[name] = {'error': r['error']}
                continue
            content = r.get('content', '')
            parsed = parse_json(content)
            dt = time.time() - t0
            if parsed and 'score' in parsed:
                print(f"score={parsed['score']} ({dt:.1f}s)")
                parsed['_raw'] = content[:300]
                results[name] = parsed
            else:
                print(f"parse fail ({dt:.1f}s): {content[:100]}")
                results[name] = {'error': 'parse_fail', '_raw': content[:500]}
        except Exception as e:
            print(f"EXC: {e}")
            results[name] = {'error': str(e)}
    return results


def main():
    reports = load_reports()
    print(f"載入 {len(reports)} 份 D 方案歷史報告")
    all_scores = {}
    for rep in reports:
        if not rep.get('ai_content'):
            print(f"[跳過] {rep['id']} 無內容")
            continue
        tag = sys.argv[1] if len(sys.argv) > 1 else 'r1'
        res = eval_one_report(rep, tag)
        all_scores[rep['id']] = res
        out_file = OUT_DIR / f"{rep['id']}_{tag}.json"
        out_file.write_text(json.dumps(res, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f"  → 存檔 {out_file.name}")

    # 統計
    print(f"\n{'='*60}\n總結 — {tag}\n{'='*60}")
    min_score = 100
    for rid, res in all_scores.items():
        scores = [r.get('score', 0) for r in res.values() if 'score' in r]
        if scores:
            mn, mx, avg = min(scores), max(scores), sum(scores)/len(scores)
            min_score = min(min_score, mn)
            detail = ' '.join([f"{n}={res[n].get('score','ERR')}" for n,_ in LLMS])
            print(f"  {rid}: min={mn} max={mx} avg={avg:.1f} | {detail}")

    summary = OUT_DIR / f'summary_{tag}.json'
    summary.write_text(json.dumps(all_scores, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"\n最低分: {min_score} | 通過門檻：95")
    print(f"{'✅ 全過' if min_score >= 95 else '❌ 未過 — 需要改 prompt/UI/PDF 後重跑'}")


if __name__ == '__main__':
    main()
