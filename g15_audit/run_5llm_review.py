#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
G15 家族藍圖 — 5 LLM 最嚴苛評核
每份報告用 5 個不同視角的 LLM 評分 0-100，任一 < 95 不過
"""
import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

# 載入 .env
ENV_PATH = Path.home() / '.claude' / '.env'
if ENV_PATH.exists():
    for line in ENV_PATH.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())

OPENAI_KEY = os.environ.get('OPENAI_API_KEY', '')
MOONSHOT_KEY = os.environ.get('MOONSHOT_API_KEY', '')
DEEPSEEK_KEY = os.environ.get('DEEPSEEK_API_KEY', '')
GEMINI_KEY = os.environ.get('GEMINI_API_KEY', '')
QWEN_KEY = os.environ.get('QWEN_API_KEY', '') or os.environ.get('DASHSCOPE_API_KEY', '')


def _post(url, headers, body, timeout=180):
    req = urllib.request.Request(url, data=json.dumps(body).encode('utf-8'),
                                 headers=headers, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        body_text = e.read().decode('utf-8', errors='ignore')
        return {'error': f'HTTP {e.code}: {body_text[:500]}'}
    except Exception as e:
        return {'error': f'{type(e).__name__}: {e}'}


def ask_gpt(system, user, model='gpt-4o', max_tokens=3000):
    if not OPENAI_KEY:
        return {'error': 'NO_KEY'}
    r = _post('https://api.openai.com/v1/chat/completions',
              {'Content-Type': 'application/json', 'Authorization': f'Bearer {OPENAI_KEY}'},
              {'model': model, 'messages': [
                  {'role': 'system', 'content': system},
                  {'role': 'user', 'content': user}],
               'max_tokens': max_tokens, 'temperature': 0.3})
    if 'error' in r:
        return r
    try:
        return {'content': r['choices'][0]['message']['content']}
    except Exception as e:
        return {'error': f'Parse: {e}'}


def ask_kimi(system, user, model='moonshot-v1-128k', max_tokens=3000):
    if not MOONSHOT_KEY:
        return {'error': 'NO_KEY'}
    r = _post('https://api.moonshot.cn/v1/chat/completions',
              {'Content-Type': 'application/json', 'Authorization': f'Bearer {MOONSHOT_KEY}'},
              {'model': model, 'messages': [
                  {'role': 'system', 'content': system},
                  {'role': 'user', 'content': user}],
               'max_tokens': max_tokens, 'temperature': 0.3})
    if 'error' in r:
        return r
    try:
        return {'content': r['choices'][0]['message']['content']}
    except Exception as e:
        return {'error': f'Parse: {e}'}


def ask_deepseek(system, user, model='deepseek-reasoner', max_tokens=3000):
    if not DEEPSEEK_KEY:
        return {'error': 'NO_KEY'}
    r = _post('https://api.deepseek.com/v1/chat/completions',
              {'Content-Type': 'application/json', 'Authorization': f'Bearer {DEEPSEEK_KEY}'},
              {'model': model, 'messages': [
                  {'role': 'system', 'content': system},
                  {'role': 'user', 'content': user}],
               'max_tokens': max_tokens})
    if 'error' in r:
        return r
    try:
        return {'content': r['choices'][0]['message']['content']}
    except Exception as e:
        return {'error': f'Parse: {e}'}


def ask_qwen(system, user, model='qwen-max', max_tokens=3000):
    if not QWEN_KEY:
        return {'error': 'NO_KEY'}
    r = _post('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions',
              {'Content-Type': 'application/json', 'Authorization': f'Bearer {QWEN_KEY}'},
              {'model': model, 'messages': [
                  {'role': 'system', 'content': system},
                  {'role': 'user', 'content': user}],
               'max_tokens': max_tokens, 'temperature': 0.3},
              timeout=300)
    if 'error' in r:
        return r
    try:
        return {'content': r['choices'][0]['message']['content']}
    except Exception as e:
        return {'error': f'Parse: {e}'}


def ask_gemini(system, user, model='gemini-2.5-flash', max_tokens=3000):
    if not GEMINI_KEY:
        return {'error': 'NO_KEY'}
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={GEMINI_KEY}'
    r = _post(url, {'Content-Type': 'application/json'},
              {'system_instruction': {'parts': [{'text': system}]},
               'contents': [{'role': 'user', 'parts': [{'text': user}]}],
               'generationConfig': {'maxOutputTokens': max_tokens, 'temperature': 0.3},
               'safetySettings': [
                   {'category': 'HARM_CATEGORY_HARASSMENT', 'threshold': 'BLOCK_NONE'},
                   {'category': 'HARM_CATEGORY_HATE_SPEECH', 'threshold': 'BLOCK_NONE'},
                   {'category': 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'threshold': 'BLOCK_NONE'},
                   {'category': 'HARM_CATEGORY_DANGEROUS_CONTENT', 'threshold': 'BLOCK_NONE'}]},
              timeout=300)
    if 'error' in r:
        return r
    try:
        parts = r.get('candidates', [{}])[0].get('content', {}).get('parts', [])
        return {'content': ''.join(p.get('text', '') for p in parts)}
    except Exception as e:
        return {'error': f'Parse: {e}'}


REVIEWERS = [
    ('GPT-4o',    'family_psychology', ask_gpt,
     "你是家庭心理學博士，專門研究家庭動力系統理論（Family Systems Theory）、Bowen家庭自我分化、依附理論。"
     "你用最嚴苛的家庭心理學視角評估一份家族命理合盤報告。"),
    ('Qwen-Max',  'chinese_metaphysics', ask_qwen,
     "你是中文命理互動學資深學者，精通八字合盤（天合地合、五行互補）、紫微互參（夫妻宮/子女宮/兄弟宮配對）、"
     "生肖三合六合刑沖害、人類圖合圖、姓名學合盤。你用最嚴苛的命理互動學專業視角評分。"),
    ('Gemini-2.5', 'information_arch', ask_gemini,
     "你是資訊架構師與設計專家，專門評估長文本報告的結構性、可讀性、章節平衡、資訊密度、導航性。"
     "你用最嚴苛的資訊架構視角評分，要求報告結構如一本設計精良的書。"),
    ('Kimi-128k', 'narrative', ask_kimi,
     "你是長文敘事專家，擅長評估長報告的敘事節奏、文字感染力、一針見血程度、情緒鉤子、結尾餘韻。"
     "你用最嚴苛的文學敘事視角評分，要求每一段都能讓讀者有「就是這樣」的衝擊感。"),
    ('DeepSeek-R1', 'logical', ask_deepseek,
     "你是邏輯推演專家，專門驗證論證嚴密性、因果鏈、數據支撐度、是否有自相矛盾、建議是否可執行。"
     "你用最嚴苛的邏輯推演視角評分，任何空泛、無根據、自相矛盾的段落都要扣分。"),
]

RUBRIC = """【評分標準】
給一個 0-100 的整數分數，並列出最致命的 3 個問題。

