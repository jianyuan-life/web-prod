#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LLM 餘額自動檢查腳本（v5.3.2 監控系統）

用途：
  - 每小時掃描 OpenAI / Anthropic / Moonshot / DeepSeek / Gemini / Qwen 的餘額
  - 寫入 Supabase `llm_balance_log` 表
  - 低於 $10 發 Telegram 警告，低於 $3 發緊急告警

排程：
  - Windows Task Scheduler 每小時觸發一次
  - 手動執行：python scripts/check_llm_balances.py

環境變數（可放 ~/.claude/.env 或 .env.local）：
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - TELEGRAM_BOT_TOKEN
  - TELEGRAM_CHAT_ID
  - OPENAI_API_KEY       （可選）
  - CLAUDE_API_KEY       （Anthropic）
  - MOONSHOT_API_KEY / KIMI_API_KEY
  - DEEPSEEK_API_KEY
  - GOOGLE_API_KEY / GEMINI_API_KEY（可選）
  - DASHSCOPE_API_KEY    （Qwen，可選）
"""

from __future__ import annotations

import json
import os
import sys
import time
import traceback
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import urllib.request
    import urllib.error
except Exception:
    print("[fatal] 缺少 urllib，至少要 Python 3.x 標準庫", file=sys.stderr)
    sys.exit(1)

# 載入 .env（如果有）
def load_env(paths: list[Path]) -> None:
    for p in paths:
        if not p.exists():
            continue
        try:
            for line in p.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
        except Exception:
            pass

_HERE = Path(__file__).resolve().parent
load_env([
    _HERE.parent / ".env.local",
    _HERE.parent / ".env",
    Path.home() / ".claude" / ".env",
])

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TG_CHAT = os.getenv("TELEGRAM_CHAT_ID", "")

LOW_THRESHOLD_USD = 10.0
CRITICAL_THRESHOLD_USD = 3.0
HTTP_TIMEOUT = 10

# 匯率（粗略值，月度更新即可）
CNY_PER_USD = 7.2


@dataclass
class BalanceResult:
    provider: str
    balance: float | None = None          # 原始幣別
    currency: str = "USD"
    balance_usd: float | None = None      # 換算 USD
    status: str = "ok"                    # ok / low / critical / unknown / error
    error_message: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)

    def classify(self) -> None:
        """根據 balance_usd 計算 status（若尚未設定）"""
        if self.status in ("unknown", "error"):
            return
        if self.balance_usd is None:
            self.status = "unknown"
            return
        if self.balance_usd < CRITICAL_THRESHOLD_USD:
            self.status = "critical"
        elif self.balance_usd < LOW_THRESHOLD_USD:
            self.status = "low"
        else:
            self.status = "ok"


# ---------------------------------------------------------------------------
# HTTP helper
# ---------------------------------------------------------------------------
def http_get(url: str, headers: dict[str, str]) -> tuple[int, dict[str, Any] | str]:
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(body)
            except Exception:
                return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else str(e)
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, body
    except Exception as e:
        return -1, str(e)


def http_post(url: str, headers: dict[str, str], body: dict[str, Any]) -> tuple[int, Any]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, headers={**headers, "Content-Type": "application/json"}, data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(raw)
            except Exception:
                return resp.status, raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else str(e)
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw
    except Exception as e:
        return -1, str(e)


# ---------------------------------------------------------------------------
# 各 provider 的查詢實作
# ---------------------------------------------------------------------------
def check_openai() -> BalanceResult:
    key = os.getenv("OPENAI_API_KEY", "")
    r = BalanceResult(provider="openai")
    if not key:
        r.status = "unknown"
        r.error_message = "OPENAI_API_KEY 未設定"
        return r
    # OpenAI Dashboard billing API（非官方穩定介面，HTTP 401 很常見）
    status, body = http_get(
        "https://api.openai.com/v1/dashboard/billing/credit_grants",
        {"Authorization": f"Bearer {key}"},
    )
    if status == 200 and isinstance(body, dict):
        try:
            avail = float(body.get("total_available", 0.0))
            r.balance = avail
            r.currency = "USD"
            r.balance_usd = avail
            r.raw = body
            r.classify()
            return r
        except Exception:
            pass
    # Fallback：嘗試 models 端點確認 key 是否有效
    status2, _ = http_get("https://api.openai.com/v1/models", {"Authorization": f"Bearer {key}"})
    if status2 == 200:
        r.status = "unknown"
        r.error_message = "API 可用，但 billing API 已不對外開放（請到 platform.openai.com 手動查）"
    else:
        r.status = "error"
        r.error_message = f"HTTP {status} / {status2}"
    return r


def check_anthropic() -> BalanceResult:
    """Anthropic 沒有官方 balance API，我們用 Admin API 撈當月花費，再讓使用者自己換算。"""
    key = os.getenv("CLAUDE_API_KEY", "") or os.getenv("ANTHROPIC_API_KEY", "")
    r = BalanceResult(provider="anthropic")
    if not key:
        r.status = "unknown"
        r.error_message = "CLAUDE_API_KEY 未設定"
        return r
    # 嘗試 Admin API（需要 admin 權限 key，不是所有 key 都能用）
    status, body = http_get(
        "https://api.anthropic.com/v1/organizations/cost_report",
        {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "anthropic-beta": "admin-2025-04-15",
        },
    )
    if status == 200 and isinstance(body, dict):
        # 拿到當月成本但沒餘額，這裡只記 metadata
        r.status = "unknown"
        r.error_message = "Anthropic 不提供餘額 API，請到 console.anthropic.com 查"
        r.raw = {"cost_report_preview": (json.dumps(body))[:400]}
        return r
    # 至少確認 key 能用（最低成本一次 Haiku call）
    status2, body2 = http_post(
        "https://api.anthropic.com/v1/messages",
        {"x-api-key": key, "anthropic-version": "2023-06-01"},
        {"model": "claude-haiku-4-5", "max_tokens": 1, "messages": [{"role": "user", "content": "1"}]},
    )
    if status2 == 200:
        r.status = "unknown"
        r.error_message = "API 可用但無餘額端點，請手動到 console.anthropic.com 查"
    elif status2 == 402 or (isinstance(body2, (dict,)) and "credit balance is too low" in json.dumps(body2)):
        r.status = "critical"
        r.balance = 0
        r.balance_usd = 0
        r.error_message = "Anthropic 帳戶額度耗盡（402）"
    elif status2 == 429:
        r.status = "unknown"
        r.error_message = "API 限流中，無法確認餘額"
    else:
        r.status = "error"
        r.error_message = f"HTTP {status2}"
    return r


def check_moonshot() -> BalanceResult:
    key = os.getenv("MOONSHOT_API_KEY", "") or os.getenv("KIMI_API_KEY", "")
    r = BalanceResult(provider="moonshot")
    if not key:
        r.status = "unknown"
        r.error_message = "MOONSHOT_API_KEY / KIMI_API_KEY 未設定"
        return r
    status, body = http_get(
        "https://api.moonshot.cn/v1/users/me/balance",
        {"Authorization": f"Bearer {key}"},
    )
    if status == 200 and isinstance(body, dict):
        try:
            data = body.get("data") or {}
            avail = float(data.get("available_balance", 0))
            r.balance = avail
            r.currency = "CNY"
            r.balance_usd = round(avail / CNY_PER_USD, 4)
            r.raw = data
            r.classify()
            return r
        except Exception as e:
            r.status = "error"
            r.error_message = f"parse error: {e}"
            return r
    r.status = "error"
    r.error_message = f"HTTP {status}: {str(body)[:200]}"
    return r


def check_deepseek() -> BalanceResult:
    key = os.getenv("DEEPSEEK_API_KEY", "")
    r = BalanceResult(provider="deepseek")
    if not key:
        r.status = "unknown"
        r.error_message = "DEEPSEEK_API_KEY 未設定"
        return r
    status, body = http_get(
        "https://api.deepseek.com/user/balance",
        {"Authorization": f"Bearer {key}"},
    )
    if status == 200 and isinstance(body, dict):
        try:
            infos = body.get("balance_infos") or []
            usd_info = next((b for b in infos if b.get("currency") == "USD"), None)
            cny_info = next((b for b in infos if b.get("currency") == "CNY"), None)
            picked = usd_info or cny_info
            if picked is None:
                r.status = "error"
                r.error_message = "無法解析 balance_infos"
                return r
            bal = float(picked.get("total_balance", 0))
            cur = picked.get("currency", "USD")
            r.balance = bal
            r.currency = cur
            r.balance_usd = bal if cur == "USD" else round(bal / CNY_PER_USD, 4)
            r.raw = body
            r.classify()
            return r
        except Exception as e:
            r.status = "error"
            r.error_message = f"parse error: {e}"
            return r
    r.status = "error"
    r.error_message = f"HTTP {status}: {str(body)[:200]}"
    return r


def check_gemini() -> BalanceResult:
    """Gemini 免費配額制，這裡只驗證 API key 有效，不記餘額"""
    key = os.getenv("GEMINI_API_KEY", "") or os.getenv("GOOGLE_API_KEY", "")
    r = BalanceResult(provider="gemini")
    if not key:
        r.status = "unknown"
        r.error_message = "GEMINI_API_KEY 未設定（跳過）"
        return r
    status, body = http_get(
        f"https://generativelanguage.googleapis.com/v1beta/models?key={key}",
        {},
    )
    if status == 200:
        r.status = "ok"
        r.balance = None
        r.balance_usd = None
        r.currency = "FREE"
        r.error_message = "免費配額制（每分鐘 15 req），無餘額欄位"
        return r
    r.status = "error"
    r.error_message = f"HTTP {status}: {str(body)[:200]}"
    return r


def check_qwen() -> BalanceResult:
    """Qwen/DashScope：不提供 REST 餘額 API，記 unknown"""
    key = os.getenv("DASHSCOPE_API_KEY", "")
    r = BalanceResult(provider="qwen")
    if not key:
        r.status = "unknown"
        r.error_message = "DASHSCOPE_API_KEY 未設定（跳過）"
        return r
    r.status = "unknown"
    r.error_message = "阿里雲百煉需到 dashscope.console.aliyun.com 手動查"
    return r


# ---------------------------------------------------------------------------
# Supabase 寫入
# ---------------------------------------------------------------------------
def supabase_insert(results: list[BalanceResult]) -> bool:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[warn] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 未設定，跳過寫入")
        return False
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/llm_balance_log"
    payload = []
    for r in results:
        payload.append({
            "provider": r.provider,
            "balance": r.balance,
            "currency": r.currency or "USD",
            "balance_usd": r.balance_usd,
            "status": r.status,
            "error_message": r.error_message,
            "raw": r.raw or {},
        })
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            if 200 <= resp.status < 300:
                return True
            print(f"[warn] Supabase insert 回 {resp.status}")
            return False
    except Exception as e:
        print(f"[warn] Supabase insert 失敗: {e}")
        return False


# ---------------------------------------------------------------------------
# Telegram 告警
# ---------------------------------------------------------------------------
def tg_send(text: str) -> None:
    if not TG_TOKEN or not TG_CHAT:
        print("[warn] Telegram 未設定，跳過告警")
        print(text)
        return
    url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
    payload = {
        "chat_id": TG_CHAT,
        "text": text[:4000],
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST",
                                 headers={"Content-Type": "application/json"})
    try:
        urllib.request.urlopen(req, timeout=HTTP_TIMEOUT).read()
    except Exception as e:
        print(f"[warn] Telegram 送訊失敗: {e}")


def alert_if_needed(results: list[BalanceResult]) -> None:
    """掃描結果發告警。同一個 provider 一次檢查最多發一條訊息。"""
    for r in results:
        sym = "¥" if r.currency == "CNY" else "$"
        bal_text = f"{sym}{r.balance:.2f} {r.currency}" if r.balance is not None else "N/A"
        if r.status == "critical":
            tg_send(
                f"🔴 <b>LLM 餘額告急（緊急）</b>\n\n"
                f"<b>Provider：</b>{r.provider}\n"
                f"<b>目前餘額：</b>{bal_text}\n"
                f"<b>狀態：</b>即將耗盡（閾值 $3）\n\n"
                f"<i>立刻充值！再過幾份報告就會 402 無法生成</i>"
            )
        elif r.status == "low":
            tg_send(
                f"⚠️ <b>LLM 餘額不足</b>\n\n"
                f"<b>Provider：</b>{r.provider}\n"
                f"<b>目前餘額：</b>{bal_text}\n"
                f"<b>建議：</b>儘快充值（閾值 $10）"
            )
        elif r.status == "error":
            tg_send(
                f"🛠 <b>LLM 餘額查詢失敗</b>\n\n"
                f"<b>Provider：</b>{r.provider}\n"
                f"<b>錯誤：</b>{(r.error_message or '未知')[:400]}"
            )


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------
def run() -> int:
    checks = [
        ("openai", check_openai),
        ("anthropic", check_anthropic),
        ("moonshot", check_moonshot),
        ("deepseek", check_deepseek),
        ("gemini", check_gemini),
        ("qwen", check_qwen),
    ]

    results: list[BalanceResult] = []
    for name, fn in checks:
        t0 = time.time()
        try:
            r = fn()
        except Exception as e:
            r = BalanceResult(
                provider=name,
                status="error",
                error_message=f"Exception: {e} | {traceback.format_exc()[:300]}",
            )
        elapsed = round((time.time() - t0) * 1000)
        print(f"[{name}] status={r.status:<8} balance_usd={r.balance_usd} elapsed={elapsed}ms err={r.error_message or ''}")
        results.append(r)

    supabase_insert(results)
    alert_if_needed(results)

    # 有任何 critical 回 1（排程可抓到 exit code）
    any_critical = any(r.status == "critical" for r in results)
    return 1 if any_critical else 0


if __name__ == "__main__":
    sys.exit(run())
