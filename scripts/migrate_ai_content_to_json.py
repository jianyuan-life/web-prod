#!/usr/bin/env python3
"""
Sprint 2.x Phase 1: LLM Extraction Migration(既有 paid_reports 從 markdown → JSON)

用 claude-3.5-haiku 把 paid_reports.report_result.ai_content(markdown)萃取成 LifeBlueprintReport JSON schema、
存到 paid_reports.report_result_json、parse_status、schema_version

用法:
    # Dry-run(僅顯示要處理的 rows、不寫 DB、不呼叫 API)
    python migrate_ai_content_to_json.py --dry-run

    # 抽驗 1 row(隨機選 1 個、寫到 DB、給人類目視驗證)
    python migrate_ai_content_to_json.py --sample 1

    # 全部跑(預估 ~$2 USD)
    python migrate_ai_content_to_json.py --all

環境變數(從 .env.local 載入):
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    ANTHROPIC_API_KEY
"""

import os
import sys
import json
import argparse
import time
from typing import Optional

try:
    from supabase import create_client
except ImportError:
    print("ERROR: supabase-py 未安裝。執行: pip install supabase anthropic python-dotenv", file=sys.stderr)
    sys.exit(1)

try:
    from anthropic import Anthropic
except ImportError:
    print("ERROR: anthropic 未安裝。執行: pip install anthropic", file=sys.stderr)
    sys.exit(1)

try:
    from dotenv import load_dotenv
    # 嘗試多個 .env 位置(Next.js 慣例)
    for env_path in ['.env.local', '.env', '../.env.local', '../.env']:
        if os.path.exists(env_path):
            load_dotenv(env_path)
            print(f"[init] 載入 env: {env_path}")
            break
except ImportError:
    pass

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
# 鑑源用 CLAUDE_API_KEY(or CLAUDE_API_KEY_N rotation)、不是 ANTHROPIC_API_KEY
ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")

if not all([SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_KEY]):
    print("ERROR: 缺環境變數 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ANTHROPIC_API_KEY", file=sys.stderr)
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
anthropic = Anthropic(api_key=ANTHROPIC_KEY)

SCHEMA_VERSION = "v5.10.292-multi-plan-mvp"

# v5.10.292:多 plan 共用 generic metadata extraction
# C/D/E1/E2/E3/G15/R 各自的 full schema 留 Phase 4+、本 MVP 只抽 4 個共用 high-value fields
EXTRACTION_PROMPT_GENERIC = """你是專業資料萃取器。把以下 markdown 命理報告嚴格按 JSON schema 萃取成結構化資料、不改原文語氣、不重新批算、不憑空產生資訊。

要求:
1. **不改原文預測內容**:client 已付費購買、內容是 final、你只重新組織格式
2. **缺資訊填 null**:不要編造、不要 fallback、不要套通用模板
3. **嚴格只輸出 JSON**:不加任何說明、不加 ```json 標記、output 必為純 JSON

通用 schema(全 plan 共用、抽 4 個 high-value fields):

```json
{
  "meta": {
    "name": "string | null - 客戶姓名(若 R/G15 多人合盤、用主訴者或家族名)",
    "planType": "string | null - 報告類型(C/D/E1/E2/E3/G15/R 之一、看文末/標題判斷)",
    "members": ["string"] - "R/G15 多人時、列所有成員姓名;C/D 單人填 [name];出門訣 E1-E3 填 []"
  },
  "oneLiner": "string | null - 報告最核心一句話(從主標題 / 命格名片 / 結語提、< 50 字)",
  "topInsights": [
    "string - 最重要 3 個洞察 / 建議(各 < 80 字、優先選具體可行的)"
  ],
  "luckyOrTimingParams": {
    "colors": ["string"],
    "numbers": ["number"],
    "directions": ["string"],
    "best_times": ["string"] - "出門訣 E1-E3 用、其他 plan 可空"
  }
}
```

Markdown 報告(plan_code: {plan_code}):
---
{ai_content}
---

直接輸出 JSON、不要任何前後說明文字。
"""

# C 方案保留原 prompt(已 ship 32 row、format 不改、後續若要重 extract 用此)
EXTRACTION_PROMPT_C_LEGACY = """[v5.10.290 C 專屬、已 ship 32 row、本 commit 不重跑、保留作 reference]"""


def get_pending_rows(limit: Optional[int] = None, plan_codes: Optional[list] = None):
    """取得待處理 rows(plan_code in [...] AND report_result_json IS NULL)
    v5.10.292:加 plan_codes 參數、預設全 plan(原本只 C)
    """
    query = (
        supabase.table('paid_reports')
        .select('id, plan_code, client_name, customer_email, report_result, created_at')
        .eq('status', 'completed')
        .is_('report_result_json', 'null')
        .is_('deleted_at', 'null')
        .order('created_at', desc=False)
    )
    if plan_codes:
        query = query.in_('plan_code', plan_codes)
    if limit:
        query = query.limit(limit)
    res = query.execute()
    return res.data or []


