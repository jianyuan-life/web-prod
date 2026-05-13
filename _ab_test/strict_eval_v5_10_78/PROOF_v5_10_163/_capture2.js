// Round 2 — full viewport screenshot AT scrolled-to-table position + col-1 detail
const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const TARGETS = [
  { token: 'd143f949-192c-4808-a516-61b03a19f146', plan: 'C',   name: 'C_d143f949' },
  { token: '9b6edb0a-f1db-4484-8306-c088e78be8c8', plan: 'G15', name: 'G15_9b6edb0a' }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  const allFindings = [];

  for (const t of TARGETS) {
    const url = `https://jianyuan.life/report/${t.token}?cb=v5_10_163_R2_${Date.now()}`;
    console.log(`\n=== ${t.name} ===`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    try { await page.waitForSelector('table, .report-card-stack', { timeout: 20000 }); } catch (e) {}
    await page.waitForTimeout(2500);

    // Get all tables w/ col-1 details
    const tableData = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'));
      return tables.map((tbl, i) => {
        const outer = tbl.closest('.table-breakout-outer');
        const stack = tbl.closest('.report-card-stack');
        const rows = Array.from(tbl.querySelectorAll('tr'));
        const firstHeaderCell = rows[0]?.querySelector('th, td');
        const firstBodyRowCells = rows[1]?.querySelectorAll('th, td');
        const col1Header = firstHeaderCell?.innerText?.trim() || '';
        const col1Width = firstHeaderCell?.offsetWidth || 0;
        const col1Body = firstBodyRowCells?.[0]?.innerText?.trim()?.slice(0, 50) || '';
        const allHeaders = Array.from(rows[0]?.querySelectorAll('th, td') || []).map(c => ({
          text: c.innerText?.trim()?.slice(0, 30),
          width: c.offsetWidth
        }));
        const tblRect = tbl.getBoundingClientRect();
        return {
          idx: i,
          tag_chain: outer ? 'outer→table' : (stack ? 'stack→table' : 'naked'),
          rendered: outer ? 'CARD_STACK_or_BREAKOUT' : (stack ? 'CARD_STACK' : 'PLAIN_TABLE'),
          rowCount: rows.length,
          colCount: rows[0]?.children.length || 0,
          col1Header, col1Width, col1Body,
          allHeaders,
          top: Math.round(tblRect.top + window.scrollY),
          width: Math.round(tblRect.width),
          left: Math.round(tblRect.left)
        };
      });
    });

    console.log(`  total tables: ${tableData.length}`);
    tableData.slice(0, 6).forEach(td => {
      console.log(`  [${td.idx}] ${td.rendered} cols=${td.colCount} col1Header="${td.col1Header}" w=${td.col1Width} headers=${JSON.stringify(td.allHeaders.map(h=>`${h.text}(${h.width})`))}`);
    });

    // Find table with most cols (wide table) and screenshot context
    const wideTables = tableData.filter(t => t.colCount >= 4).slice(0, 3);
    for (const wt of wideTables) {
      try {
        await page.evaluate((top) => window.scrollTo({ top: Math.max(0, top - 200), behavior: 'instant' }), wt.top);
        await page.waitForTimeout(800);
        const fp = path.join(OUT, `${t.name}_wide_table_${wt.idx}_viewport.png`);
        await page.screenshot({ path: fp, fullPage: false });
        console.log('  saved:', path.basename(fp), `(col1="${wt.col1Header}" w=${wt.col1Width})`);

        // Also focused screenshot of just the table
        const fp2 = path.join(OUT, `${t.name}_wide_table_${wt.idx}_focused.png`);
        try {
          const tbl = page.locator('table').nth(wt.idx);
          await tbl.screenshot({ path: fp2 });
          console.log('  saved:', path.basename(fp2));
        } catch (e) { console.log('  focused err:', e.message?.slice(0, 60)); }
      } catch (e) { console.log('  ss err:', e.message?.slice(0, 60)); }
    }

    allFindings.push({ name: t.name, tableData: tableData.slice(0, 8) });
  }

  fs.writeFileSync(path.join(OUT, '_summary_r2.json'), JSON.stringify(allFindings, null, 2));
  await browser.close();
  console.log('\n=== R2 DONE ===');
})().catch(e => { console.error(e); process.exit(1); });
