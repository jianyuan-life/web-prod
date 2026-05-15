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
        + per-customer:plan_code / 舊 vs 新 / similarity / verdict(PASS/HOLD/FAIL/SKIP/ERROR)
        + summary:總 PASS rate / 平均 similarity / outlier 列表
"""

import os
import sys
import json
import time
import argparse
import re
import urllib.request
import urllib.error
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
ADMIN_KEY = os.getenv('ADMIN_KEY', '')  # 呼叫 /api/admin/recalculate-report 需(x-admin-key header)
DRYRUN_TIMEOUT_S = int(os.getenv('REGRESSION_DRYRUN_TIMEOUT_S', '300'))  # dryRun 同步生成可達數分鐘
# admin endpoint checkAdminRateLimit = 10/min/IP(固定窗口)→ 每 iteration(含 skip/error)
# 額外 sleep 7s(> 6s/格、留 1s buffer)。實際請求間隔 = 同步生成耗時(可達數分鐘)+ 7s、
# 遠大於 6s、ok 分支絕不觸 429;7s 主要保障「連續快速 skip/error」情境不爆 rate limit。
# (L3 Codex P2:原 sleep(1) 且 skip/fail continue 不 sleep、第 11 請求 429 中斷 100-run)
ADMIN_THROTTLE_S = int(os.getenv('REGRESSION_ADMIN_THROTTLE_S', '7'))
# 成本警示:每份 dry-run 仍耗真實 AI token(C≈$5、D/R/E≈$2)、100 份 ≈ $200-500
EST_COST_PER_REPORT_USD = {'C': 5.0, 'G15': 5.0, 'D': 2.0, 'R': 2.5, 'E1': 2.0, 'E2': 1.5, 'E3': 2.5, 'E4': 3.0}
# L3 Codex R5 P2:最低覆蓋率閘 — 防「1 PASS + 99 SKIP 仍 100% pass rate 假綠」
# G15/R 為 workflow-only 少數(8 方案中僅 2)、代表性樣本 comparison 應佔多數;
# 比對數 / 樣本數 < 此比例 → regression 無代表性、exit 1
MIN_COVERAGE_RATIO = float(os.getenv('REGRESSION_MIN_COVERAGE', '0.5'))
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


def extract_old_content(report: dict) -> str:
    """抽舊報告純文字供 similarity 比對(L1 QA P0-2:report_result 是物件不是字串)

    generate-report 寫 DB 時 report_result = { ai_content, ai_model, ai_tokens, ... }
    (見 app/api/generate-report/route.ts buildCall* 後 reportResult 結構)。
    新 dryRun 回的 generated_content == 該物件的 ai_content(純 markdown)。
    必須抽 ai_content 對 ai_content、否則「物件 JSON dump vs 純 markdown」
    similarity 系統性偏低 → 假 FAIL。
    """
    rr = report.get('report_result', '')
    if isinstance(rr, dict):
        # 首選 ai_content(canonical);相容舊 schema content;最後保底整包 dump
        return rr.get('ai_content') or rr.get('content') or json.dumps(rr, ensure_ascii=False)
    if isinstance(rr, str):
        return rr
    return str(rr) if rr is not None else ''


def regenerate_report(report: dict) -> dict:
    """呼叫 production /api/admin/recalculate-report dryRun 重生(L1 QA P0-1 wire)

    回 dict:
      { 'status': 'ok',   'content': <markdown>, 'ai_model': str, 'path': str }
      { 'status': 'skip', 'detail': <原因> }   # G15 等只走 workflow path
      { 'status': 'fail', 'detail': <原因> }   # 排盤/AI/timeout/auth 失敗
    dryRun=True → endpoint 不寫 DB / 不改 status / 不發 email、只回生成內容。
    """
    report_id = report.get('id', '')
    if not ADMIN_KEY:
        return {'status': 'fail', 'detail': 'ADMIN_KEY env 未設(呼叫 admin endpoint 必要)'}

    url = f"{SITE_URL}/api/admin/recalculate-report"
    payload = json.dumps({'reportId': report_id, 'dryRun': True}).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST')
    req.add_header('Content-Type', 'application/json')
    req.add_header('x-admin-key', ADMIN_KEY)  # 對應 lib/admin-auth.ts checkAdminAuth
    try:
        with urllib.request.urlopen(req, timeout=DRYRUN_TIMEOUT_S) as resp:
            body = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        # endpoint 對 dry-run 失敗回 502/504 + JSON body
        try:
            ebody = json.loads(e.read().decode('utf-8'))
            detail = ebody.get('error') or ebody.get('detail') or f'HTTP {e.code}'
        except Exception:
            detail = f'HTTP {e.code}'
        return {'status': 'fail', 'detail': detail}
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return {'status': 'fail', 'detail': f'網路/逾時:{e}'}
    except Exception as e:
        return {'status': 'fail', 'detail': f'未預期:{e}'}

    # G15 等只走 workflow path → endpoint 回 200 + skipped(非 error)
    if body.get('skipped'):
        return {'status': 'skip', 'detail': str(body.get('reason') or body.get('skipped'))}
    if not body.get('ok') or body.get('dryRun') is not True:
        return {'status': 'fail', 'detail': str(body.get('error') or body.get('detail') or 'unexpected response')}
    content = body.get('generated_content')
    if not content:
        return {'status': 'fail', 'detail': 'endpoint 回 ok 但 generated_content 空'}
    return {
        'status': 'ok',
        'content': content,
        'ai_model': body.get('ai_model'),
        'path': body.get('path'),
    }


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
                        help='只列要跑的、不實際 regenerate(不花錢、不打 endpoint)')
    parser.add_argument('--confirm-cost', action='store_true',
                        help='LIVE 模式必加:確認知悉每份 dry-run 仍耗真實 AI token(防誤觸 $200-500)')
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

    # IA L2 P2-3:0 樣本明確提示、避免「無事可測」被誤讀成「100% PASS 通過」(silent pass)
    if len(reports) == 0:
        print("⚠️ 0 個 completed 樣本(過去 180 天)— 未執行任何 regression 比對、非「通過」")
        sys.exit(0)  # 非錯誤(可能真的沒新報告)、但明確告知未驗證

    # 成本估算(對齊 workflow-stuck-sop.md「成本意識」+ CLAUDE.md 第 8 條動真錢守門)
    est = sum(EST_COST_PER_REPORT_USD.get(r.get('plan_code', ''), 2.0) for r in reports)
    print(f"💰 預估 AI 成本:約 ${est:.0f} USD({len(reports)} 份、dryRun 不寫 DB 但仍耗真實 token)")

    if args.dry:
        print("\n[dry] 列要跑的(不執行、不花錢):")
        for r in reports[:20]:
            plan = r.get('plan_code', '?')
            created = r.get('created_at', '')[:10]
            print(f"  - {r['id'][:8]} | {plan} | {created}")
        if len(reports) > 20:
            print(f"  ... 共 {len(reports)} 個")
        return

    # LIVE 模式:動真錢守門(CLAUDE.md 第 8 條 ① 動真錢必顯式確認)
    if not args.confirm_cost:
        print(f"\n🛑 LIVE 模式會花約 ${est:.0f} USD 真實 AI 成本。")
        print(f"   先用 --dry 預覽、或 --limit 10 小批試水溫。")
        print(f"   確認要跑請加 --confirm-cost(顯式確認、防誤觸大額)。")
        sys.exit(2)

    if not ADMIN_KEY:
        print("❌ ADMIN_KEY env 未設(呼叫 /api/admin/recalculate-report 必要)、無法 LIVE")
        sys.exit(1)

    # LIVE mode:逐個 regenerate + diff
    results = []
    for i, report in enumerate(reports, 1):
        print(f"[{i}/{len(reports)}] {report['id'][:8]} ({report.get('plan_code', '?')})")

        # P0-2:抽 report_result.ai_content 純文字、對 dryRun 回的 generated_content
        old_content = extract_old_content(report)

        gen = regenerate_report(report)
        gstatus = gen.get('status')
        if gstatus == 'skip':
            # 刻意 SKIP:G15 等只走 workflow path、非錯誤、不計入失敗(L3 Codex P1)
            results.append({
                'id': report['id'],
                'plan': report.get('plan_code'),
                'similarity': None,
                'verdict': 'SKIP',
                'note': f"skip:{gen.get('detail', '')}",
            })
            print(f"  ⏭ SKIP(workflow-only):{gen.get('detail', '')}")
        elif gstatus != 'ok' or not gen.get('content'):
            # 🔴 endpoint/傳輸/auth/timeout/5xx 失敗 = ERROR(非 SKIP)
            # L3 Codex P1:必須讓「全 ERROR、0 比對」的 run exit 非零、不可假綠
            results.append({
                'id': report['id'],
                'plan': report.get('plan_code'),
                'similarity': None,
                'verdict': 'ERROR',
                'note': f"error:{gen.get('detail', 'unknown')}",
            })
            print(f"  ❌ ERROR(endpoint/傳輸失敗、計入 run 失敗):{gen.get('detail', '')}")
        else:
            new_content = gen['content']
            sim = calc_similarity(old_content, new_content)
            v = verdict_for(sim)
            results.append({
                'id': report['id'],
                'plan': report.get('plan_code'),
                'similarity': sim,
                'verdict': v,
                'ai_model': gen.get('ai_model'),
            })
            print(f"  similarity={sim:.2%} verdict={v} model={gen.get('ai_model')}")

        # L3 Codex P2:每 iteration(含 skip/error)都 throttle、對齊 admin 10/min/IP
        # 放迴圈尾、所有分支都會經過(取代原 continue 跳過 sleep 的 bug)
        if i < len(reports):
            time.sleep(ADMIN_THROTTLE_S)

    # ─── 寫結果 ───
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    pass_count = sum(1 for r in results if r['verdict'] == 'PASS')
    hold_count = sum(1 for r in results if r['verdict'] == 'HOLD')
    fail_count = sum(1 for r in results if r['verdict'] == 'FAIL')
    skip_count = sum(1 for r in results if r['verdict'] == 'SKIP')
    error_count = sum(1 for r in results if r['verdict'] == 'ERROR')   # endpoint/傳輸失敗(L3 Codex P1)
    comparison_count = pass_count + hold_count + fail_count            # 真正有做 similarity 比對的

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
        # IA L2 P2-1:分母統一用 comparison_count(實際比對數)、與下方 95 Gate 口徑一致
        # (SKIP/ERROR 非比對、不應稀釋 PASS rate;避免同份報表兩種分母誤導 revert 決策)
        f"- ✅ PASS:{pass_count} / {comparison_count} = {(pass_count / comparison_count):.0%}(佔實際比對)" if comparison_count else "- ✅ PASS:0(無實際比對)",
        f"- ⚠️ HOLD:{hold_count} / {comparison_count} = {(hold_count / comparison_count):.0%}" if comparison_count else "",
        f"- ❌ FAIL:{fail_count} / {comparison_count} = {(fail_count / comparison_count):.0%}" if comparison_count else "",
        f"- ⏭ SKIP(G15 workflow-only、刻意跳過、非錯誤):{skip_count} / {len(results)}" if skip_count else "",
        f"- 🔴 ERROR(endpoint/傳輸/auth/timeout 失敗、run 視為失敗):{error_count} / {len(results)}" if error_count else "",
        f"- 實際比對數(PASS+HOLD+FAIL):{comparison_count} / {len(results)}"
        + (f" = {comparison_count / len(results):.0%}(覆蓋率閘 ≥ {MIN_COVERAGE_RATIO:.0%})" if results else ""),
        f"- 平均 similarity:{avg_sim:.2%}",
        "",
        "## 95 Gate(對應 lesson #145)",
        "",
        f"- 覆蓋率 ≥ {MIN_COVERAGE_RATIO:.0%}(防 1 PASS+99 SKIP 假綠)→ "
        f"{'✅' if len(results) > 0 and comparison_count >= len(results) * MIN_COVERAGE_RATIO else '❌'}",
        f"- L1 QA:PASS rate >= 90%(分母=實際比對數)→ {'✅' if comparison_count > 0 and pass_count / comparison_count >= 0.9 else '❌'}",
        f"- L2 IA:無 FAIL 且無 ERROR 且有實際比對 → {'✅' if fail_count == 0 and error_count == 0 and comparison_count > 0 else '❌'}",
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
    print(f"   PASS: {pass_count} | HOLD: {hold_count} | FAIL: {fail_count} | "
          f"SKIP: {skip_count} | ERROR: {error_count} | 比對數: {comparison_count}")

    # L3 Codex P1:run 有效性 + 品質雙閘、任一不過 exit 非零(防假綠)
    exit_code = 0
    if error_count > 0:
        print(f"\n🔴 有 {error_count} 個 ERROR(endpoint/傳輸/auth/timeout)— regression run 無效、"
              f"先修 endpoint / ADMIN_KEY / rate-limit、不可當通過")
        exit_code = 1
    if len(reports) > 0 and comparison_count == 0:
        print(f"\n🔴 0 個實際比對(全 ERROR/SKIP)— regression 未做任何驗證、視為失敗(不可假綠)")
        exit_code = 1
    # L3 Codex R5 P2:覆蓋率閘 — 防「1 PASS + 99 SKIP 仍 100% pass rate 假綠」
    # comparison_count>0 但佔比過低 = 100-customer regression 無代表性、CI 不可當通過
    if len(reports) > 0 and 0 < comparison_count < (len(reports) * MIN_COVERAGE_RATIO):
        print(f"\n🔴 覆蓋不足:實際比對 {comparison_count}/{len(reports)}="
              f"{comparison_count / len(reports):.0%} < {MIN_COVERAGE_RATIO:.0%} 門檻"
              f"(SKIP/ERROR 過多)— regression 無代表性、不可當通過"
              f"(調 REGRESSION_MIN_COVERAGE env 或排除 G15/R workflow-only 抽樣)")
        exit_code = 1
    if fail_count > 0:
        print(f"\n🔴 有 {fail_count} 個 FAIL、必須 review prompt change、可能需 revert")
        exit_code = 1
    # L3 Codex R3 P2-2:強制 L1 90% pass-rate gate 入 exit code
    # (HOLD-heavy 但無 FAIL/ERROR 時、報表 95 Gate L1 顯示 ❌ 卻 exit 0、CI 會誤判通過)
    if comparison_count > 0 and (pass_count / comparison_count) < 0.9:
        print(f"\n🔴 L1 pass-rate {pass_count}/{comparison_count}="
              f"{pass_count / comparison_count:.0%} < 90% gate(HOLD 過多)— prompt 改動可能劣化、需 review")
        exit_code = 1
    if exit_code:
        sys.exit(exit_code)


if __name__ == '__main__':
    main()