def extract_one(row: dict) -> dict:
    """跑一個 row 的 extraction、回傳 {status, json_data, error}
    v5.10.292:依 plan_code 選 prompt
    """
    report_id = row['id']
    plan_code = row.get('plan_code', 'unknown')
    ai_content = (row.get('report_result') or {}).get('ai_content', '')

    if not ai_content or len(ai_content) < 500:
        return {
            'report_id': report_id,
            'status': 'failed',
            'json_data': None,
            'error': f'ai_content 太短 ({len(ai_content)} 字、< 500)',
        }

    # 截斷過長 markdown(haiku 限制)
    ai_content_truncated = ai_content[:25000] if len(ai_content) > 25000 else ai_content

    # v5.10.292:全 plan 用 generic prompt(C 已 ship 32 row、D/E/G15/R 用此 prompt MVP)
    prompt = EXTRACTION_PROMPT_GENERIC.replace('{ai_content}', ai_content_truncated).replace('{plan_code}', plan_code)

    try:
        response = anthropic.messages.create(
            model='claude-haiku-4-5',
            max_tokens=4096,
            messages=[{'role': 'user', 'content': prompt}],
        )
        raw_output = response.content[0].text.strip()
        # 移除可能的 ```json wrapper
        if raw_output.startswith('```'):
            raw_output = raw_output.split('\n', 1)[1] if '\n' in raw_output else raw_output
            raw_output = raw_output.rsplit('```', 1)[0].strip()

        json_data = json.loads(raw_output)

        # v5.10.292 generic schema validation:meta + oneLiner + topInsights + luckyOrTimingParams 4 fields
        # 至少 2 fields 有值 → partial、3+ → full
        field_count = sum([
            bool(json_data.get('meta', {}).get('name')),
            bool(json_data.get('oneLiner')),
            bool(json_data.get('topInsights') and len(json_data.get('topInsights', [])) > 0),
            bool(json_data.get('luckyOrTimingParams', {}).get('colors')
                or json_data.get('luckyOrTimingParams', {}).get('numbers')
                or json_data.get('luckyOrTimingParams', {}).get('best_times')),
        ])

        if field_count >= 3:
            status = 'full'
        elif field_count >= 2:
            status = 'partial'
        else:
            status = 'failed'

        return {
            'report_id': report_id,
            'status': status,
            'json_data': json_data,
            'top5_extracted': field_count,
            'tokens_used': response.usage.input_tokens + response.usage.output_tokens,
        }
    except json.JSONDecodeError as e:
        return {
            'report_id': report_id,
            'status': 'failed',
            'json_data': None,
            'error': f'JSON parse 失敗: {e}',
        }
    except Exception as e:
        return {
            'report_id': report_id,
            'status': 'failed',
            'json_data': None,
            'error': f'LLM call 失敗: {e}',
        }


def write_result(report_id: str, result: dict):
    """把萃取結果寫回 paid_reports"""
    supabase.table('paid_reports').update({
        'report_result_json': result['json_data'],
        'parse_status': result['status'],
        'schema_version': SCHEMA_VERSION,
    }).eq('id', report_id).is_('deleted_at', 'null').execute()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='不寫 DB、僅顯示 pending rows')
    parser.add_argument('--sample', type=int, default=0, help='只跑 N 個 row(抽驗用)')
    parser.add_argument('--all', action='store_true', help='全部跑(預估 ~$2)')
    parser.add_argument('--plans', type=str, default='D,E1,E2,E3,G15,R',
                        help='逗號分隔 plan_code、預設 D/E1/E2/E3/G15/R(C 已 ship)')
    args = parser.parse_args()

    if not (args.dry_run or args.sample or args.all):
        parser.print_help()
        sys.exit(1)

    plan_codes = [p.strip() for p in args.plans.split(',') if p.strip()]
    print(f"[main] plans: {plan_codes}")
    pending = get_pending_rows(limit=args.sample if args.sample else None, plan_codes=plan_codes)
    print(f"[main] pending rows: {len(pending)}")

    if args.dry_run:
        for r in pending[:5]:
            print(f"  - {r['id']} | {r['client_name']} | {r['created_at']}")
        print(f"  ...(total {len(pending)})")
        sys.exit(0)

    total_tokens = 0
    stats = {'full': 0, 'partial': 0, 'failed': 0}

    for i, row in enumerate(pending):
        print(f"\n[{i+1}/{len(pending)}] {row['id']} ({row['client_name']})")
        result = extract_one(row)
        print(f"  status: {result['status']}", end='')
        if result.get('top5_extracted') is not None:
            print(f" | top5_extracted={result['top5_extracted']}/5", end='')
        if result.get('tokens_used'):
            total_tokens += result['tokens_used']
            print(f" | tokens={result['tokens_used']}", end='')
        if result.get('error'):
            print(f"\n  error: {result['error']}")
        else:
            print()

        stats[result['status']] = stats.get(result['status'], 0) + 1

        # 寫回 DB
        if result['json_data'] is not None:
            write_result(row['id'], result)
            try:
                print(f"  [OK] written to DB")  # ASCII only for Windows GBK console
            except UnicodeEncodeError:
                pass

        # rate limit:Haiku 每分鐘 50 req(保守)
        if i < len(pending) - 1:
            time.sleep(1.5)

    print(f"\n=== summary ===")
    print(f"  total: {len(pending)}")
    print(f"  full: {stats.get('full', 0)}")
    print(f"  partial: {stats.get('partial', 0)}")
    print(f"  failed: {stats.get('failed', 0)}")
    print(f"  total tokens: {total_tokens}")
    print(f"  est cost: ${total_tokens / 1_000_000 * 0.80:.4f} USD(Haiku $0.80/M blended)")


if __name__ == '__main__':
    main()
