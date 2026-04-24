#!/usr/bin/env python3
"""
本地重試報告生成 — 繞過 Vercel，直接呼叫 API
用途：當 Vercel 部署有問題時，在本地跑完整報告流程
"""
import json, requests, time, sys

# === 設定 ===
PYTHON_API = "https://fortune-reports-api.fly.dev"
DEEPSEEK_API = "https://api.deepseek.com/chat/completions"
DEEPSEEK_KEY = "sk-ba17e4d2a7824c898d46d0652a0c43dd"
SUPABASE_URL = "https://jvmnntavizbjsgofnusy.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp2bW5udGF2aXpianNnb2ZudXN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NTYyNzgsImV4cCI6MjA5MDQzMjI3OH0.TlkGt-YkzoTDe06ayHvZfcZW6hRvUypTBwl1Hs9LMzA"

# === 何宥諄的資料 ===
REPORT_ID = "ecad3988-0ab6-436b-9d6b-c9b8b1b92ac3"
ACCESS_TOKEN = "cae6f154-5f59-426a-8a7f-d489260192e1"
CUSTOMER_EMAIL = "cbe566@gmail.com"
PLAN_CODE = "C"
BIRTH_DATA = {
    "name": "何宥諄",
    "gender": "M",
    "year": 2023,
    "month": 5,
    "day": 8,
    "hour": 10,
    "minute": 0,
}

# === C 方案 System Prompt（精簡版）===
SYSTEM_PROMPT = """你是鑑源命理平台的首席命理顧問，精通東西方十四大命理系統。你正在為一位付費客戶撰寫「人生藍圖」報告。

語氣三原則：先情緒後方向、具體到可執行、避免宿命論。
禁止語言：不說「命中注定」「前世業障」，不貼診斷標籤，每個注意事項都附解法。

## 報告結構（請嚴格用 ## 標題分隔每個章節）

## 命格總覽
用2-3段話描述「你是一個怎樣的人」，生活化比喻。

## 性格深度解析
深入分析性格多面性，指出性格盲點。

## 事業方向與天賦
最適合的5個行業方向、職場風格、創業潛力。

## 財運分析
正財vs偏財、理財性格、投資方向。

## 感情與人際
戀愛模式、桃花運、貴人特徵、社交策略。

## 健康提醒
五行對應的身體強弱、養生建議。

## 大運走勢（未來5-10年）
逐年分析運勢走向、關鍵轉折點。

## 好的地方
列出7-10項天賦優勢，每項四步法：命名優勢→連結命理→善用指南→具體情境。

## 需要注意的地方
列出5-7項挑戰，每項五步法：承認→正常化→心理學根源→命理佐證→出路。

## 改善建議詳解
列出7-10項具體改善建議，重要項用六步法。

## 寫給你的話
像私人信件，溫暖有力量。

語言：繁體中文。字數：6000-10000字。
核心原則：所有分析必須基於排盤數據，每個論點有數據支撐。

【數據零容忍】每個分析論點必須溯源回排盤數據。引用時指明來自哪個系統。如果數據不完整，跳過不編。"""

def supabase_update(report_id, data):
    """更新 Supabase paid_reports"""
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/paid_reports?id=eq.{report_id}",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json=data,
    )
    print(f"  Supabase 更新: {r.status_code}")
    return r.status_code < 300

