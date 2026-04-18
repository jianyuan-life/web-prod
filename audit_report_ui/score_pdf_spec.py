#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
對 PDF 設計規範（PDF_STRUCTURE_SPEC_V529.md）做 5 LLM 並行審查，
針對每方案（C/D/G15/R/E1/E2）都評分。
因 PDF 引擎在 Python API（Fly.io）端，本 repo 無法實作，只能審規範。
"""
import os, sys, json, re, concurrent.futures
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'llm_collab'))
from multi_llm import ask_gpt, ask_kimi, ask_deepseek, ask_qwen, ask_gemini  # noqa

# stdout utf-8
if hasattr(sys.stdout, 'reconfigure'):
    try: sys.stdout.reconfigure(encoding='utf-8')
    except Exception: pass

ROOT = Path(__file__).parent.parent
SPEC = (ROOT / 'docs' / 'PDF_STRUCTURE_SPEC_V529.md').read_text(encoding='utf-8')
OUT = Path(__file__).parent / 'pdf_scores'
OUT.mkdir(exist_ok=True)

PLAN_INFO = {
    'C': '人生藍圖 $89（15 章，旗艦方案）',
    'D': '心之所惑 $39（7 章，主題聚焦）',
    'G15': '家族藍圖 $59（9 章，家族動力）',
    'R': '合否？$59（8 章，關係合盤）',
    'E1': '事件出門訣 $89（6 章，奇門遁甲）',
    'E2': '月盤出門訣 $99（8 章，月度訂閱）',
}

SYSTEM = """你是鑑源命理付費報告 PDF 的規範評審員。評估這份 PDF 版面設計規範文件。

**評分標準**：
- 95-97：優秀（目標，無明顯缺漏）
- 90-94：有可改進處
- < 90：規範不完整

**維度（各 20%）**：
1. 完整性：是否涵蓋封面/目錄/起承轉合扉頁/內容/命盤附錄/古籍引用頁
2. 落地性：Python 端能否據此直接實作（色碼/字體/座標/尺寸是否明確）
3. 對齊 UI：與網頁 UI 的起承轉合結構是否一致
4. 可驗證：交付時的自查清單是否可程式化驗證
5. 專業度：字體/配色/版式是否符合付費出版物標準

**回覆必須是純 JSON，無 markdown 包裝**：
{"score": <0-100>, "strengths": [...], "improvements": [...], "verdict": "PASS/FAIL"}
"""


def make_user(plan, spec):
    return f"""請針對鑑源命理「{plan} 方案（{PLAN_INFO[plan]})」的 PDF 是否能按此規範交付出 5 LLM 共識 ≥95 分的付費報告。

背景：
- Python 端 pdf_engine 按此規範實作
- 本規範覆蓋所有 6 方案的起承轉合分頁 + 引用古籍 + 命盤附錄
- {plan} 方案的章節對應表已在規範第三節

**規範全文**：
{spec}

評估：{plan} 方案 PDF 按此規範交付是否能達 ≥95 分？

純 JSON 回覆：
{{"score": <整數>, "strengths": [...], "improvements": [...], "verdict": "PASS/FAIL"}}
"""


def ask_gemini_fb(sys_p, usr_p, max_tokens=1500):
    r = ask_gemini(sys_p, usr_p, model='gemini-2.5-flash', max_tokens=max_tokens)
    if 'error' not in r: return r
    return ask_gpt(sys_p, usr_p, model='gpt-4o-mini', max_tokens=max_tokens)


def run_one(name, fn, plan, max_retries=3):
    import time
    last = None
    for i in range(max_retries):
        try:
            r = fn(SYSTEM, make_user(plan, SPEC), max_tokens=1500)
        except Exception as e:
            r = {'error': str(e)}
        last = r
        err = str(r.get('error', '')) if isinstance(r, dict) else ''
        if ('429' in err or 'overload' in err.lower() or 'quota' in err.lower()) and i < max_retries - 1:
            time.sleep(10 * (i+1))
            continue
        if 'error' not in r and r.get('content'): return name, r
    return name, last


def parse(r):
    if 'error' in r: return None
    c = r.get('content', '')
    m = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', c, re.DOTALL)
    if not m:
        clean = c.replace('```json', '').replace('```', '').strip()
        m = re.search(r'\{.*\}', clean, re.DOTALL)
    if not m: return None
    try: return json.loads(m.group(0))
    except Exception: return None


def score_plan(plan):
    providers = {
        'gpt-4o': ask_gpt,
        'kimi': ask_kimi,
        'deepseek': ask_deepseek,
        'qwen': ask_qwen,
        'gemini/4o-mini': ask_gemini_fb,
    }
    print(f'\n========== [{plan}] PDF spec review ==========')
    results, parsed = {}, {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        futures = [ex.submit(run_one, n, fn, plan) for n, fn in providers.items()]
        for f in concurrent.futures.as_completed(futures, timeout=300):
            try:
                name, r = f.result()
                results[name] = r
                p = parse(r)
                parsed[name] = p
                if p:
                    s = p.get('score', 0)
                    print(f'  [{"PASS" if s>=95 else "FAIL"}] {name}: {s}')
                    for imp in p.get('improvements', [])[:3]:
                        print(f'      -> {imp}')
                else:
                    print(f'  [?] {name}: parse fail')
                    print(f'      raw: {r.get("content", "")[:150]}')
            except Exception as e:
                print(f'  [ERROR] {e}')
    scores = [v.get('score', 0) for v in parsed.values() if v]
    avg = sum(scores)/len(scores) if scores else 0
    passed = all(s >= 95 for s in scores) and len(scores) == 5
    print(f'\n  AVG={avg:.1f}  {len(scores)}/5 evaluated  {"[ALL >=95]" if passed else "[NEEDS REDO]"}')
    out = OUT / f'{plan}_pdf_score.json'
    out.write_text(json.dumps({'raw': results, 'parsed': parsed, 'avg': avg, 'all_pass': passed},
                              ensure_ascii=False, indent=2), encoding='utf-8')
    return parsed


def main():
    targets = sys.argv[1:] if len(sys.argv) > 1 else list(PLAN_INFO.keys())
    for p in targets: score_plan(p)


if __name__ == '__main__':
    main()
