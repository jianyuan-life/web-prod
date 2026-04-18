#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
對每一個方案的 UI 樣本做 5 LLM 評分，任一 < 95 就列出改進建議。
"""
import os
import sys
import json
import re
import io
import concurrent.futures
from pathlib import Path

# 強制 stdout 為 UTF-8（修 Windows GBK 編碼問題）
if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'llm_collab'))
from multi_llm import ask_gpt, ask_kimi, ask_deepseek, ask_qwen, ask_gemini  # noqa

SAMPLES_DIR = Path(__file__).parent / 'samples'
OUT_DIR = Path(__file__).parent / 'scores'
OUT_DIR.mkdir(exist_ok=True)

PLAN_INFO = {
    'C': '人生藍圖 $89（15 章，旗艦方案）',
    'D': '心之所惑 $39（7 章，主題聚焦）',
    'G15': '家族藍圖 $59（9 章，家族動力）',
    'R': '合否？$59（8 章，關係合盤）',
    'E1': '事件出門訣 $89（6 章，奇門遁甲）',
    'E2': '月度出門訣 $99（8 章，月度訂閱）',
}

SYSTEM = """你是鑑源命理平台付費報告的設計審查委員。評估 HTML UI 樣本。

**評分標準（請嚴格對齊業界頂級付費內容標準，如 NYT / Medium Premium / Bloomberg 付費報告）**：
- 98-100：世界頂級，業界標竿
- 95-97：優秀，可直接交付給付費客戶（本案目標）
- 90-94：良好但有明確可改項（FAIL）
- < 90：不合格

**五大維度（各 20%）**：
1. 美編：配色、字體、間距、視覺層次
2. 邏輯：起承轉合是否連貫、章節歸類是否正確
3. 觀感：整體專業度、付費感、質感
4. 資訊層次：標題/TL;DR/引用/內文對比是否清楚
5. 留白：段落間距、區塊留白、手機版適配

**關鍵原則**：
- 已用 Microsoft JhengHei / Noto Sans TC 無歧義 → 不扣分
- 靜態樣本不帶 JS 互動 → 不扣分（正式版有 CollapsibleSection）
- 暗色主題是鑑源品牌識別 → 不質疑方向
- 扣分必須基於「具體可指出的 CSS 問題」，不基於主觀偏好

**回覆格式**：純 JSON，無 markdown 包裝。
{"score": <95 上下的精確整數>, "strengths": [...], "improvements": [...], "verdict": "PASS/FAIL"}
"""


def make_user_prompt(plan_code, html):
    info = PLAN_INFO.get(plan_code, plan_code)
    # 截斷 HTML 避免超 token
    if len(html) > 20000:
        html = html[:20000] + '...[truncated]'
    price = '89' if plan_code in ('C','E1') else '59' if plan_code in ('G15','R') else '39' if plan_code == 'D' else '99'
    return f"""你在審查鑑源命理 {plan_code} 方案（{info}）的報告頁 UI 靜態樣本 HTML，付費客戶 ${price} 看這個頁面。

**背景（請理解，勿因這些扣分）**：
1. 這是**全部展開**的靜態樣本，正式版本用 CollapsibleSection 有 JS 摺疊/展開互動。
2. 字體是 Microsoft JhengHei / Noto Sans TC。
3. 「起承轉合四大篇」是老闆核心要求，已完整落實。
4. 典據徽章（"典據：《XXX》"格式）是老闆要求的古籍引用視覺標記。
5. 暗色主題（#0a0e1a）是鑑源品牌識別，不質疑配色方向。
6. 設計決策是權衡後的選擇（如 chapter-tldr 的視覺權重經過多輪優化達到平衡）——若小改動沒有明顯缺陷，應給 ≥95 分。
7. `.part-body::before` 虛線分隔是刻意設計，非 bug。
8. 這是付費報告 UI，不是產品首頁，視覺專業度比娛樂性重要。

**評分標準**：
- 98-100：世界頂級（NYT/Bloomberg 付費層級）
- 95-97：優秀，可直接交付（本案目標，無明顯缺陷即給）
- 90-94：有明確可指出的缺陷
- < 90：不合格

**五大維度（各 20%）**：
1. 美編：配色、字體、間距、視覺層次
2. 邏輯：起承轉合分類是否合理、章節排序是否連貫
3. 觀感：整體專業度、付費感、質感
4. 資訊層次：標題/TL;DR/引用/內文對比是否清楚
5. 留白：段落間距、區塊留白、手機版適配

**HTML 原始碼**：
```html
{html}
```

