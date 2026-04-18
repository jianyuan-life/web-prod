#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""從 Supabase REST API 直接抓 G15 歷史報告存為本地檔案"""
import os
import json
import urllib.request
import urllib.error
from pathlib import Path

ENV_PATH = Path.home() / '.claude' / '.env'
if ENV_PATH.exists():
    for line in ENV_PATH.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.environ.get('SUPABASE_URL') or os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY')

if not SUPABASE_URL or not SERVICE_KEY:
    # Try to load from web project .env.local
    env_local = Path(__file__).parent.parent / '.env.local'
    if env_local.exists():
        for line in env_local.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k in ('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'):
                    SUPABASE_URL = v
                if k == 'SUPABASE_SERVICE_ROLE_KEY':
                    SERVICE_KEY = v

print(f"SUPABASE_URL: {SUPABASE_URL[:40] if SUPABASE_URL else 'NONE'}")
print(f"KEY: {'SET' if SERVICE_KEY else 'MISSING'}")

if not (SUPABASE_URL and SERVICE_KEY):
    print("No credentials found - will skip")
    import sys
    sys.exit(0)

SAMPLES = [
    ('59c3fa24-0f17-4eaf-ad1d-22bae6844c14', 'sample1_content.txt'),
    ('e32b9172-b61d-4c5b-851b-380beab0ead4', 'sample2_content.txt'),
]

AUDIT_DIR = Path(__file__).parent

for report_id, filename in SAMPLES:
    url = f"{SUPABASE_URL}/rest/v1/paid_reports?id=eq.{report_id}&select=report_result"
    req = urllib.request.Request(url, headers={
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        if data and data[0].get('report_result', {}).get('ai_content'):
            content = data[0]['report_result']['ai_content']
            out = AUDIT_DIR / filename
            out.write_text(content, encoding='utf-8')
            print(f"OK {filename}: {len(content)} chars")
        else:
            print(f"MISS {report_id}: no ai_content")
    except Exception as e:
        print(f"ERR {report_id}: {e}")
