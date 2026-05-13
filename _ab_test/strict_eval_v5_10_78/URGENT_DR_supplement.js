// 補測 D / R 方案(原 tokens 404、從 Supabase 撈最新 completed)
const path = require('path');
const fs = require('fs');
const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const TOKENS = [
  { id: '9c08fc78-7c0e-4bd3-a70f-6f0e714c62bd', name: 'D_latest', plan: 'D' },
  { id: '116836df-55a9-4d9a-ac33-3aae5c8ea7f9', name: 'R_latest', plan: 'R' },
];
const VIEWPORTS = [
  { name: 'desktop_1920', width: 1920, height: 1080 },
  { name: 'desktop_1440', width: 1440, height: 900 },
  { name: 'mobile_375',   width: 375,  height: 812 },
];

const log = (m) => process.stdout.write(m + '\n');
const ssDir = path.join(__dirname, 'urgent_DR_screenshots');
if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const allResults = [];
  let total = 0, pass = 0, totalTables = 0, col1Fail = 0;

  for (const t of TOKENS) {
    for (const vp of VIEWPORTS) {
      total++;
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.name === 'mobile_375' ? 2 : 1,
        userAgent: vp.name === 'mobile_375'
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
          : undefined,
      });
      const page = await ctx.newPage();
      const url = `https://jianyuan.life/report/${t.id}?cb=DR_${Date.now()}`;
      log(`\n=== ${t.name} ${vp.name} ===\n${url}`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);
        await page.evaluate(() => {
          document.querySelectorAll('details').forEach(d => d.setAttribute('open', ''));
          document.querySelectorAll('[aria-expanded="false"]').forEach(b => { try { b.click(); } catch (e) {} });
        });
        await page.waitForTimeout(2500);

        const versions = await page.evaluate(() => {
          const m = document.body.innerText.match(/v5\.10\.\d+/g) || [];
          return [...new Set(m)];
        });
        log(`  versions: ${versions.join(',')}`);

        const tables = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('table')).map((tb, i) => {
            const firstRow = tb.querySelector('thead tr, tbody tr');
            if (!firstRow) return null;
            const col1 = firstRow.children[0];
            if (!col1) return null;
            let parent = tb.parentElement;
            let scrollContainer = null;
            while (parent && parent !== document.body) {
              const cs = window.getComputedStyle(parent);
              if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || parent.classList.contains('table-breakout')) {
                scrollContainer = parent; break;
              }
              parent = parent.parentElement;
            }
            const containerRect = scrollContainer ? scrollContainer.getBoundingClientRect() : null;
            const col1Rect = col1.getBoundingClientRect();
            const visible = containerRect ? (col1Rect.left >= containerRect.left - 1 && col1Rect.right <= containerRect.right + 1) : true;

            // sample data row col-1 too
            const dataCol1 = Array.from(tb.querySelectorAll('tbody tr')).slice(0, 5).map(tr => {
              const c = tr.children[0];
              if (!c) return null;
              const r = c.getBoundingClientRect();
              return {
                visible: containerRect ? (r.left >= containerRect.left - 1 && r.right <= containerRect.right + 1) : true,
                left: Math.round(r.left),
              };
            }).filter(Boolean);
            const allColvisible = visible && dataCol1.every(d => d.visible);

            return {
              idx: i,
              colCount: firstRow.children.length,
              col1Text: col1.textContent.trim().slice(0, 25),
              col1Left: Math.round(col1Rect.left),
              col1Right: Math.round(col1Rect.right),
              containerLeft: containerRect ? Math.round(containerRect.left) : null,
              containerRight: containerRect ? Math.round(containerRect.right) : null,
              col1Visible: allColvisible,
              tableScrollW: tb.scrollWidth,
              containerW: scrollContainer ? scrollContainer.clientWidth : null,
              tableOverflows: scrollContainer ? tb.scrollWidth > scrollContainer.clientWidth + 4 : false,
            };
          }).filter(Boolean);
        });

        const failTables = tables.filter(tb => !tb.col1Visible);
        totalTables += tables.length;
        col1Fail += failTables.length;
        log(`  tables: ${tables.length}, col-1 visible: ${tables.length - failTables.length}, FAIL: ${failTables.length}`);
        tables.forEach(tb => {
          const flag = tb.col1Visible ? '✅' : '❌';
          log(`    ${flag} #${tb.idx} cols=${tb.colCount} col1="${tb.col1Text}" left=${tb.col1Left} container=${tb.containerLeft}~${tb.containerRight} overflow=${tb.tableOverflows}`);
        });

        const ssPath = path.join(ssDir, `${t.name}_${vp.name}.png`);
        await page.screenshot({ path: ssPath, fullPage: false });
        log(`  screenshot: ${path.basename(ssPath)}`);

        const overallPass = failTables.length === 0;
        if (overallPass) pass++;
        allResults.push({ token: t.id, name: t.name, plan: t.plan, viewport: vp.name, versions, tables, overallPass });
      } catch (e) {
        log(`  ERROR: ${e.message}`);
        allResults.push({ token: t.id, name: t.name, plan: t.plan, viewport: vp.name, error: String(e) });
      } finally {
        await ctx.close();
      }
    }
  }
  await browser.close();

  fs.writeFileSync(path.join(__dirname, 'URGENT_DR_supplement_result.json'),
    JSON.stringify({ total, pass, totalTables, col1Fail, results: allResults }, null, 2));
  log(`\n=== SUMMARY (D/R supplement) ===`);
  log(`Combos: ${total}, PASS: ${pass}, FAIL: ${total - pass}`);
  log(`Tables: ${totalTables}, col-1 visible: ${totalTables - col1Fail} (${((totalTables - col1Fail) / totalTables * 100).toFixed(1)}%)`);
})();
