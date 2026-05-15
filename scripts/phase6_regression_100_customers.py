#!/usr/bin/env python3
"""
Phase 6 marathon — 100 客戶 regression 測試

對應:tasks/master_100_plan_2026-05-15.md Phase 6
目標:從過去半年訂單抽 100 個、用最新 prompt + 引擎重跑、對照舊報告 diff
判斷:diff > X% 屬於品質劣化、需 review prompt change

跑法:
    cd Claude-鑑源網頁製作部門
    python scripts/phase6_regression_100_customers.py --dry      # 列要重跑的、不執行
    python scripts/phase6_regression_100_customers.py --limit 10 # 先跑 10 個試水溫
    python scripts/phase6_regression_100_customers.py            # 全 100 個

必要 env:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    NEXT_PUBLIC_SITE_URL(預設 https://jianyuan.life)
    DEEPSEEK_API_KEY / CLAUDE_API_KEY(報告生成需要)

輸出:
    tasks/marathon_regression_2026-05-15_results.md
        + per-customer:plan_code / 舊 vs 新 / similarity / verdict(PASS/HOLD/FAIL)
        + summary:總 PASS rate / 平均 similarity / outlier 列表
"""

import os
import sys
import json
import time
import argparse
import re
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

try:
    from supabase import create_client, Client
except ImportError:
    print("❌ 需要 supabase-py:pip install supabase")
    sys.exit(1)

# Optional similarity 用 difflib(stdlib、不需 install)
from difflib import SequenceMatcher


# ─── Config ───
SUPABASE_URL = os.getenv('SUPABASE_URL') or os.getenv('NEXT_PUBLIC_SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')
SITE_URL = os.getenv('NEXT_PUBLIC_SITE_URL', 'https://jianyuan.life')
SAMPLE_SIZE = 100
SIMILARITY_THRESHOLD = 0.65  # 報告 similarity >= 65% = PASS(prompt 改動正常會降一些)
SIMILARITY_HOLD = 0.50       # 50-65% = HOLD review、可能 prompt 改太激進
# < 50% = FAIL、必須 revert / 修 prompt


def load_supabase() -> Optional[Client]:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print(f"❌ env not set: SUPABASE_URL={bool(SUPABASE_URL)}, SUPABASE_SERVICE_ROLE_KEY={bool(SUPABASE_KEY)}")
        return None
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def sample_completed_reports(supabase: Client, limit: int = SAMPLE_SIZE) -> list[dict]:
    """從過去半年抽 N 個 status=completed 的報告"""
    cutoff = (datetime.utcnow() - timedelta(days=180)).isoformat()
    res = supabase.table('paid_reports') \
        .select('id, plan_code, customer_email, birth_data, report_result, created_at, access_token') \
        .eq('status', 'completed') \
        .gte('created_at', cutoff) \
        .is_('deleted_at', None) \
        .order('created_at', desc=True) \
        .limit(limit) \
        .execute()
    return res.data or []


def normalize_text(text: str) -> str:
    """標準化文字以做 similarity 比對(去除空白 / 數字 / 日期)"""
    if not isinstance(text, str):
        text = str(text)
    # 移除日期(YYYY-MM-DD / YYYY/MM/DD)
    text = re.sub(r'\d{4}[-/年]\d{1,2}[-/月]\d{1,2}', 'DATE', text)
    # 移除時間(HH:MM)
    text = re.sub(r'\d{1,2}:\d{2}', 'TIME', text)
    # 移除單獨數字
    text = re.sub(r'\b\d+\b', 'N', text)
    # 折疊多空白
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def calc_similarity(old_report: str, new_report: str) -> float:
    """計算兩個報告的相似度(0.0 - 1.0)"""
    old_norm = normalize_text(old_report)
    new_norm = normalize_text(new_report)
    if not old_norm or not new_norm:
        return 0.0
    return SequenceMatcher(None, old_norm, new_norm).ratio()


def regenerate_report(report: dict) -> Optional[str]:
    """呼叫 production /api/admin/recalculate-report 重生(需 admin token)
    返回新生成的 report content,失敗回 None
    """
    # NOTE:此處 stub、實際需要呼叫 admin endpoint
    # 完整實作需:
    #   1. 取 admin token(env var ADMIN_TOKEN)
    #   2. POST /api/admin/recalculate-report { reportId, dryRun: true }
    #   3. 取回 new_report_content(若 dry-run mode 不寫回 DB)
    # Phase 6 實際跑時需 wire 這部分、本檔提供 framework
    print(f"  ⏳ [stub] 重跑 {report['id'][:8]}... 待 admin endpoint dry-run mode wire")
    return None


def verdict_for(similarity: float) -> str:
    if similarity >= SIMILARITY_THRESHOLD:
        return 'PASS'
    elif similarity >= SIMILARITY_HOLD:
        return 'HOLD'
    return 'FAIL'


