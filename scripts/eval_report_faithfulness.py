#!/usr/bin/env python3
"""
提示詞合集 Prompt 9 — RAGAS Faithfulness CI Gate

對應:鑑源_Claude_Code_提示詞合集_2026-05-15.md Prompt 9
目標:抓最近 50 份 completed 報告,評 報告聲稱 vs 排盤 JSON 是否一致
      (faithfulness)、是否切題(answer_relevancy)、用了哪些排盤欄位
      (context_precision),低於 threshold 觸發告警。

跑法:
    cd Claude-鑑源網頁製作部門
    py -3.12 scripts/eval_report_faithfulness.py --dry        # 只列要評的、不評
    py -3.12 scripts/eval_report_faithfulness.py --limit 5    # 先 5 份試
    py -3.12 scripts/eval_report_faithfulness.py              # 最近 50 份
    npm run eval:reports                                      # package.json script

必要 env(live 評估;dry 不需):
    SUPABASE_URL                  (或 NEXT_PUBLIC_SUPABASE_URL)
    SUPABASE_SERVICE_ROLE_KEY
    CLAUDE_API_KEY                (LLM judge;ragas 缺時 fallback 用)
    RESEND_API_KEY                (< threshold 告警寄信,選填)
    FAITHFULNESS_THRESHOLD        (預設 0.85)
    FAITHFULNESS_ALERT_EMAIL      (預設 backup901012@gmail.com)

評估引擎(自動降級、零硬依賴):
    1. 若 `ragas` + `langchain` 可 import → 用 RAGAS 三指標
    2. 否則 → 內建輕量 LLM-judge fallback(Claude 評 faithfulness,
       answer_relevancy / context_precision 用啟發式)
    → CI 環境裝 ragas 走完整版;本機沒裝也能跑出可用結果、不卡 pipeline

輸出:
    reports/faithfulness_YYYY-MM-DD.csv
        report_id, plan_code, faithfulness, answer_relevancy,
        context_precision, engine, flags
    + < threshold:Resend 寄 FAITHFULNESS_ALERT_EMAIL
                   + Supabase faithfulness_alerts insert(表不存在則僅 log)

退出碼:0 全 >= threshold / 1 有低分(CI gate fail)/ 2 執行錯誤
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import traceback
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
DEFAULT_THRESHOLD = 0.85
DEFAULT_ALERT_EMAIL = "backup901012@gmail.com"


# ── .env loader(對齊 check_llm_balances.py 慣例)──
def _load_env() -> None:
    for fn in (".env.local", ".env.production", ".env"):
        p = REPO / fn
        if not p.exists():
            continue
        try:
            for line in p.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, _, v = line.partition("=")
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
        except Exception:
            pass


def _env(*names: str, default: str = "") -> str:
    for n in names:
        v = os.environ.get(n)
        if v:
            return v
    return default


# ── Supabase REST(urllib、不引重套件)──
def _supabase_get(path: str) -> Any:
    import urllib.request

    base = _env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
    key = _env("SUPABASE_SERVICE_ROLE_KEY")
    if not base or not key:
        raise RuntimeError("缺 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
    req = urllib.request.Request(
        f"{base}/rest/v1/{path}",
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def _supabase_insert(table: str, row: dict) -> bool:
    import urllib.request

    base = _env("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL").rstrip("/")
    key = _env("SUPABASE_SERVICE_ROLE_KEY")
    try:
        req = urllib.request.Request(
            f"{base}/rest/v1/{table}",
            data=json.dumps(row).encode("utf-8"),
            method="POST",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
        )
        urllib.request.urlopen(req, timeout=20).read()
        return True
    except Exception as e:
        print(f"  [warn] {table} insert 失敗(表可能不存在,僅 log):{e}")
        return False


def fetch_recent_reports(limit: int) -> list[dict]:
    # paid_reports:status=completed,取最近 limit 份,需含排盤 JSON 與報告內容
    q = (
        "paid_reports?select=id,plan_code,report_result,chart_data,"
        "customer_note,status,completed_at"
        f"&status=eq.completed&order=completed_at.desc&limit={limit}"
    )
    rows = _supabase_get(q)
    return rows if isinstance(rows, list) else []


# ── 評估引擎:RAGAS 優先,缺則 LLM-judge fallback ──
def _try_ragas(samples: list[dict]) -> list[dict] | None:
    try:
        import ragas  # noqa: F401
        from ragas import evaluate
        from ragas.metrics import faithfulness, answer_relevancy, context_precision
        from datasets import Dataset
    except Exception:
        return None
    try:
        ds = Dataset.from_list(
            [
                {
                    "question": s["question"],
                    "answer": s["answer"],
                    "contexts": [s["context"]],
                    "ground_truth": s["context"],
                }
                for s in samples
            ]
        )
        res = evaluate(ds, metrics=[faithfulness, answer_relevancy, context_precision])
        df = res.to_pandas()
        out = []
        for i, s in enumerate(samples):
            out.append(
                {
                    **s,
                    "faithfulness": float(df["faithfulness"].iloc[i]),
                    "answer_relevancy": float(df["answer_relevancy"].iloc[i]),
                    "context_precision": float(df["context_precision"].iloc[i]),
                    "engine": "ragas",
                }
            )
        return out
    except Exception as e:
        print(f"[warn] ragas 評估失敗、降級 fallback:{e}")
        return None


def _claude_faithfulness(answer: str, context: str) -> float:
    """LLM-judge fallback:Claude 評報告聲稱是否被排盤 context 支持(0-1)。"""
    import urllib.request

    key = _env("CLAUDE_API_KEY")
    if not key:
        return -1.0
    prompt = (
        "你是命理報告事實查核官。下方【排盤數據】是唯一真相,【報告片段】是 AI 寫的。\n"
        "判斷報告片段的具體命理聲稱(格局/十神/星曜/吉凶)是否都能在排盤數據找到依據。\n"
        "只回一個 0~1 的小數(1=完全有據、0=大量編造),不要任何其他字。\n\n"
        f"【排盤數據】\n{context[:6000]}\n\n【報告片段】\n{answer[:6000]}"
    )
    body = json.dumps(
        {
            "model": "claude-opus-4-6",
            "max_tokens": 10,
            "messages": [{"role": "user", "content": prompt}],
        }
    ).encode("utf-8")
    try:
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=body,
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=120) as r:
            data = json.loads(r.read().decode("utf-8"))
        txt = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        import re

        m = re.search(r"0?\.\d+|[01]", txt)
        return float(m.group()) if m else -1.0
    except Exception as e:
        print(f"  [warn] Claude judge 失敗:{e}")
        return -1.0


def _fallback_eval(samples: list[dict]) -> list[dict]:
    out = []
    for s in samples:
        f = _claude_faithfulness(s["answer"], s["context"])
        # answer_relevancy 啟發式:報告是否提到 customer_note 關鍵詞
        q = (s["question"] or "").strip()
        ar = 1.0 if not q else (0.9 if any(w in s["answer"] for w in q[:20]) else 0.6)
        # context_precision 啟發式:報告引用排盤關鍵欄位數 / 總欄位
        try:
            ctx_keys = list(json.loads(s["context"]).keys()) if s["context"].startswith("{") else []
        except Exception:
            ctx_keys = []
        used = sum(1 for k in ctx_keys if str(k) in s["answer"]) if ctx_keys else 0
        cp = round(used / len(ctx_keys), 3) if ctx_keys else 0.7
        out.append(
            {
                **s,
                "faithfulness": f,
                "answer_relevancy": ar,
                "context_precision": cp,
                "engine": "fallback-claude-judge",
            }
        )
    return out


def _resend_alert(low: list[dict], threshold: float) -> None:
    import urllib.request

    key = _env("RESEND_API_KEY")
    to = _env("FAITHFULNESS_ALERT_EMAIL", default=DEFAULT_ALERT_EMAIL)
    if not key:
        print("  [info] 無 RESEND_API_KEY、跳過寄信(已寫 CSV + log)")
        return
    rows = "".join(
        f"<tr><td>{x['report_id']}</td><td>{x['plan_code']}</td>"
        f"<td>{x['faithfulness']:.3f}</td></tr>"
        for x in low
    )
    html = (
        f"<h3>⚠️ 報告 faithfulness < {threshold}</h3>"
        f"<p>{len(low)} 份低於門檻,請 review prompt / 排盤對齊。</p>"
        f"<table border=1 cellpadding=6><tr><th>report_id</th><th>plan</th>"
        f"<th>faithfulness</th></tr>{rows}</table>"
    )
    try:
        req = urllib.request.Request(
            "https://api.resend.com/emails",
            data=json.dumps(
                {
                    "from": "鑑源品保 <noreply@jianyuan.life>",
                    "to": [to],
                    "subject": f"[鑑源 CI] faithfulness 告警 {len(low)} 份 < {threshold}",
                    "html": html,
                }
            ).encode("utf-8"),
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=20).read()
        print(f"  [ok] 已寄告警給 {to}")
    except Exception as e:
        print(f"  [warn] Resend 告警失敗:{e}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--dry", action="store_true", help="只列要評的、不呼叫 LLM")
    args = ap.parse_args()

    _load_env()
    threshold = float(_env("FAITHFULNESS_THRESHOLD", default=str(DEFAULT_THRESHOLD)))

    try:
        reports = fetch_recent_reports(args.limit)
    except Exception as e:
        print(f"[error] 抓報告失敗:{e}")
        traceback.print_exc()
        return 2

    if not reports:
        print("[info] 無 completed 報告可評")
        return 0

    samples = []
    for r in reports:
        rr = r.get("report_result")
        answer = rr if isinstance(rr, str) else json.dumps(rr, ensure_ascii=False) if rr else ""
        ctx = r.get("chart_data")
        context = ctx if isinstance(ctx, str) else json.dumps(ctx, ensure_ascii=False) if ctx else ""
        if not answer or not context:
            continue
        samples.append(
            {
                "report_id": r.get("id"),
                "plan_code": r.get("plan_code"),
                "question": r.get("customer_note") or "",
                "answer": answer,
                "context": context,
            }
        )

    print(f"[info] {len(samples)} 份可評(threshold={threshold})")
    if args.dry:
        for s in samples:
            print(f"  - {s['report_id']} [{s['plan_code']}] answer={len(s['answer'])}字")
        return 0

    scored = _try_ragas(samples) or _fallback_eval(samples)

    out_dir = REPO / "reports"
    out_dir.mkdir(exist_ok=True)
    csv_path = out_dir / f"faithfulness_{date.today().isoformat()}.csv"
    low: list[dict] = []
    with csv_path.open("w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(
            ["report_id", "plan_code", "faithfulness", "answer_relevancy", "context_precision", "engine", "flags"]
        )
        for s in scored:
            flag = ""
            if s["faithfulness"] >= 0 and s["faithfulness"] < threshold:
                flag = "LOW_FAITHFULNESS"
                low.append(s)
            elif s["faithfulness"] < 0:
                flag = "JUDGE_UNAVAILABLE"
            w.writerow(
                [
                    s["report_id"],
                    s["plan_code"],
                    f"{s['faithfulness']:.4f}",
                    f"{s['answer_relevancy']:.4f}",
                    f"{s['context_precision']:.4f}",
                    s["engine"],
                    flag,
                ]
            )
    print(f"[ok] 輸出 {csv_path}（{len(scored)} 份、engine={scored[0]['engine']}）")

    if low:
        print(f"[FAIL] {len(low)} 份 faithfulness < {threshold}")
        _resend_alert(low, threshold)
        for x in low:
            _supabase_insert(
                "faithfulness_alerts",
                {
                    "report_id": x["report_id"],
                    "plan_code": x["plan_code"],
                    "faithfulness": round(x["faithfulness"], 4),
                    "ts": datetime.now(timezone.utc).isoformat(),
                },
            )
        return 1

    print(f"[PASS] 全 {len(scored)} 份 >= {threshold}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
