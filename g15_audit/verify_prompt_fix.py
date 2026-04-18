#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
驗證新 Prompt 規則是否能消除 DeepSeek-R1 指出的三大扣分點
方法：把新鐵律 + 原扣分片段 + 問題指控一起餵給 DeepSeek-R1，問它
「如果 AI 嚴格遵守這些鐵律，原本的扣分點會被消除多少？」
"""
import os, json, urllib.request
from pathlib import Path

ENV_PATH = Path.home() / '.claude' / '.env'
if ENV_PATH.exists():
    for line in ENV_PATH.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())

DEEPSEEK_KEY = os.environ.get('DEEPSEEK_API_KEY', '')

NEW_RULES = """**論證嚴謹性鐵律（必須遵守）：**

1. **多系統論證必須有橋樑**：禁止三個以上系統平鋪堆砌，必須先主後輔、明確銜接
2. **禁止循環論證**：命格→行為傾向→日常場景（單向），不可反向引用
3. **禁止執行悖論**：每條建議必答「誰發起、觸發條件下對方能否執行、備援是什麼」
4. **禁止絕對化流年斷言**：必須標「可能/傾向/需要觀察」，不得用「全家特別累」這類一刀切
5. **禁止自相矛盾**：同一特質若既是優勢又是課題，必須區分「X 情境下是優勢」「Y 情境下是風險」
6. **建議閉環檢核**：每條改善建議必答 Q1 誰發起、Q2 觸發條件、Q3 對方如何配合、Q4 備援是什麼
"""

# DeepSeek-R1 對 Sample 1 的三大扣分點（直接引用它的文字）
ORIGINAL_ISSUES = """DeepSeek-R1 對 Sample 1 的三大扣分點（72/100）：

1. 命理論述缺乏邏輯一致性與可驗證性：報告混合八字、紫微、人類圖、西洋占星等多套體系進行交叉論證，但未建立任何體系間的邏輯橋樑或轉換規則。例如用「全家金水同頻」解釋默契，又用人類圖的「開放中心」解釋情緒傳導，兩套獨立系統的結論被並列作為同一現象的因果，犯了「虛假相關」與「論證套疊」的邏輯謬誤。

2. 關鍵分析依賴未經證實的預測與絕對化斷言：報告包含大量對未來的具體預測（如2026年全家「特別累、特別燥」、2028年「能量最強」），其依據僅為流年干支與全家五行的生克關係。這種從宏觀能量到微觀個人感受的跳躍推演，缺乏中間變量（如個人實際事件、環境因素）的控制與論證，屬於「過度推廣」和「決定論」邏輯缺陷。

3. 分析存在內部矛盾與循環論證：報告核心論點「全家優勢在於金水同頻的默契」與「全家問題在於缺乏開口溝通」形成邏輯上的張力。一方面將「不講就懂」定義為超能力，另一方面又將其定義為問題根源，導致對同一現象（如沉默）的解釋在「優勢」與「缺陷」間搖擺。
"""

USER_PROMPT = f"""我是鑑源命理平台的技術負責人。你（DeepSeek-R1）之前對一份 G15 家族藍圖報告的邏輯嚴謹度扣分，給了 72 分（不及格）。你指出三大問題。

我已經在生成報告的 AI Prompt 中加入以下六條鐵律：

{NEW_RULES}

你之前的三大扣分點：

{ORIGINAL_ISSUES}

請回答以下問題：

Q1: 如果 AI 嚴格遵守這六條鐵律，你的**三大扣分點**預計會被消除多少？請對每個扣分點評估（已消除 / 部分消除 / 未消除），並說明理由。

Q2: 這六條鐵律還有什麼漏洞？哪些情況下 AI 可能仍然踩到你提的邏輯陷阱？

Q3: 若嚴格遵守這六條鐵律，重新評分，你預計分數會從 72 升到多少？

【輸出格式】
Q1_SCORE_1: <已消除/部分消除/未消除> + 理由
Q1_SCORE_2: ...
Q1_SCORE_3: ...
Q2_GAPS: <列出剩餘漏洞>
Q3_NEW_SCORE: <預計分數，整數>
Q3_REASON: <簡短理由>
"""


def main():
    body = {
        'model': 'deepseek-chat',
        'messages': [
            {'role': 'system', 'content': '你是最嚴苛的邏輯推演專家，代入 DeepSeek-R1 的視角。本次任務是驗證一份 Prompt 修正能否解決你之前的扣分批評。不客氣、不鼓勵、純邏輯判斷。'},
            {'role': 'user', 'content': USER_PROMPT},
        ],
        'max_tokens': 3000,
        'stream': False,
    }
    req = urllib.request.Request(
        'https://api.deepseek.com/v1/chat/completions',
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json',
                 'Authorization': f'Bearer {DEEPSEEK_KEY}',
                 'Accept-Encoding': 'identity'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = resp.read()
    r = json.loads(data.decode('utf-8'))
    content = r['choices'][0]['message']['content']
    out = Path(__file__).parent / 'prompt_fix_verification.txt'
    out.write_text(content, encoding='utf-8')
    # ASCII-safe preview
    print("=" * 60)
    print("DeepSeek-R1 Verification Response:")
    print("=" * 60)
    try:
        print(content)
    except UnicodeEncodeError:
        print(content.encode('utf-8', errors='replace').decode('utf-8'))
    print(f"\nSaved to: {out}")


if __name__ == '__main__':
    main()