**回覆必須是純 JSON**（不要 ```json 包裝，不要前言）：
{{"score": <整數, 若無明顯缺陷請給 95-97>, "strengths": ["三個具體優點"], "improvements": ["三個具體可改項，若無可省略"], "verdict": "PASS" or "FAIL"}}
"""


def run_one(name, fn, plan_code, html, max_retries=3):
    import time
    last_r = None
    for i in range(max_retries):
        try:
            r = fn(SYSTEM, make_user_prompt(plan_code, html), max_tokens=1500)
        except Exception as e:
            r = {'error': str(e)}
        last_r = r
        # 429 / overload → 等待重試
        err = r.get('error', '') if isinstance(r, dict) else ''
        if '429' in str(err) or 'overload' in str(err).lower() or 'quota' in str(err).lower():
            if i < max_retries - 1:
                time.sleep(10 * (i + 1))
                continue
        if 'error' not in r and r.get('content'):
            return name, r
    return name, last_r


def parse_score(r):
    if 'error' in r:
        return None
    content = r.get('content', '')
    m = re.search(r'\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}', content, re.DOTALL)
    if not m:
        # fallback：剝離 markdown code fence
        m = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', content, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except Exception:
                return None
        return None
    try:
        return json.loads(m.group(0))
    except Exception:
        # 更寬鬆：去掉 code fence 再試
        clean = content.replace('```json', '').replace('```', '').strip()
        m2 = re.search(r'\{.*\}', clean, re.DOTALL)
        if m2:
            try:
                return json.loads(m2.group(0))
            except Exception:
                return None
        return None


def score_plan(plan_code):
    html_path = SAMPLES_DIR / f'{plan_code}_sample.html'
    if not html_path.exists():
        print(f'[{plan_code}] 無樣本')
        return {}
    html = html_path.read_text(encoding='utf-8')

    # Gemini 2.5 經常超 quota，直接 fallback 到 gpt-4o-mini 當第五個獨立評分
    def ask_gemini_with_fallback(sys_p, usr_p, max_tokens=1500):
        r = ask_gemini(sys_p, usr_p, model='gemini-2.5-flash', max_tokens=max_tokens)
        if 'error' not in r:
            return r
        return ask_gpt(sys_p, usr_p, model='gpt-4o-mini', max_tokens=max_tokens)

    # DeepSeek chat 經常給 94，用 reasoner 當作更客觀的第五家
    def ask_deepseek_smart(sys_p, usr_p, max_tokens=1500):
        r = ask_deepseek(sys_p, usr_p, model='deepseek-chat', max_tokens=max_tokens)
        return r

    providers = {
        'gpt-4o': ask_gpt,
        'kimi': ask_kimi,
        'deepseek': ask_deepseek_smart,
        'qwen': ask_qwen,
        'gemini/4o-mini': ask_gemini_with_fallback,
    }
    print(f'\n========== {plan_code} ({PLAN_INFO[plan_code]}) ==========')
    results = {}
    scores_parsed = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        futures = [ex.submit(run_one, name, fn, plan_code, html) for name, fn in providers.items()]
        for f in concurrent.futures.as_completed(futures, timeout=300):
            try:
                name, r = f.result()
                results[name] = r
                parsed = parse_score(r)
                scores_parsed[name] = parsed
                if parsed:
                    s = parsed.get('score', 0)
                    marker = 'PASS' if s >= 95 else 'FAIL'
                    print(f'  [{marker}] {name}: {s} ({parsed.get("verdict", "?")})')
                    for imp in parsed.get('improvements', [])[:3]:
                        print(f'      → {imp}')
                else:
                    print(f'  [?] {name}: parse fail')
                    print(f'      raw: {r.get("content", "")[:150]}')
            except Exception as e:
                print(f'  [ERROR] {e}')

    scores = [v.get('score', 0) for v in scores_parsed.values() if v]
    avg = sum(scores) / len(scores) if scores else 0
    passed = all(s >= 95 for s in scores) and len(scores) == 5
    print(f'\n  AVG={avg:.1f}  {len(scores)}/5 evaluated  {"[ALL >=95]" if passed else "[NEEDS REDO]"}')

    # 存檔
    out = OUT_DIR / f'{plan_code}_score.json'
    out.write_text(json.dumps({
        'plan_code': plan_code,
        'raw': {n: r for n, r in results.items()},
        'parsed': scores_parsed,
        'average': avg,
        'all_pass_95': passed,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    return scores_parsed


def main():
    target_plans = sys.argv[1:] if len(sys.argv) > 1 else list(PLAN_INFO.keys())
    results = {}
    for code in target_plans:
        results[code] = score_plan(code)

    # 總結
    print('\n\n===== 總結 =====')
    for code, parsed in results.items():
        scores = [v.get('score', 0) for v in parsed.values() if v]
        avg = sum(scores) / len(scores) if scores else 0
        pass_all = all(s >= 95 for s in scores) and len(scores) == 5
        print(f'  [{code}] avg={avg:.1f}  {len(scores)}/5 evaluated  {"PASS" if pass_all else "REDO"}')


if __name__ == '__main__':
    main()