def main():
    parser = argparse.ArgumentParser(description='Phase 6 100 客戶 regression 測試')
    parser.add_argument('--limit', type=int, default=SAMPLE_SIZE,
                        help=f'抽幾個客戶(預設 {SAMPLE_SIZE})')
    parser.add_argument('--dry', action='store_true',
                        help='只列要跑的、不實際 regenerate')
    parser.add_argument('--output', type=str,
                        default='../tasks/marathon_regression_2026-05-15_results.md',
                        help='結果輸出 .md 路徑')
    args = parser.parse_args()

    supabase = load_supabase()
    if not supabase:
        sys.exit(1)

    print(f"━━━ Phase 6 marathon regression(N={args.limit}、{'DRY' if args.dry else 'LIVE'}) ━━━")
    print(f"抽樣中…")
    reports = sample_completed_reports(supabase, args.limit)
    print(f"找到 {len(reports)} 個 completed 報告(過去 180 天)")

    if args.dry:
        print("\n[dry] 列要跑的:")
        for r in reports[:20]:
            plan = r.get('plan_code', '?')
            created = r.get('created_at', '')[:10]
            print(f"  - {r['id'][:8]} | {plan} | {created}")
        if len(reports) > 20:
            print(f"  ... 共 {len(reports)} 個")
        return

    # LIVE mode:逐個 regenerate + diff
    results = []
    for i, report in enumerate(reports, 1):
        print(f"[{i}/{len(reports)}] {report['id'][:8]} ({report.get('plan_code', '?')})")

        old_content = report.get('report_result', '')
        if isinstance(old_content, dict):
            old_content = json.dumps(old_content, ensure_ascii=False)
        elif not isinstance(old_content, str):
            old_content = str(old_content)

        new_content = regenerate_report(report)
        if not new_content:
            results.append({
                'id': report['id'],
                'plan': report.get('plan_code'),
                'similarity': None,
                'verdict': 'SKIP',
                'note': 'admin endpoint dry-run mode 待 wire',
            })
            continue

        sim = calc_similarity(old_content, new_content)
        v = verdict_for(sim)
        results.append({
            'id': report['id'],
            'plan': report.get('plan_code'),
            'similarity': sim,
            'verdict': v,
        })
        print(f"  similarity={sim:.2%} verdict={v}")

        time.sleep(2)  # 避免 spam DB / API

    # ─── 寫結果 ───
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    pass_count = sum(1 for r in results if r['verdict'] == 'PASS')
    hold_count = sum(1 for r in results if r['verdict'] == 'HOLD')
    fail_count = sum(1 for r in results if r['verdict'] == 'FAIL')
    skip_count = sum(1 for r in results if r['verdict'] == 'SKIP')

    sims = [r['similarity'] for r in results if isinstance(r.get('similarity'), float)]
    avg_sim = sum(sims) / len(sims) if sims else 0.0

    lines = [
        f"# Phase 6 Marathon Regression 測試結果({datetime.utcnow().strftime('%Y-%m-%d')})",
        "",
        f"> 樣本:{len(reports)} 個 completed 報告(過去 180 天抽樣)",
        f"> 評分標準:similarity >= {SIMILARITY_THRESHOLD:.0%} = PASS / >= {SIMILARITY_HOLD:.0%} = HOLD / < {SIMILARITY_HOLD:.0%} = FAIL",
        "",
        "## Summary",
        "",
        f"- ✅ PASS:{pass_count} / {len(results)} = {pass_count / len(results):.0%}" if results else "- (空)",
        f"- ⚠️ HOLD:{hold_count} / {len(results)} = {hold_count / len(results):.0%}" if results else "",
        f"- ❌ FAIL:{fail_count} / {len(results)} = {fail_count / len(results):.0%}" if results else "",
        f"- ⏭ SKIP(admin endpoint 待 wire):{skip_count} / {len(results)}" if skip_count else "",
        f"- 平均 similarity:{avg_sim:.2%}",
        "",
        "## 95 Gate(對應 lesson #145)",
        "",
        f"- L1 QA:PASS rate >= 90% → {'✅' if pass_count / max(len(results), 1) >= 0.9 else '❌'}",
        f"- L2 IA:無 FAIL → {'✅' if fail_count == 0 else '❌'}",
        "",
        "## Per-Customer Detail",
        "",
        "| # | report_id | plan | similarity | verdict | note |",
        "|:---:|:---|:---:|:---:|:---:|:---|",
    ]
    for i, r in enumerate(results, 1):
        sim_str = f"{r['similarity']:.2%}" if isinstance(r.get('similarity'), float) else '—'
        note = r.get('note', '')
        lines.append(f"| {i} | {r['id'][:8]} | {r.get('plan')} | {sim_str} | {r['verdict']} | {note} |")

    output_path.write_text('\n'.join(lines), encoding='utf-8')
    print(f"\n✅ 結果寫入 {output_path}")
    print(f"   PASS: {pass_count} | HOLD: {hold_count} | FAIL: {fail_count} | SKIP: {skip_count}")

    if fail_count > 0:
        print(f"\n🔴 有 {fail_count} 個 FAIL、必須 review prompt change、可能需 revert")
        sys.exit(1)


if __name__ == '__main__':
    main()
