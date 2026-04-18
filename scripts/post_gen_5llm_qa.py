#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
3 客戶 C 方案重生完成後，自動用 5 LLM 做品質評分
用完整的報告內容（起承轉合 15 章）餵 5 LLM 評分
任一 < 96 → TG 標紅要求老闆重點看
全部 ≥ 96 → TG 綠燈
"""
import sys, io, os, time, json, urllib.request
import concurrent.futures
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
from pathlib import Path
for line in (Path.home() / '.claude/.env').read_text(encoding='utf-8').splitlines():
    if '=' in line and not line.startswith('#'):
        k, v = line.split('=', 1)
        os.environ[k.strip()] = v.strip()

sys.path.insert(0, str(Path(r'D:\Users\Desktop\Claude專案\Claude-鑑源\llm_collab')))
from multi_llm import ask_gpt, ask_gemini, ask_qwen, ask_kimi, ask_deepseek

TG_TOKEN = os.environ['TELEGRAM_BOT_TOKEN']
TG_CHAT = int(os.environ['TELEGRAM_CHAT_ID'])
SUPA = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SERVICE = os.environ['SUPABASE_SERVICE_ROLE_KEY']
SITE = 'https://jianyuan.life'

REPORTS = [
    ('644b4c09-c545-41e5-ac25-23ba2e45faa0', '何宣逸', '1990-10-12 20:00 男', '0dad175e-3d10-4a39-9173-9112bc5919a9'),
    ('45ae2b9b-9709-42ae-8d17-c0cf6c10c01f', '何宥諄', '2023-05-08 10:00 男(兒童專版)', '2ecb8984-f363-4cd1-a4f8-b2a8400c87e5'),
    ('29bff605-43f2-4b9a-a7fd-1e614dfb4de3', '何紀萳', '1994-10-04 08:00 女', 'eea11502-9792-455f-8acd-a7b1ae9005f1'),
]


def tg(text):
    body = json.dumps({'chat_id': TG_CHAT, 'text': text, 'parse_mode': 'HTML', 'disable_web_page_preview': True}).encode()
    req = urllib.request.Request(f'https://api.telegram.org/bot{TG_TOKEN}/sendMessage',
        data=body, headers={'Content-Type': 'application/json'}, method='POST')
    try: urllib.request.urlopen(req, timeout=10)
    except Exception as e: print(f'TG fail: {e}')


def wait_completed(report_id):
    """輪詢等 status = completed"""
    t0 = time.time()
    while time.time() - t0 < 1800:  # 30 分上限
        url = f'{SUPA}/rest/v1/paid_reports?id=eq.{report_id}&select=status,error_message,report_result'
        req = urllib.request.Request(url, headers={'apikey': SERVICE, 'Authorization': f'Bearer {SERVICE}'})
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                rows = json.loads(r.read().decode())
                if rows:
                    row = rows[0]
                    if row['status'] == 'completed':
                        return row.get('report_result', {})
                    if row['status'] == 'failed':
                        return {'_failed': True, 'error': row.get('error_message', '')}
        except Exception: pass
        time.sleep(30)
    return None


QA_SYSTEM = """你是鑑源命理報告 QA 審查員。審查報告要達到專業、準確、完整的標準。

評分維度（各 0-100）：
1. **命理準確性**：日主/十神/大運/流年等引用是否正確、有無幻覺
2. **起承轉合結構**：第一篇「本我」(起)、第二篇「現況」(承)、第三篇「時運」(轉)、第四篇「行動」(合) 是否清晰、無跳題
3. **可讀性**：普通客戶能讀懂嗎？有沒有廢話？共鳴感強嗎？
4. **禁區檢查**：有無簡體字、Markdown 殘留、過度承諾、評分、emoji 亂碼？
5. **深度與誠意**：論述具體嗎？每個建議可執行嗎？值 $89 嗎？

輸出純 JSON（不要 markdown code block）：
{"score": 95, "issues": ["具體問題"], "strengths": ["優點"], "critical_errors": ["重大錯誤如 0"]}"""


def score_one(llm_name, llm_fn, content, **kw):
    user = f"""## 待審查 C 方案人生藍圖報告（約 {len(content)} 字）

{content[:25000]}  # 取前 25k 字避免 token 超限

---

