#!/usr/bin/env python3
"""
P0 Bug 批次修復腳本（2026-04-17）
================================

修復範圍：
  1) E1/E2 報告 pdf_url = NULL   → 呼叫 Python /generate-pdf 重生 PDF + 上傳 Supabase Storage
  2) R  報告 ai_content 含「026」 → sed 式替換 DB 內容（避免完整重跑 AI）
  3) 全報告 ai_content 含 Markdown # 殘留 → 清理
  4) 全報告 ai_content 含超範圍分數（>100）→ clamp 到 0-100

使用方式：
  # 只預覽不寫 DB
  python3 scripts/batch_fix_p0_reports.py --dry-run

  # 實際執行
  python3 scripts/batch_fix_p0_reports.py --apply

  # 單獨跑某類修復
  python3 scripts/batch_fix_p0_reports.py --apply --only pdf
  python3 scripts/batch_fix_p0_reports.py --apply --only content

依賴：
  - 環境變數 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
  - 環境變數 PYTHON_API（預設 https://fortune-reports-api.fly.dev）
"""
from __future__ import annotations

import argparse
import base64
import os
import re
import sys
import time
from typing import Any, Dict, List, Optional

import requests

# ============================================================
# 設定
# ============================================================

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
PYTHON_API = os.environ.get('PYTHON_API') or 'https://fortune-reports-api.fly.dev'

if not SUPABASE_URL or not SUPABASE_KEY:
    print('✗ 缺少環境變數 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY', file=sys.stderr)
    sys.exit(1)

HDR = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
}

PLAN_NAMES = {
    'C': '人生藍圖',
    'D': '心之所惑',
    'G15': '家族藍圖',
    'R': '合否？',
    'E1': '事件出門訣',
    'E2': '月度出門訣',
}

GANZHI_YEARS = [
    '甲子', '乙丑', '丙寅', '丁卯', '戊辰', '己巳', '庚午', '辛未', '壬申', '癸酉',
    '甲戌', '乙亥', '丙子', '丁丑', '戊寅', '己卯', '庚辰', '辛巳', '壬午', '癸未',
    '甲申', '乙酉', '丙戌', '丁亥', '戊子', '己丑', '庚寅', '辛卯', '壬辰', '癸巳',
    '甲午', '乙未', '丙申', '丁酉', '戊戌', '己亥', '庚子', '辛丑', '壬寅', '癸卯',
    '甲辰', '乙巳', '丙午', '丁未', '戊申', '己酉', '庚戌', '辛亥', '壬子', '癸丑',
    '甲寅', '乙卯', '丙辰', '丁巳', '戊午', '己未', '庚申', '辛酉', '壬戌', '癸亥',
]
GANZHI_RE = '|'.join(GANZHI_YEARS)


# ============================================================
# 工具
# ============================================================