def main():
    print("=" * 60)
    print(f"開始生成報告: {BIRTH_DATA['name']} ({PLAN_CODE} 方案)")
    print("=" * 60)

    # Step 1: 排盤
    print("\n[1/4] 呼叫 Python API 排盤...")
    try:
        r = requests.post(
            f"{PYTHON_API}/api/calculate",
            json=BIRTH_DATA,
            timeout=60,
            verify=False,  # Windows SSL 問題
        )
        r.raise_for_status()
        calc = r.json()
        print(f"  ✅ 排盤完成，{len(calc.get('analyses', []))} 套系統")
    except Exception as e:
        print(f"  ❌ 排盤失敗: {e}")
        supabase_update(REPORT_ID, {"status": "failed", "error_message": f"排盤失敗: {e}"})
        return

    # Step 2: 構建 prompt
    print("\n[2/4] 構建 DeepSeek prompt...")
    cd = calc.get("client_data", {})
    analyses = calc.get("analyses", [])

    user_prompt = f"""{BIRTH_DATA['name']}，{'男' if BIRTH_DATA['gender']=='M' else '女'}，{BIRTH_DATA['year']}年{BIRTH_DATA['month']}月{BIRTH_DATA['day']}日{BIRTH_DATA['hour']}時
八字：{cd.get('bazi','')} | 用神：{cd.get('yongshen','')} | 五行：{json.dumps(cd.get('five_elements',{}), ensure_ascii=False)}
農曆：{cd.get('lunar_date','')} | 納音：{cd.get('nayin','')} | 命宮：{cd.get('ming_gong','')}
{len(analyses)}套系統排盤完整數據：
"""
    for a in analyses[:14]:
        user_prompt += f"\n【{a['system']}】評分：{a.get('score',0)}分"
        if a.get("summary"):
            user_prompt += f"\n摘要：{a['summary']}"
        if a.get("good_points"):
            user_prompt += "\n好的地方："
            for g in a["good_points"]:
                user_prompt += f"\n- {g}"
        if a.get("bad_points"):
            user_prompt += "\n需要注意："
            for b in a["bad_points"]:
                user_prompt += f"\n- {b}"
        if a.get("details"):
            d = a["details"]
            if isinstance(d, str):
                user_prompt += f"\n詳細：{d[:500]}"
            else:
                user_prompt += f"\n詳細：{json.dumps(d, ensure_ascii=False)[:500]}"
        user_prompt += "\n"

    user_prompt += f"""
請根據以上所有排盤數據，撰寫完整的分析報告。
重要提醒：
1. 現在是2026年丙午年。
2. 你的每一個分析論點都必須引用上方排盤數據中的具體結果，不得編造。
3. 排盤數據中「好的地方」和「需要注意」的每一條都必須在報告中被展開分析，不可遺漏。
4. 如果某個系統數據不完整，跳過該系統，不要瞎編。"""

    print(f"  Prompt 長度: {len(user_prompt)} 字元")

    # Step 3: 呼叫 DeepSeek
    print("\n[3/4] 呼叫 DeepSeek AI 生成報告（約 2-5 分鐘）...")
    supabase_update(REPORT_ID, {"status": "pending", "error_message": None})

    try:
        r = requests.post(
            DEEPSEEK_API,
            headers={"Authorization": f"Bearer {DEEPSEEK_KEY}", "Content-Type": "application/json"},
            json={
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "max_tokens": 8000,
                "temperature": 0.7,
            },
            timeout=300,
        )
        r.raise_for_status()
        data = r.json()
        report_content = data["choices"][0]["message"]["content"]
        print(f"  ✅ AI 生成完成，{len(report_content)} 字")
    except Exception as e:
        print(f"  ❌ DeepSeek 失敗: {e}")
        supabase_update(REPORT_ID, {"status": "failed", "error_message": f"AI 生成失敗: {e}"})
        return

    # Step 4: 存入 Supabase
    print("\n[4/4] 存入 Supabase...")
    report_result = {
        "report_id": REPORT_ID,
        "systems_count": len(analyses),
        "analyses_summary": [{"system": a["system"], "score": a.get("score", 0)} for a in analyses],
        "ai_content": report_content,
        "ai_model": "deepseek-chat",
        "ai_tokens": len(report_content),
    }

    ok = supabase_update(REPORT_ID, {
        "report_result": report_result,
        "status": "completed",
        "error_message": None,
    })

    if ok:
        print(f"\n{'=' * 60}")
        print(f"✅ 報告生成完成！")
        print(f"報告連結: https://jianyuan.life/report/{ACCESS_TOKEN}")
        print(f"字數: {len(report_content)}")
        print(f"系統數: {len(analyses)}")
        print(f"{'=' * 60}")
    else:
        print("❌ Supabase 更新失敗")

if __name__ == "__main__":
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    main()