評分細則（各面向滿分占比）：
- 命理論述深度與正確性（25分）
- 互動分析針對性（非個人分析；每段必涉兩人以上）（25分）
- 建議可執行性（具體到行動步驟）（20分）
- 敘事節奏與一針見血（15分）
- 結構與可讀性（15分）

嚴格標準：
- 95-100：S 級神作，可以公開收費$59 甚至更多
- 90-94：A 級，瑕疵存在但可接受
- 85-89：B 級，有不可忽視的缺陷
- 80-84：C 級，需重大修正
- <80：不合格

【輸出格式】（必須嚴格遵守，供機器解析）
SCORE: <整數>
KEY_ISSUES:
1. <問題1>
2. <問題2>
3. <問題3>
SHORT_COMMENT: <一句話總結>
"""


def build_review_user_prompt(report_content, plan_info):
    return f"""你正在評核鑑源命理平台的「家族藍圖 G15」報告（$59）。
客戶購買前提：每位家人都已完成「人生藍圖」，G15 專做成員之間的互動分析。

{plan_info}

{RUBRIC}

【報告全文開始】
{report_content}
【報告全文結束】

請用你的專業視角最嚴苛評分。不要客氣、不要鼓勵、不要打「鼓勵分」。"""


def parse_score(text):
    """從 LLM 回覆抽出分數，失敗回 -1"""
    import re
    # 找 "SCORE: 92" 之類
    m = re.search(r'SCORE[:：]\s*(\d{1,3})', text, re.IGNORECASE)
    if m:
        return int(m.group(1))
    # fallback: 找 "92/100" 或 "分數：92"
    m = re.search(r'(\d{2,3})\s*[/／]\s*100', text)
    if m:
        return int(m.group(1))
    m = re.search(r'分數[:：]\s*(\d{1,3})', text)
    if m:
        return int(m.group(1))
    return -1


def review_report(sample_id, report_content, plan_info):
    print(f"\n{'='*60}")
    print(f"Review {sample_id}  ({len(report_content)} chars)")
    print(f"{'='*60}", flush=True)

    user_prompt = build_review_user_prompt(report_content, plan_info)
    results = {}

    for name, tag, fn, sys_prompt in REVIEWERS:
        print(f"  -> {name} reviewing...", flush=True)
        try:
            r = fn(sys_prompt, user_prompt, max_tokens=2500)
            if 'error' in r:
                print(f"    ERROR: {r['error'][:200]}", flush=True)
                results[name] = {'score': -1, 'text': r['error'], 'tag': tag}
                continue
            content = r['content']
            score = parse_score(content)
            results[name] = {'score': score, 'text': content, 'tag': tag}
            print(f"    {name}: {score}/100", flush=True)
        except Exception as e:
            print(f"    EXCEPTION: {e}", flush=True)
            results[name] = {'score': -1, 'text': str(e), 'tag': tag}

    scores = [v['score'] for v in results.values() if v['score'] >= 0]
    avg = sum(scores) / len(scores) if scores else -1
    mn = min(scores) if scores else -1

    print(f"\nResult: avg={avg:.1f}, min={mn}")
    for name, v in results.items():
        print(f"  {name}: {v['score']}/100")

    return {
        'sample_id': sample_id,
        'results': results,
        'avg': avg,
        'min': mn,
        'passed': mn >= 95,
    }


if __name__ == '__main__':
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument('--sample', default='all', help='sample1/sample2/sample3/all')
    args = p.parse_args()

    AUDIT_DIR = Path(__file__).parent
    OUTPUT_DIR = AUDIT_DIR
    samples = []

    if args.sample in ('sample1', 'all'):
        # 樣本 1：4 人家族
        samples.append({
            'id': 'sample1_4members_lin',
            'plan_info': '4 人家族（父霖、母綺、大女兒汝、小女兒桓），成員年齡跨度含小孩學齡期',
            'file': AUDIT_DIR / 'sample1_content.txt',
        })
    if args.sample in ('sample2', 'all'):
        samples.append({
            'id': 'sample2_4members_he',
            'plan_info': '4 人家族（父何則興、母李禹樂、兒何亮緯、女何芊郳），兒童學齡期議題',
            'file': AUDIT_DIR / 'sample2_content.txt',
        })

    all_results = []
    for s in samples:
        if not s['file'].exists():
            print(f"Skip {s['id']}: {s['file']} not found")
            continue
        content = s['file'].read_text(encoding='utf-8')
        result = review_report(s['id'], content, s['plan_info'])
        all_results.append(result)
        out_file = OUTPUT_DIR / f"review_{s['id']}.json"
        out_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(f"Saved: {out_file}")

    print(f"\n{'='*60}\nSummary\n{'='*60}")
    summary = {'samples': len(all_results), 'passed': 0, 'failed': 0, 'details': []}
    for r in all_results:
        status = '[PASS]' if r['passed'] else '[FAIL]'
        print(f"{status} {r['sample_id']}: avg={r['avg']:.1f}, min={r['min']}")
        summary['passed' if r['passed'] else 'failed'] += 1
        summary['details'].append({'id': r['sample_id'], 'avg': r['avg'], 'min': r['min'], 'passed': r['passed']})

    summary_file = OUTPUT_DIR / 'summary.json'
    summary_file.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"\nSummary file: {summary_file}")
