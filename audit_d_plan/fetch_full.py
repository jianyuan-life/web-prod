#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""直接從 Supabase REST API 拉 3 份報告全文，存入 full_reports/"""
import os, sys, io, json, urllib.request
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from pathlib import Path
for p in [Path.home() / '.claude' / '.env',
          Path(__file__).parent.parent / '.env.local']:
    if p.exists():
        for line in p.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if '=' in line and not line.startswith('#'):
                k,v = line.split('=',1)
                v = v.strip().strip('"').strip("'")
                os.environ.setdefault(k.strip(), v)

URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_KEY')
print('URL:', URL, 'KEY set:', bool(KEY))

IDS = {
    'f6c38b65': 'f6c38b65-0bd4-4866-988e-fa7ee73940c3',
    '69c40749': '69c40749-c905-4092-9846-8c9286f60324',
    'c57048dd': 'c57048dd-a36e-441f-a159-22dd10edb9eb',
}

OUT = Path(__file__).parent / 'full_reports'
OUT.mkdir(exist_ok=True)

for short, uuid in IDS.items():
    url = f"{URL}/rest/v1/paid_reports?id=eq.{uuid}&select=id,report_result,birth_data"
    req = urllib.request.Request(url, headers={
        'apikey': KEY, 'Authorization': f'Bearer {KEY}'
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode('utf-8'))
        if data:
            rr = data[0].get('report_result') or {}
            content = rr.get('ai_content','') if isinstance(rr, dict) else ''
            (OUT / f'{short}.md').write_text(content, encoding='utf-8')
            print(f'✓ {short} → {len(content)} 字')
        else:
            print(f'✗ {short} — no data')
    except Exception as e:
        print(f'✗ {short} — {e}')