def fetch_reports(status_filter: str = 'completed') -> List[Dict[str, Any]]:
    """取得所有 completed 報告"""
    url = f'{SUPABASE_URL}/rest/v1/paid_reports'
    params = {
        'status': f'eq.{status_filter}',
        'select': 'id,plan_code,client_name,pdf_url,report_result,birth_data,created_at',
        'order': 'created_at.desc',
        'limit': '500',
    }
    r = requests.get(url, headers=HDR, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def update_report(report_id: str, patch: Dict[str, Any]) -> None:
    url = f'{SUPABASE_URL}/rest/v1/paid_reports'
    params = {'id': f'eq.{report_id}'}
    r = requests.patch(url, headers=HDR, params=params, json=patch, timeout=30)
    r.raise_for_status()


def upload_pdf_to_storage(report_id: str, pdf_bytes: bytes) -> Optional[str]:
    """上傳 PDF 到 Supabase Storage reports bucket，回傳 public URL"""
    path = f'{report_id}/report.pdf'
    url = f'{SUPABASE_URL}/storage/v1/object/reports/{path}'
    hdr = dict(HDR)
    hdr['Content-Type'] = 'application/pdf'
    hdr['x-upsert'] = 'true'
    r = requests.post(url, headers=hdr, data=pdf_bytes, timeout=60)
    if not r.ok:
        # 存在時改用 PUT
        r = requests.put(url, headers=hdr, data=pdf_bytes, timeout=60)
    if not r.ok:
        print(f'  ✗ Storage 上傳失敗: {r.status_code} {r.text[:200]}')
        return None
    return f'{SUPABASE_URL}/storage/v1/object/public/reports/{path}'


# ============================================================
# P0-1：E1/E2 PDF 重生
# ============================================================

def fix_missing_pdfs(reports: List[Dict[str, Any]], apply: bool) -> Dict[str, int]:
    """為 E1/E2 且 pdf_url = NULL 的報告重生 PDF"""
    stats = {'total': 0, 'succeeded': 0, 'failed': 0}

    for rpt in reports:
        if rpt['plan_code'] not in ('E1', 'E2'):
            continue
        if rpt.get('pdf_url'):
            continue
        ai_content = (rpt.get('report_result') or {}).get('ai_content') or ''
        if len(ai_content) < 200:
            # 內容過短，可能是失敗報告，跳過
            continue

        stats['total'] += 1
        plan_code = rpt['plan_code']
        plan_name = PLAN_NAMES.get(plan_code, '命理分析報告')
        client_name = rpt.get('client_name') or 'Unknown'
        print(f'\n[{stats["total"]}] {plan_code} | {client_name} | report_id={rpt["id"]}')

        if not apply:
            print('  (dry-run：跳過呼叫 PDF API)')
            continue

        # 呼叫 /api/generate-pdf
        payload = {
            'report_id': rpt['id'],
            'plan_code': plan_code,
            'client_name': client_name,
            'plan_name': plan_name,
            'ai_content': ai_content,
            'analyses_summary': (rpt.get('report_result') or {}).get('analyses_summary') or [],
            'locale': (rpt.get('birth_data') or {}).get('locale') or 'zh-TW',
            'show_header_footer': True,
            'show_toc_page': True,
            'cover_style': 'compact',
        }
        try:
            resp = requests.post(f'{PYTHON_API}/api/generate-pdf', json=payload, timeout=120)
            if not resp.ok:
                print(f'  ✗ PDF API 失敗: {resp.status_code} {resp.text[:200]}')
                stats['failed'] += 1
                continue
            data = resp.json()
            pdf_b64 = data.get('pdf_base64')
            if not pdf_b64:
                print('  ✗ PDF API 回應缺少 pdf_base64')
                stats['failed'] += 1
                continue
            pdf_bytes = base64.b64decode(pdf_b64)
            pdf_url = upload_pdf_to_storage(rpt['id'], pdf_bytes)
            if not pdf_url:
                stats['failed'] += 1
                continue
            update_report(rpt['id'], {'pdf_url': pdf_url})
            print(f'  ✓ PDF 上傳完成 ({data.get("file_size_kb")}KB)')
            stats['succeeded'] += 1
            time.sleep(1)
        except Exception as exc:
            print(f'  ✗ 例外: {exc}')
            stats['failed'] += 1

    return stats


# ============================================================
# P0-2/3/4：ai_content 內容清理
# ============================================================

def clean_ai_content(text: str) -> str:
    """套用 P0-2 / P0-3 / P0-4 修法"""
    if not text:
        return text

    # P0-2：年份 bug（甲子026-2028 → 甲子（2026-2028））
    text = re.sub(r'丙午\s*026\s*-\s*2028', '丙午（2026-2028）', text)
    text = re.sub(
        rf'({GANZHI_RE})(\d{{3}})(?=[-－]\s*\d{{4}})',
        lambda m: f'{m.group(1)}（2{m.group(2)}',
        text,
    )
    text = re.sub(r'（2(\d{3})-(\d{4})(?![）)])', r'（2\1-\2）', text)

    # P0-3：Markdown H1 殘留（行首 #）
    text = re.sub(r'^#\s+(.+?)$', r'\1', text, flags=re.MULTILINE)
    text = re.sub(r'^(##+)\s*#+\s*(.+?)$', r'\1 \2', text, flags=re.MULTILINE)

    # P0-4：分數超過 100 clamp
    def clamp_slash(m):
        n = max(0, min(100, int(m.group(1) or 0)))
        return f'{n}/100'

    def clamp_score(m):
        n = max(0, min(100, int(m.group(2) or 0)))
        return f'{m.group(1)}{n}'

    def clamp_bare(m):
        n = max(0, min(100, int(m.group(2) or 0)))
        return f'{m.group(1)}{n} 分'

    text = re.sub(r'(\d{1,4})\s*/\s*100', clamp_slash, text)
    text = re.sub(r'((?:綜合|整體|總|系統|本系統)?評分[：:]\s*)(\d{1,4})', clamp_score, text)
    text = re.sub(r'(\s|^)(\d{3,4})\s*分(?=[，。,.、；;！？\s])', clamp_bare, text)

    return text


def fix_content_issues(reports: List[Dict[str, Any]], apply: bool) -> Dict[str, int]:
    """清理 ai_content 中的「026」、# 殘留、超範圍分數"""
    stats = {'total': 0, 'changed': 0, 'year_fix': 0, 'hash_fix': 0, 'score_fix': 0}

    for rpt in reports:
        result = rpt.get('report_result') or {}
        original = result.get('ai_content') or ''
        if not original:
            continue

        stats['total'] += 1
        cleaned = clean_ai_content(original)
        if cleaned == original:
            continue

        # 統計各類型差異
        if re.search(rf'({GANZHI_RE})\s*\d{{3}}\s*-\s*\d{{4}}', original):
            stats['year_fix'] += 1
        if re.search(r'^#\s+', original, re.MULTILINE):
            stats['hash_fix'] += 1
        if re.search(r'\d{3,4}\s*(?:/\s*100|分)', original):
            stats['score_fix'] += 1

        stats['changed'] += 1
        print(
            f'  [{rpt["plan_code"]}] {rpt["client_name"]} '
            f'year={bool(re.search(rf"({GANZHI_RE})\\s*\\d{{3}}\\s*-", original))}, '
            f'hash={bool(re.search(r"^#\\s+", original, re.MULTILINE))}, '
            f'score={bool(re.search(r"\\d{3,4}\\s*(?:/\\s*100|分)", original))}, '
            f'{len(original)}→{len(cleaned)} 字'
        )

        if not apply:
            continue

        new_result = dict(result)
        new_result['ai_content'] = cleaned
        update_report(rpt['id'], {'report_result': new_result})

    return stats


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='實際寫入 DB 和上傳 PDF')
    parser.add_argument('--dry-run', action='store_true', help='只預覽不寫入（預設）')
    parser.add_argument(
        '--only',
        choices=['pdf', 'content', 'all'],
        default='all',
        help='只跑某類修復',
    )
    args = parser.parse_args()

    apply = bool(args.apply and not args.dry_run)
    print(f'=== P0 批次修復腳本（{"APPLY" if apply else "DRY-RUN"}）===')
    print(f'SUPABASE_URL = {SUPABASE_URL}')
    print(f'PYTHON_API   = {PYTHON_API}')
    print(f'--only       = {args.only}')
    print()

    print('→ 撈取所有 completed 報告...')
    reports = fetch_reports()
    print(f'  共 {len(reports)} 份報告')

    if args.only in ('pdf', 'all'):
        print('\n=== P0-1：E1/E2 PDF 重生 ===')
        pdf_stats = fix_missing_pdfs(reports, apply)
        print(f'\nPDF 統計：總 {pdf_stats["total"]}，成功 {pdf_stats["succeeded"]}，失敗 {pdf_stats["failed"]}')

    if args.only in ('content', 'all'):
        print('\n=== P0-2/3/4：ai_content 清理 ===')
        content_stats = fix_content_issues(reports, apply)
        print(
            f'\n內容統計：總 {content_stats["total"]}，'
            f'需改動 {content_stats["changed"]}，'
            f'年份修正 {content_stats["year_fix"]}，'
            f'# 殘留 {content_stats["hash_fix"]}，'
            f'超範圍分數 {content_stats["score_fix"]}'
        )

    if not apply:
        print('\n（dry-run，若要實際寫入 DB 請加 --apply）')


if __name__ == '__main__':
    main()
