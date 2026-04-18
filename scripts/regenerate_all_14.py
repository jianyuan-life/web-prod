#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
cbe566@gmail.com 帳號內 14 份所有方案報告批次重生
等所有 agent 完成 UI+PDF+算法優化 + commit+push 後執行
"""
import sys, io, os, time, json, urllib.request
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
from pathlib import Path
for p in [Path.home() / '.claude/.env', Path(r'D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門\.env.local')]:
    if p.exists():
        for line in p.read_text(encoding='utf-8').splitlines():
            if '=' in line and not line.startswith('#'):
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))

SITE = 'https://jianyuan.life'
ADMIN_KEY = os.environ['ADMIN_KEY']
TG_TOKEN = os.environ['TELEGRAM_BOT_TOKEN']
TG_CHAT = int(os.environ['TELEGRAM_CHAT_ID'])
SUPA = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SERVICE = os.environ['SUPABASE_SERVICE_ROLE_KEY']

# 14 份完整清單（按方案分組）
ALL_REPORTS = [
    # C 方案 × 3
    ('644b4c09-c545-41e5-ac25-23ba2e45faa0', 'C', '何宣逸',             '0dad175e-3d10-4a39-9173-9112bc5919a9'),
    ('45ae2b9b-9709-42ae-8d17-c0cf6c10c01f', 'C', '何宥諄',             '2ecb8984-f363-4cd1-a4f8-b2a8400c87e5'),
    ('29bff605-43f2-4b9a-a7fd-1e614dfb4de3', 'C', '何紀萳',             'eea11502-9792-455f-8acd-a7b1ae9005f1'),
    # D 方案 × 3
    ('02e2049d-ab98-4277-940c-b4c7e90e8c04', 'D', '何宣逸 4/12',         '4e636025-770f-4bc1-9f13-4baa9b00f740'),
    ('c57048dd-a36e-441f-a159-22dd10edb9eb', 'D', '何宣逸 4/11',         'f946dc13-54cd-4c68-aaa4-ef828ab272b8'),
    ('a41a21e8-b25e-4396-a389-15158e65421f', 'D', '何宥諄',             '023636ff-282d-4eb6-9166-c69e20e65c03'),
    # E1 × 1
    ('a0f0f9f2-de08-4275-b8db-55a6c9151f71', 'E1','何宣逸 事件出門訣',   '465304a6-b727-4040-b4c0-a4fd71845a26'),
    # E2 × 3
    ('eb539df6-0859-40d7-85cb-fe8854d7b33c', 'E2','何紀萳 月盤',         '1f8a9c73-7f8d-43b9-bfcf-7eb44922a67e'),
    ('b2a097f8-663f-4382-aa06-abc66750548d', 'E2','何宣逸 月盤',         'c0e46d61-9ac3-4e21-bf6c-7b3cac65293d'),
    ('f64e9b28-6788-4395-adbf-e9225b7bbef9', 'E2','何宣逸Jamie 月盤',   'aa3f1df1-95aa-4025-b523-4be15af43f0d'),
    # G15 × 1
    ('3fae4087-d82e-48ce-9385-a53f4d166623', 'G15','何家族(3人)',        '238552b6-835e-4c84-82f3-19efdede8c2b'),
    # R × 3
    ('14a0cade-0574-4416-ae18-3f8c670c7edc', 'R', '何宣逸 × 林沅霖',     '5a169d8c-9b0e-4fee-a66d-2646f693b26f'),
    ('e11ad178-22e1-4a5f-8654-61a49df12378', 'R', '何紀萳 × 何宣逸',     'e98f457f-a1e7-4c62-ba73-ef180b96ea78'),
    ('c899a986-fe97-46ef-b218-7663003229fe', 'R', '何紀萳 × 何宥諄',     '4beafc84-8956-4754-90b7-167b2d172925'),
]


def tg(text):
    body = json.dumps({'chat_id': TG_CHAT, 'text': text, 'parse_mode': 'HTML', 'disable_web_page_preview': True}).encode()
    req = urllib.request.Request(f'https://api.telegram.org/bot{TG_TOKEN}/sendMessage',
        data=body, headers={'Content-Type': 'application/json'}, method='POST')
    try: urllib.request.urlopen(req, timeout=10)
    except Exception as e: print(f'TG: {e}')


def check_status(report_id):
    url = f'{SUPA}/rest/v1/paid_reports?id=eq.{report_id}&select=status,error_message,report_result,generation_progress'
    req = urllib.request.Request(url, headers={'apikey': SERVICE, 'Authorization': f'Bearer {SERVICE}'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            rows = json.loads(r.read().decode())
            return rows[0] if rows else None
    except Exception: return None


def trigger_regenerate(report_id, name):
    body = json.dumps({'reportId': report_id, 'force': True, 'reason': f'v5.3.X 全量重生 - {name}'}).encode()
    req = urllib.request.Request(f'{SITE}/api/admin/recalculate-report',
        data=body,
        headers={'Content-Type': 'application/json', 'x-admin-key': ADMIN_KEY},
        method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {'error': f'HTTP {e.code}: {e.read().decode()[:200]}'}
    except Exception as e:
        return {'error': str(e)}


def main():
    tg(f'''🚀 <b>14 份報告全量重生啟動</b>

cbe566@gmail.com 帳號內所有方案重新生成（用 v5.3.X 起承轉合+優化版）

分布：
• C 人生藍圖 × 3
• D 心之所惑 × 3
• E1 事件出門訣 × 1
• E2 月度出門訣 × 3
• G15 家族藍圖 × 1
• R 合否？× 3

每份間隔 30 秒避免塞爆。
完成預計 2-3 小時（每份 ~10-15 分鐘 × 串行）。''')

    triggered = 0
    for i, (rid, plan, name, token) in enumerate(ALL_REPORTS, 1):
        print(f'\n[{i}/14] {plan} {name}')
        # 已 pending/generating 的先跳過重觸發
        status_row = check_status(rid)
        if status_row and status_row['status'] in ('pending', 'generating'):
            print(f'  → 已在 {status_row["status"]}，跳過觸發')
            triggered += 1
            continue

        resp = trigger_regenerate(rid, name)
        if resp.get('triggered') or resp.get('ok'):
            print(f'  → OK')
            triggered += 1
        else:
            print(f'  → FAIL: {resp}')
            tg(f'⚠️ {plan} {name} 觸發失敗：{str(resp)[:200]}')
        time.sleep(30)  # 分批防爆

    tg(f'✅ <b>{triggered}/14 份觸發成功</b>，開始輪詢...')

    # 輪詢等完成
    done = {}
    t0 = time.time()
    while time.time() - t0 < 10800:  # 3 小時上限
        all_done = True
        for rid, plan, name, token in ALL_REPORTS:
            if rid in done: continue
            row = check_status(rid)
            if not row:
                all_done = False
                continue
            s = row['status']
            if s == 'completed':
                done[rid] = 'ok'
                content = (row.get('report_result') or {}).get('ai_content', '')
                tg(f'''✅ <b>[{plan}] {name}</b> 重生完成（{len(content)} 字）
🔗 {SITE}/report/{token}''')
            elif s == 'failed':
                done[rid] = 'failed'
                tg(f'❌ [{plan}] {name} 失敗：{row.get("error_message", "")[:200]}')
            else:
                all_done = False
        if all_done or len(done) == len(ALL_REPORTS):
            break
        time.sleep(60)

    # 總結
    ok = sum(1 for v in done.values() if v == 'ok')
    summary = f'🏁 <b>14 份報告重生總結：{ok}/14 成功</b>\n\n'
    for rid, plan, name, token in ALL_REPORTS:
        st = done.get(rid, 'timeout')
        icon = '✅' if st == 'ok' else '❌'
        summary += f'{icon} [{plan}] {name}\n'
        if st == 'ok':
            summary += f'   → {SITE}/report/{token}\n'
        else:
            summary += f'   → {st}\n'
    summary += '\n老闆點連結逐一檢查 🙏'
    tg(summary)


if __name__ == '__main__':
    main()