請綜合評分。若發現命理錯誤或嚴重瑕疵 → critical_errors 列出。輸出 JSON。"""
    r = llm_fn(QA_SYSTEM, user, max_tokens=1500, **kw)
    if 'error' in r:
        return llm_name, {'score': 0, 'error': r['error'][:200]}
    txt = r.get('content', '').strip().replace('```json', '').replace('```', '').strip()
    s, e = txt.find('{'), txt.rfind('}')
    if s >= 0 and e > s:
        txt = txt[s:e+1]
    try:
        return llm_name, json.loads(txt)
    except Exception as ex:
        return llm_name, {'score': 0, 'error': f'parse: {ex}', 'raw': r.get('content', '')[:200]}


def qa_report(content):
    """5 LLM 並行評分"""
    jobs = {
        'gpt': (ask_gpt, {'model':'gpt-4o'}),
        'qwen': (ask_qwen, {'model':'qwen-max'}),
        'kimi': (ask_kimi, {'model':'moonshot-v1-128k'}),
        'deepseek': (ask_deepseek, {'model':'deepseek-chat'}),
        'gemini': (ask_gemini, {'model':'gemini-2.5-flash'}),
    }
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        futs = {ex.submit(score_one, n, fn, content, **kw): n for n, (fn, kw) in jobs.items()}
        for f in concurrent.futures.as_completed(futs, timeout=180):
            name, res = f.result()
            results[name] = res
    return results


def main():
    results_all = {}
    for rid, name, birth, token in REPORTS:
        print(f'\n[{name}] 等 completed...')
        tg(f'⏳ 等候 <b>{name}</b> 完成生成...')

        result = wait_completed(rid)
        if not result:
            tg(f'⚠️ <b>{name}</b> 30 分內未完成，跳過評分')
            results_all[name] = {'status': 'timeout'}
            continue
        if result.get('_failed'):
            tg(f'❌ <b>{name}</b> 生成失敗：{result.get("error", "")[:200]}')
            results_all[name] = {'status': 'failed'}
            continue

        content = result.get('ai_content', '')
        if not content:
            tg(f'⚠️ <b>{name}</b> 完成但 ai_content 為空')
            continue

        print(f'  → {len(content)} 字，開始 5 LLM 評分...')
        tg(f'✅ <b>{name}</b> 生成完成（{len(content)} 字）\n連結：{SITE}/report/{token}\n\n🔍 啟動 5 LLM 品質評分中...')

        reviews = qa_report(content)
        scores = {n: r.get('score', 0) for n, r in reviews.items()}
        min_s = min([s for s in scores.values() if s > 0] or [0])
        avg = sum(scores.values()) / max(1, len([s for s in scores.values() if s > 0]))

        # 檢查重大錯誤
        critical = []
        for n, r in reviews.items():
            if r.get('critical_errors'):
                critical.append(f'{n}: {r["critical_errors"][:3]}')

        results_all[name] = {'scores': scores, 'min': min_s, 'avg': avg, 'critical': critical, 'reviews': reviews}

        # 推評分結果
        icon = '✅' if min_s >= 96 else ('🟡' if min_s >= 90 else '🔴')
        msg = f'''{icon} <b>{name} 5 LLM 評分結果</b>

分數：GPT {scores.get('gpt')} / Qwen {scores.get('qwen')} / Kimi {scores.get('kimi')} / DeepSeek {scores.get('deepseek')} / Gemini {scores.get('gemini')}
平均：{avg:.1f}｜最低：{min_s}

'''
        if min_s >= 96:
            msg += '✅ 全部 LLM 都 ≥96，品質達標'
        elif min_s >= 90:
            msg += f'🟡 最低 {min_s}，略低於 96 標準，建議老闆重點看'
        else:
            msg += f'🔴 最低 {min_s}，低於標準，老闆務必親自審閱'

        if critical:
            msg += '\n\n⚠️ <b>發現重大錯誤</b>：\n' + '\n'.join(f'• {c}' for c in critical[:3])

        msg += f'\n\n🔗 報告：{SITE}/report/{token}'
        tg(msg)

    # 總結
    tg('🏁 <b>3 客戶報告 5 LLM 評分總結</b>\n\n' + '\n'.join([
        f'{"✅" if r.get("min", 0) >= 96 else ("🟡" if r.get("min", 0) >= 90 else "🔴")} {n}：min {r.get("min", "?")}, avg {r.get("avg", 0):.1f}'
        for n, r in results_all.items()
    ]) + '\n\n老闆點連結檢查，我已用 5 LLM 把關。')


if __name__ == '__main__':
    main()
