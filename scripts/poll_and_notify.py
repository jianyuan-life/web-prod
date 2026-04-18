#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""輪詢 3 客戶重生完成狀態 + Telegram 推播"""
import sys, io, os, time, urllib.request, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from pathlib import Path
for line in (Path.home() / '.claude/.env').read_text(encoding='utf-8').splitlines():
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        os.environ[k.strip()] = v.strip()
env_local = Path(r'D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\.env.local')
if env_local.exists():
    for line in env_local.read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"'))

TG_TOKEN = os.environ['TELEGRAM_BOT_TOKEN']
TG_CHAT = int(os.environ['TELEGRAM_CHAT_ID'])
SUPA_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SERVICE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
SITE = 'https://jianyuan.life'

REPORTS = [
    ('644b4c09-c545-41e5-ac25-23ba2e45faa0', '何宣逸', '1990-10-12 20:00 男', '0dad175e-3d10-4a39-9173-9112bc5919a9'),
    ('45ae2b9b-9709-42ae-8d17-c0cf6c10c01f', '何宥諄', '2023-05-08 10:00 男', '2ecb8984-f363-4cd1-a4f8-b2a8400c87e5'),
    ('29bff605-43f2-4b9a-a7fd-1e614dfb4de3', '何紀萳', '1994-10-04 08:00 女', 'eea11502-9792-455f-8acd-a7b1ae9005f1'),
]


def tg(text):
    body = json.dumps({'chat_id': TG_CHAT, 'text': text, 'parse_mode': 'HTML', 'disable_web_page_preview': True}).encode()
    req = urllib.request.Request(f'https://api.telegram.org/bot{TG_TOKEN}/sendMessage',
        data=body, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f'TG fail: {e}')


def check_status(report_id):
    url = f'{SUPA_URL}/rest/v1/paid_reports?id=eq.{report_id}&select=status,error_message,retry_count'
    req = urllib.request.Request(url, headers={
        'apikey': SERVICE_KEY,
        'Authorization': f'Bearer {SERVICE_KEY}',
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode())
            if data:
                return data[0]
    except Exception as e:
        print(f'check fail: {e}')
    return None


def main():
    t0 = time.time()
    done = {}
    notified_done = set()
    while time.time() - t0 < 2400:  # 40 分鐘上限
        all_done = True
        for rid, name, birth, token in REPORTS:
            if rid in notified_done:
                continue
            row = check_status(rid)
            if not row:
                all_done = False
                continue
            status = row.get('status')
            if status == 'completed':
                done[rid] = 'completed'
                notified_done.add(rid)
                tg(f'''✅ <b>{name}</b> 報告重生完成
生辰：{birth}
連結：{SITE}/report/{token}

下載 PDF / 看完整報告就點連結 ↑''')
            elif status == 'failed':
                done[rid] = f"failed: {row.get('error_message', '')[:200]}"
                notified_done.add(rid)
                tg(f'''❌ <b>{name}</b> 重生失敗
生辰：{birth}
原因：{row.get('error_message', 'unknown')[:200]}
報告 ID：{rid}''')
            else:
                all_done = False
                print(f'[{name}] status={status}')
        if all_done or len(done) == len(REPORTS):
            break
        time.sleep(20)

    # 總結
    ok_count = sum(1 for v in done.values() if v == 'completed')
    summary = f'🏁 <b>3 客戶重生總結</b>\n\n✅ 成功：{ok_count}/3\n\n'
    for rid, name, birth, token in REPORTS:
        status = done.get(rid, 'timeout')
        icon = '✅' if status == 'completed' else '❌'
        summary += f'{icon} {name}（{birth}）\n'
        if status == 'completed':
            summary += f'   → {SITE}/report/{token}\n'
        else:
            summary += f'   → {status[:100]}\n'
    summary += '\n老闆點連結檢查報告品質 🙏'
    tg(summary)


if __name__ == '__main__':
    main()
