#!/usr/bin/env python3
"""
Phase 6 marathon — 16 報告 marathon(8 plan × 2 性別)

對應:tasks/master_100_plan_2026-05-15.md Phase 6
目標:用代表性測試資料(8 plan × 2 性別)生成 16 份報告、檢查無 5xx、品質達標

8 個 plan:C / D / G15 / R / E1 / E2 / E3 / E4
2 個性別:男 / 女

跑法:
    cd Claude-鑑源網頁製作部門
    python scripts/phase6_marathon_16_reports.py --dry      # 列要跑的、不執行
    python scripts/phase6_marathon_16_reports.py --plan C   # 只跑 C 方案的 2 份
    python scripts/phase6_marathon_16_reports.py            # 跑全 16 份

必要 env:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    NEXT_PUBLIC_SITE_URL(預設 https://jianyuan.life)

輸出:
    tasks/marathon_16_reports_2026-05-15_results.md
"""

import os
import sys
import time
import json
import argparse
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    from supabase import create_client, Client
except ImportError:
    print("❌ 需要 supabase-py:pip install supabase")
    sys.exit(1)


# ─── Test Data Set(8 plan × 2 性別) ───
# 真實但 fictional 客戶資料、避免動真客戶帳戶
TEST_FIXTURES = [
    # plan C 人生藍圖
    {
        'plan': 'C', 'gender': 'M',
        'name': 'Marathon-Test-C-M-2026',
        'birth': {'year': 1990, 'month': 6, 'day': 15, 'hour': 14, 'minute': 30,
                  'gender': 'M', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
    },
    {
        'plan': 'C', 'gender': 'F',
        'name': 'Marathon-Test-C-F-2026',
        'birth': {'year': 1992, 'month': 9, 'day': 23, 'hour': 8, 'minute': 15,
                  'gender': 'F', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
    },
    # plan D 心之所惑
    {
        'plan': 'D', 'gender': 'M',
        'name': 'Marathon-Test-D-M-2026',
        'birth': {'year': 1988, 'month': 3, 'day': 7, 'hour': 22, 'minute': 0,
                  'gender': 'M', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
        'extra': {'topic': '事業', 'analysis_topic': '工作上遇到瓶頸、不知該轉職還是堅持'},
    },
    {
        'plan': 'D', 'gender': 'F',
        'name': 'Marathon-Test-D-F-2026',
        'birth': {'year': 1995, 'month': 11, 'day': 28, 'hour': 6, 'minute': 0,
                  'gender': 'F', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
        'extra': {'topic': '感情', 'analysis_topic': '長期單身、想知道未來感情運'},
    },
    # plan G15 家族藍圖(需先有 2 份完成的 C 報告)
    {
        'plan': 'G15', 'gender': 'M',
        'name': 'Marathon-Test-G15-M-2026',
        'birth': {'year': 1985, 'month': 7, 'day': 4, 'hour': 12, 'minute': 0,
                  'gender': 'M', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
        'note': '需要 2 份家族成員 C 報告先完成、本測試 stub',
    },
    {
        'plan': 'G15', 'gender': 'F',
        'name': 'Marathon-Test-G15-F-2026',
        'birth': {'year': 1987, 'month': 12, 'day': 11, 'hour': 9, 'minute': 30,
                  'gender': 'F', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
        'note': '同上',
    },
    # plan R 合否?
    {
        'plan': 'R', 'gender': 'M',
        'name': 'Marathon-Test-R-M-2026',
        'birth': {'year': 1991, 'month': 2, 'day': 19, 'hour': 18, 'minute': 0,
                  'gender': 'M', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
        'extra': {'members': [
            {'name': 'A 君', 'year': 1991, 'month': 2, 'day': 19, 'hour': 18, 'gender': 'M'},
            {'name': 'B 君', 'year': 1993, 'month': 8, 'day': 5, 'hour': 10, 'gender': 'F'},
        ]},
    },
    {
        'plan': 'R', 'gender': 'F',
        'name': 'Marathon-Test-R-F-2026',
        'birth': {'year': 1989, 'month': 5, 'day': 25, 'hour': 16, 'minute': 0,
                  'gender': 'F', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
        'extra': {'members': [
            {'name': 'C 君', 'year': 1989, 'month': 5, 'day': 25, 'hour': 16, 'gender': 'F'},
            {'name': 'D 君', 'year': 1986, 'month': 10, 'day': 30, 'hour': 14, 'gender': 'M'},
        ]},
    },
    # plan E1 事件擇吉
    {
        'plan': 'E1', 'gender': 'M',
        'name': 'Marathon-Test-E1-M-2026',
        'birth': {'year': 1990, 'month': 6, 'day': 15, 'hour': 14, 'minute': 30,
                  'gender': 'M', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
        'extra': {'event_description': '面試新工作、希望面試順利'},
    },
    {
        'plan': 'E1', 'gender': 'F',
        'name': 'Marathon-Test-E1-F-2026',
        'birth': {'year': 1992, 'month': 9, 'day': 23, 'hour': 8, 'minute': 15,
                  'gender': 'F', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
        'extra': {'event_description': '簽合約、希望簽約過程順利'},
    },
    # plan E2 月度單盤
    {
        'plan': 'E2', 'gender': 'M',
        'name': 'Marathon-Test-E2-M-2026',
        'birth': {'year': 1988, 'month': 3, 'day': 7, 'hour': 22, 'minute': 0,
                  'gender': 'M', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
    },
    {
        'plan': 'E2', 'gender': 'F',
        'name': 'Marathon-Test-E2-F-2026',
        'birth': {'year': 1995, 'month': 11, 'day': 28, 'hour': 6, 'minute': 0,
                  'gender': 'F', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
    },
    # plan E3 月度精選
    {
        'plan': 'E3', 'gender': 'M',
        'name': 'Marathon-Test-E3-M-2026',
        'birth': {'year': 1985, 'month': 7, 'day': 4, 'hour': 12, 'minute': 0,
                  'gender': 'M', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
        'extra': {'topics': ['事業', '財運', '貴人']},
    },
    {
        'plan': 'E3', 'gender': 'F',
        'name': 'Marathon-Test-E3-F-2026',
        'birth': {'year': 1987, 'month': 12, 'day': 11, 'hour': 9, 'minute': 30,
                  'gender': 'F', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
        'extra': {'topics': ['感情', '健康', '化解小人']},
    },
    # plan E4 年度全運
    {
        'plan': 'E4', 'gender': 'M',
        'name': 'Marathon-Test-E4-M-2026',
        'birth': {'year': 1991, 'month': 2, 'day': 19, 'hour': 18, 'minute': 0,
                  'gender': 'M', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
    },
    {
        'plan': 'E4', 'gender': 'F',
        'name': 'Marathon-Test-E4-F-2026',
        'birth': {'year': 1989, 'month': 5, 'day': 25, 'hour': 16, 'minute': 0,
                  'gender': 'F', 'birth_city': '台北市', 'city_lat': 25.04, 'city_lng': 121.56},
    },
]


def load_supabase() -> Optional[Client]:
    url = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        print(f"❌ env not set: SUPABASE_URL={bool(url)}, SUPABASE_SERVICE_ROLE_KEY={bool(key)}")
        return None
    return create_client(url, key)


def trigger_report_generation(supabase: Client, fixture: dict) -> dict:
    """直接 insert paid_reports 模擬付款後觸發 generation
    返回:{ id, plan, status, error?, duration_sec? }
    """
    plan = fixture['plan']
    name = fixture['name']
    birth_data = {**fixture['birth'], 'name': name, **(fixture.get('extra', {}))}

    print(f"  → 建 {plan} {fixture['gender']}({name})…")
    try:
        # 模擬 webhook 處理:寫 paid_reports + 觸發 workflow
        # 真跑時要呼叫 /api/admin/recalculate-report 之類 endpoint
        # 本檔 stub:只 insert + 等 cron pickup
        res = supabase.table('paid_reports').insert({
            'client_name': name,
            'plan_code': plan,
            'amount_usd': 0,  # marathon test 不收費
            'stripe_session_id': f'marathon-test-{plan}-{fixture["gender"]}-{int(time.time())}',
            'birth_data': birth_data,
            'customer_email': f'marathon-test+{plan.lower()}-{fixture["gender"].lower()}@jianyuan.life',
            'status': 'pending',
        }).select('id').single().execute()
        report_id = res.data['id']
        return {
            'id': report_id,
            'plan': plan,
            'gender': fixture['gender'],
            'name': name,
            'status': 'pending',
            'note': fixture.get('note', ''),
        }
    except Exception as e:
        return {
            'plan': plan,
            'gender': fixture['gender'],
            'name': name,
            'status': 'error',
            'error': str(e)[:300],
        }


def poll_status(supabase: Client, report_id: str, timeout_sec: int = 300) -> dict:
    """輪詢報告 status 直到 completed / failed / timeout"""
    start = time.time()
    while time.time() - start < timeout_sec:
        res = supabase.table('paid_reports').select('status, error_message').eq('id', report_id).single().execute()
        status = res.data['status']
        if status in ('completed', 'failed'):
            return {
                'status': status,
                'duration_sec': round(time.time() - start, 1),
                'error': res.data.get('error_message') if status == 'failed' else None,
            }
        time.sleep(10)
    return {'status': 'timeout', 'duration_sec': timeout_sec}


def main():
    parser = argparse.ArgumentParser(description='Phase 6 16 報告 marathon')
    parser.add_argument('--dry', action='store_true', help='只列要跑的、不實際建')
    parser.add_argument('--plan', type=str, help='只跑指定 plan(C/D/G15/R/E1/E2/E3/E4)')
    parser.add_argument('--gender', type=str, help='只跑指定性別(M/F)')
    parser.add_argument('--timeout', type=int, default=300, help='per-report timeout 秒(預設 300)')
    parser.add_argument('--output', type=str,
                        default='../tasks/marathon_16_reports_2026-05-15_results.md')
    args = parser.parse_args()

    fixtures = TEST_FIXTURES
    if args.plan:
        fixtures = [f for f in fixtures if f['plan'].upper() == args.plan.upper()]
    if args.gender:
        fixtures = [f for f in fixtures if f['gender'].upper() == args.gender.upper()]

    print(f"━━━ Phase 6 marathon 16 報告(實 {len(fixtures)} 個、{'DRY' if args.dry else 'LIVE'}) ━━━")

    if args.dry:
        for i, f in enumerate(fixtures, 1):
            print(f"  [{i:2}] {f['plan']:3} {f['gender']} {f['name']}")
        return

    supabase = load_supabase()
    if not supabase:
        sys.exit(1)

    results = []
    for i, fixture in enumerate(fixtures, 1):
        print(f"[{i}/{len(fixtures)}] {fixture['plan']} {fixture['gender']}")
        r = trigger_report_generation(supabase, fixture)
        if r['status'] == 'pending' and r.get('id'):
            print(f"  ⏳ 等待 generation 完成…(timeout {args.timeout}s)")
            poll = poll_status(supabase, r['id'], args.timeout)
            r.update(poll)
            print(f"  → status={r['status']} duration={r.get('duration_sec', 0)}s")
        results.append(r)
        time.sleep(3)  # 避免 spam

    # ─── 寫結果 ───
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    completed = sum(1 for r in results if r['status'] == 'completed')
    failed = sum(1 for r in results if r['status'] == 'failed')
    timeout = sum(1 for r in results if r['status'] == 'timeout')
    error = sum(1 for r in results if r['status'] == 'error')

    avg_dur = sum(r.get('duration_sec', 0) for r in results if isinstance(r.get('duration_sec'), (int, float))) / max(len(results), 1)

    lines = [
        f"# Phase 6 16 報告 Marathon 結果({datetime.utcnow().strftime('%Y-%m-%d')})",
        "",
        f"> 樣本:{len(fixtures)} 個 fixture(8 plan × 2 性別)",
        f"> Per-report timeout:{args.timeout}s",
        "",
        "## Summary",
        "",
        f"- ✅ Completed:{completed} / {len(results)}({completed / len(results):.0%})" if results else "",
        f"- ❌ Failed:{failed} / {len(results)}",
        f"- ⏰ Timeout:{timeout} / {len(results)}",
        f"- 🔴 Error(insert 失敗):{error} / {len(results)}",
        f"- 平均 duration:{avg_dur:.1f}s",
        "",
        "## 95 Gate(對應 lesson #145)",
        "",
        f"- L1 QA:Completed rate >= 95%(15/16)→ {'✅' if completed >= 15 else '❌'}",
        f"- L2 IA:0 timeout(generation < 5min) → {'✅' if timeout == 0 else '❌'}",
        f"- L2 IA:0 error(insert 不掉)→ {'✅' if error == 0 else '❌'}",
        "",
        "## Per-Report Detail",
        "",
        "| # | plan | gender | name | status | duration | error |",
        "|:---:|:---:|:---:|:---|:---:|:---:|:---|",
    ]
    for i, r in enumerate(results, 1):
        dur = f"{r.get('duration_sec', 0):.0f}s" if r.get('duration_sec') else '—'
        err = (r.get('error') or '')[:80]
        lines.append(f"| {i} | {r['plan']} | {r['gender']} | {r['name']} | {r['status']} | {dur} | {err} |")

    output_path.write_text('\n'.join(lines), encoding='utf-8')
    print(f"\n✅ 結果寫入 {output_path}")
    print(f"   Completed: {completed} | Failed: {failed} | Timeout: {timeout} | Error: {error}")

    if failed > 0 or timeout > 0 or error > 0:
        sys.exit(1)


if __name__ == '__main__':
    main()
