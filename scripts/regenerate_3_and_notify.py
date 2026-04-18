#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
v5.3.0 三客戶 C 方案重生 + Telegram 推播
流程：等 Vercel 部署 v5.3.0 → 呼叫 admin recalculate API → 輪詢完成 → 推 TG
"""
import sys, io, os, time, urllib.request, json, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from pathlib import Path
for line in (Path.home() / '.claude/.env').read_text(encoding='utf-8').splitlines():
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        os.environ[k.strip()] = v.strip()
# 從 .env.local 再補 ADMIN_KEY 等
env_local = Path(r'D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\.env.local')
if env_local.exists():
    for line in env_local.read_text(encoding='utf-8').splitlines():
        if '=' in line and not line.startswith('#'):
            k, v = line.split('=', 1)
            os.environ[k.strip()] = v.strip().strip('"')

SITE = 'https://jianyuan.life'
ADMIN_KEY = os.environ.get('ADMIN_KEY', '')
TG_TOKEN = os.environ['TELEGRAM_BOT_TOKEN']
TG_CHAT = int(os.environ['TELEGRAM_CHAT_ID'])

# 3 位客戶的 report ID
REPORTS = [
    ('644b4c09-c545-41e5-ac25-23ba2e45faa0', '何宣逸', '1990-10-12 20:00 男', '0dad175e-3d10-4a39-9173-9112bc5919a9'),
    ('45ae2b9b-9709-42ae-8d17-c0cf6c10c01f', '何宥諄', '2023-05-08 10:00 男', '2ecb8984-f363-4cd1-a4f8-b2a8400c87e5'),
    ('29bff605-43f2-4b9a-a7fd-1e614dfb4de3', '何紀萳', '1994-10-04 08:00 女', 'eea11502-9792-455f-8acd-a7b1ae9005f1'),
]


def tg_notify(text: str):
    body = json.dumps({'chat_id': TG_CHAT, 'text': text, 'parse_mode': 'HTML', 'disable_web_page_preview': True}).encode()
    req = urllib.request.Request(f'https://api.telegram.org/bot{TG_TOKEN}/sendMessage',
        data=body, headers={'Content-Type': 'application/json'}, method='POST')
    try:
        urllib.request.urlopen(req, timeout=10)
        return True
    except Exception as e:
        print(f'TG fail: {e}')
        return False


def wait_vercel_deploy(target='v5.3.0', max_wait=600):
    """輪詢首頁 Footer，等 v5.3.0 上線"""
    print(f'等待 Vercel 部署 {target}...')
    t0 = time.time()
    while time.time() - t0 < max_wait:
        try:
            req = urllib.request.Request(f'{SITE}/?nocache={int(time.time())}',
                headers={'Cache-Control': 'no-cache', 'User-Agent': 'regen-monitor/1.0'})
            with urllib.request.urlopen(req, timeout=20) as r:
                html = r.read().decode('utf-8', errors='ignore')
                m = re.search(r'v(\d+\.\d+\.\d+)', html)
                if m:
                    cur = m.group(1)
                    print(f'  目前版本：v{cur}')
                    if cur == target.lstrip('v'):
                        return True
        except Exception as e:
            print(f'  檢查失敗：{e}')
        time.sleep(15)
    return False


def trigger_recalculate(report_id: str, name: str):
    body = json.dumps({'reportId': report_id, 'force': True, 'reason': 'v5.3.0 起承轉合 15 章重生'}).encode()
    req = urllib.request.Request(f'{SITE}/api/admin/recalculate-report',
        data=body,
        headers={'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY},
        method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return True, r.read().decode()
    except urllib.error.HTTPError as e:
        return False, f'HTTP {e.code}: {e.read().decode()[:300]}'
    except Exception as e:
        return False, str(e)


def wait_report_complete(report_id: str, max_wait=1800):
    """輪詢 Supabase 等 report status 變 completed"""
    from urllib.parse import quote
    SUPA_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL', '')
    SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not SUPA_URL or not SERVICE_KEY:
        return None
    t0 = time.time()
    while time.time() - t0 < max_wait:
        url = f'{SUPA_URL}/rest/v1/paid_reports?id=eq.{report_id}&select=status,error_message,updated_at'
        req = urllib.request.Request(url, headers={
            'apikey': SERVICE_KEY,
            'Authorization': f'Bearer {SERVICE_KEY}',
        })
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read().decode())
                if data:
                    row = data[0]
                    status = row.get('status')
                    if status == 'completed':
                        return 'completed'
                    if status == 'failed':
                        return f"failed: {row.get('error_message', '')[:200]}"
        except Exception:
            pass
        time.sleep(30)
    return 'timeout'


def main():
    # Step 1: 等 Vercel
    if not wait_vercel_deploy('v5.3.0', max_wait=600):
        tg_notify('⚠️ Vercel 部署 v5.3.0 超過 10 分鐘未完成，繼續執行重生（用現有版本）')
    else:
        tg_notify('✅ Vercel v5.3.0 部署確認。開始 3 客戶 C 方案重生。')

    # Step 2: 觸發 3 份重生
    tg_notify('🔄 <b>3 客戶 C 方案重生啟動</b>\n\n'
              '• 何宣逸 1990-10-12 20:00 男\n'
              '• 何宥諄 2023-05-08 10:00 男\n'
              '• 何紀萳 1994-10-04 08:00 女\n\n'
              '使用新版 prompt：起承轉合 15 章\n'
              '每份預計 3-8 分鐘')

    triggered = []
    for rid, name, birth, token in REPORTS:
        print(f'\n[{name}] 觸發重生 {rid}')
        ok, msg = trigger_recalculate(rid, name)
        print(f'  {"OK" if ok else "FAIL"}: {msg[:200]}')
        if ok:
            triggered.append((rid, name, birth, token))
        time.sleep(3)

    if not triggered:
        tg_notify('❌ 3 份重生全部觸發失敗，請檢查 ADMIN_KEY 或 API 路徑')
        return

    tg_notify(f'✅ 已觸發 {len(triggered)}/3 份重生，輪詢等待完成...')

    # Step 3: 輪詢等完成
    results = []
    for rid, name, birth, token in triggered:
        print(f'\n[{name}] 輪詢 {rid}...')
        result = wait_report_complete(rid, max_wait=1200)
        report_link = f'{SITE}/report/{token}'
        results.append((name, birth, result, report_link))
        print(f'  → {result}')
        # 每份完成即推一次
        if result == 'completed':
            tg_notify(f'✅ <b>{name}</b> 報告重生完成\n'
                      f'生辰：{birth}\n'
                      f'連結：{report_link}')
        else:
            tg_notify(f'❌ <b>{name}</b> 重生失敗：{result}\n'
                      f'報告 ID：{rid}')

    # Step 4: 總結
    ok_count = sum(1 for _, _, r, _ in results if r == 'completed')
    summary = f'🏁 <b>3 客戶重生總結</b>\n\n成功：{ok_count}/3\n\n'
    for name, birth, result, link in results:
        status = '✅' if result == 'completed' else '❌'
        summary += f'{status} {name}（{birth}）\n'
        if result == 'completed':
            summary += f'   → {link}\n'
        else:
            summary += f'   → {result}\n'
    summary += '\n老闆點連結檢查報告品質 🙏'
    tg_notify(summary)


if __name__ == '__main__':
    main()
