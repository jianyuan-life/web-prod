#!/usr/bin/env python3
"""
針對 v5.2.10 報告頁 UI 重構（起承轉合四大篇摺疊）做 5 LLM 並行審查。

輸入：
  - lib/report-structure.ts（分篇邏輯）
  - components/PartSection.tsx（篇章外框）
  - app/report/[token]/page.tsx 的改動摘要
  - docs/PDF_STRUCTURE_SPEC_V529.md（PDF 規範）

目標：每個 LLM 給出 0-100 分 + 改進建議，目標 ≥ 96。
"""
import os
import sys
import json
from pathlib import Path

# 導入 multi_llm
sys.path.insert(0, str(Path(__file__).parent.parent.parent / 'llm_collab'))
from multi_llm import ask_gpt, ask_kimi, ask_deepseek, ask_qwen, ask_gemini  # noqa

import concurrent.futures

ROOT = Path(__file__).parent.parent

# ── 載入輸入檔 ──
files_to_review = {
    'lib/report-structure.ts': (ROOT / 'lib' / 'report-structure.ts').read_text(encoding='utf-8'),
    'components/PartSection.tsx': (ROOT / 'components' / 'PartSection.tsx').read_text(encoding='utf-8'),
    'docs/PDF_STRUCTURE_SPEC_V529.md': (ROOT / 'docs' / 'PDF_STRUCTURE_SPEC_V529.md').read_text(encoding='utf-8'),
}

SYSTEM_PROMPT = """你是鑑源命理平台的付費客戶交付體驗總工程師。你正在審查一次 UI+PDF 架構重構。

背景：
- 平台 6 方案（C/D/G15/R/E1/E2）AI 報告的前端網頁 UI 和 PDF 下載。
- 本次重構把所有付費方案的報告章節按「起承轉合」分為 4 大篇摺疊展開。
- 已建立 lib/report-structure.ts 做章節分類，components/PartSection.tsx 做篇章外框。
- PDF 引擎在 Python 側（Fly.io），本次只出設計規範 PDF_STRUCTURE_SPEC_V529.md 供其實作。

你的任務：
1. 審查上述檔案的設計是否滿足「起承轉合全方位落實」要求
2. 給出 0-100 分
3. 列出 3 個以內的改進建議（每個 1 句話）
4. 格式用 JSON：{"score": N, "strengths": [...], "improvements": [...], "verdict": "PASS/FAIL"}

評分標準：
- ≥ 96：優秀，可直接交付
- 90-95：良好，小問題但不阻塞
- 80-89：需修正後再交付
- < 80：重大缺陷，必須重做
"""

USER_PROMPT = f"""請審查以下檔案，評估本次起承轉合 UI+PDF 架構重構的品質：

===== lib/report-structure.ts =====
{files_to_review['lib/report-structure.ts']}

===== components/PartSection.tsx =====
{files_to_review['components/PartSection.tsx']}

===== docs/PDF_STRUCTURE_SPEC_V529.md =====
{files_to_review['docs/PDF_STRUCTURE_SPEC_V529.md']}

===== 評分請求 =====
請用 JSON 格式回覆，不要有任何其他文字：
{{"score": <0-100>, "strengths": ["...", "..."], "improvements": ["...", "..."], "verdict": "PASS/FAIL"}}
"""


def run_one(name, fn):
    t = __import__('time').time()
    try:
        r = fn(SYSTEM_PROMPT, USER_PROMPT, max_tokens=2000)
    except Exception as e:
        r = {'error': str(e)}
    elapsed = __import__('time').time() - t
    return name, r, elapsed


def main():
    providers = {
        'gpt-4o': ask_gpt,
        'kimi-128k': ask_kimi,
        'deepseek': ask_deepseek,
        'qwen-max': ask_qwen,
        'gemini-2.5': ask_gemini,
    }
    print(f'開始並行審查（{len(providers)} LLM）...')
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        futures = [ex.submit(run_one, name, fn) for name, fn in providers.items()]
        for f in concurrent.futures.as_completed(futures, timeout=300):
            try:
                name, r, elapsed = f.result()
                results[name] = r
                print(f'  [{name}] done ({elapsed:.1f}s)')
            except Exception as e:
                print(f'  [ERROR] {e}')

    # 解析分數
    scores = []
    for name, r in results.items():
        if 'error' in r:
            print(f'\n[{name}] ERROR: {r["error"]}')
            continue
        content = r.get('content', '')
        # 提取 JSON
        import re
        m = re.search(r'\{.*\}', content, re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(0))
                scores.append((name, parsed))
                print(f'\n[{name}] score={parsed.get("score")} verdict={parsed.get("verdict")}')
                for imp in parsed.get('improvements', []):
                    print(f'  - {imp}')
            except Exception as e:
                print(f'\n[{name}] JSON parse error: {e}\n  raw: {content[:300]}')
        else:
            print(f'\n[{name}] 無 JSON\n  raw: {content[:300]}')

    # 輸出摘要
    avg = sum(s[1].get('score', 0) for s in scores) / len(scores) if scores else 0
    print(f'\n===== 平均分：{avg:.1f} =====')

    # 存檔
    out_path = Path(__file__).parent / 'review_v529_raw.json'
    out_path.write_text(json.dumps({
        'results': {name: r for name, r in results.items()},
        'parsed_scores': [{'name': n, 'data': d} for n, d in scores],
        'average': avg,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'已存：{out_path}')


if __name__ == '__main__':
    main()
