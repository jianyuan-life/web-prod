"""URGENT: Verify production report page is not broken (black screen)."""
import json
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = "https://jianyuan.life/report/d143f949"
SHOT_PATH = Path(r"D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/_ab_test/strict_eval_v5_10_78/URGENT_v5_10_162_full_viewport.png")

console_msgs = []
page_errors = []

def on_console(msg):
    if msg.type in ("error", "warning"):
        try:
            console_msgs.append(f"[{msg.type}] {msg.text[:300]}")
        except Exception as e:
            console_msgs.append(f"[{msg.type}] <unreadable: {e}>")

def on_pageerror(err):
    try:
        page_errors.append(str(err)[:500])
    except Exception as e:
        page_errors.append(f"<unreadable: {e}>")

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=False)
    context = browser.new_context(viewport={"width": 1440, "height": 900})
    page = context.new_page()
    page.on("console", on_console)
    page.on("pageerror", on_pageerror)

    try:
        page.goto(URL, wait_until="domcontentloaded", timeout=45000)
    except Exception as e:
        print(f"GOTO ERROR: {e}", file=sys.stderr)

    try:
        page.wait_for_load_state("networkidle", timeout=30000)
    except Exception as e:
        print(f"NETWORKIDLE TIMEOUT (continuing): {e}", file=sys.stderr)

    SHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SHOT_PATH), full_page=False)

    diag = page.evaluate("""() => {
        const visible = document.body ? document.body.innerText.slice(0, 300) : '';
        const html = document.body ? document.body.innerHTML.length : 0;
        const errs = document.querySelector('.error, [class*="error"], [class*="Error"]');
        const bg = document.body ? getComputedStyle(document.body).backgroundColor : 'n/a';
        const w = document.body ? document.body.offsetWidth : 0;
        const h = document.body ? document.body.offsetHeight : 0;
        const childCount = document.body ? document.body.children.length : 0;
        const title = document.title;
        // version markers
        const html_text = document.documentElement.outerHTML;
        const m = html_text.match(/v5\\.\\d+\\.\\d+/g) || [];
        return {
            bodyHTMLLen: html,
            visibleText: visible,
            hasErrorEl: !!errs,
            pageColor: bg,
            pageWidth: w,
            pageHeight: h,
            bodyChildCount: childCount,
            title: title,
            versionMarkers: [...new Set(m)].slice(0, 5)
        };
    }""")

    print("=== DIAGNOSTIC ===")
    print(json.dumps(diag, ensure_ascii=False, indent=2))
    print("=== CONSOLE (errors/warnings) ===")
    for m in console_msgs[:20]:
        print(m)
    print(f"(total: {len(console_msgs)})")
    print("=== PAGE ERRORS ===")
    for e in page_errors[:20]:
        print(e)
    print(f"(total: {len(page_errors)})")
    print(f"=== SCREENSHOT === {SHOT_PATH} (exists={SHOT_PATH.exists()}, size={SHOT_PATH.stat().st_size if SHOT_PATH.exists() else 0})")

    browser.close()
