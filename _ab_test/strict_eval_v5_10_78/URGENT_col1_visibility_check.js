// 第 2 輪 — 精確驗證:第 1 欄是否在 viewport 內可見(初始狀態、未滾動)
// 老闆原訴求:「表格第 1 欄被截」=「客戶打開頁面、第 1 欄看不到」
// 不是「表格本身大、可滾動」(那是 .table-breakout 設計、合理)
//
// 判定:
//   PASS = 表格 col-1 第一個 cell 的 left ≥ container.left + padding(可見、未被裁)
//   FAIL = col-1 left < container.left(被切掉、需滾才看)
//   注意:表格 scrollWidth > container 是合理(big table 有 overflow-x:auto)
//        但 col-1 起始位置必須在 viewport 內

const path = require('path');
const fs = require('fs');

const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const TOKENS = [
  { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C_HoYouChun', plan: 'C' },
  { id: '64b15504-b3c4-4153-aff6-3f279363dc7e', name: 'C_HoChiNan',  plan: 'C' },
  { id: '271dcda0-e348-4d98-9c09-4beb14a4634a', name: 'G15_HoFamily', plan: 'G15' },
  { id: '9b6edb0a-f1db-4484-8306-c088e78be8c8', name: 'unknown_9b', plan: '?' },
];

const VIEWPORTS = [
  { name: 'desktop_1920', width: 1920, height: 1080 },
  { name: 'desktop_1440', width: 1440, height: 900 },
  { name: 'mobile_375',   width: 375,  height: 812 },
];

const log = (m) => process.stdout.write(m + '\n');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ssDir = path.join(__dirname, 'urgent_col1_screenshots');
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  const allResults = [];
  let totalTables = 0;
  let col1FailCount = 0;

  for (const t of TOKENS) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.name === 'mobile_375' ? 2 : 1,
        userAgent: vp.name === 'mobile_375'
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
          : undefined,
      });
      const page = await ctx.newPage();
      const url = `https://jianyuan.life/report/${t.id}?cb=col1_${Date.now()}`;
      log(`\n=== ${t.name} ${vp.name} ===`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);
        await page.evaluate(() => {
          document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
        });
        await page.waitForTimeout(2000);

        const v = await page.evaluate(() => {
          const m = document.body.innerText.match(/v5\.10\.\d+/g) || [];
          return [...new Set(m)];
        });
        log(`  versions: ${v.join(',')}`);

        // for each table, check col-1 first cell visibility
        const tableChecks = await page.evaluate(() => {
          const tables = Array.from(document.querySelectorAll('table'));
          return tables.map((table, idx) => {
            // identify by preceding heading
            let prevHeading = '';
            let sib = table.previousElementSibling;
            for (let i = 0; i < 8 && sib; i++) {
              if (/^H[1-6]$/.test(sib.tagName) || sib.classList.contains('report-h2') || sib.classList.contains('report-h3')) {
                prevHeading = sib.textContent.trim().slice(0, 70);
                break;
              }
              sib = sib.previousElementSibling;
            }
            // also try preceding text
            if (!prevHeading) {
              let p = table.parentElement;
              if (p && p.previousElementSibling) {
                const ps = p.previousElementSibling;
                if (ps.tagName?.match(/^H[1-6]$/)) prevHeading = ps.textContent.trim().slice(0, 70);
              }
            }

            // find scroll container
            let parent = table.parentElement;
            let scrollContainer = null;
            while (parent && parent !== document.body) {
              const pcs = window.getComputedStyle(parent);
              if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll' ||
                  parent.classList.contains('table-breakout')) {
                scrollContainer = parent;
                break;
              }
              parent = parent.parentElement;
            }

            const containerRect = scrollContainer ? scrollContainer.getBoundingClientRect() : null;
            const containerScrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;
            const tableRect = table.getBoundingClientRect();

            // get first row's first cell (col-1)
            const firstRow = table.querySelector('thead tr, tbody tr');
            if (!firstRow) return { idx, prevHeading, error: 'no-rows' };
            const col1Header = firstRow.children[0];
            if (!col1Header) return { idx, prevHeading, error: 'no-col1' };
            const col1HeaderRect = col1Header.getBoundingClientRect();

            // check 5 data row col-1 cells too
            const dataRowCol1 = Array.from(table.querySelectorAll('tbody tr')).slice(0, 8).map((tr, ri) => {
              const cell = tr.children[0];
              if (!cell) return null;
              const r = cell.getBoundingClientRect();
              const ccs = window.getComputedStyle(cell);
              return {
                rowIdx: ri,
                fullText: cell.textContent.trim(),
                left: Math.round(r.left),
                right: Math.round(r.right),
                width: Math.round(r.width),
                visible: containerRect ? (r.left >= containerRect.left - 1 && r.right <= containerRect.right + 1) : true,
                clippedByContainer: containerRect ? (r.left < containerRect.left - 1) : false,
              };
            }).filter(Boolean);

            // 計算可見性
            const col1Visible = containerRect
              ? col1HeaderRect.left >= containerRect.left - 1 && col1HeaderRect.right <= containerRect.right + 1
              : true;
            const col1ClippedLeft = containerRect ? col1HeaderRect.left < containerRect.left - 1 : false;

            return {
              idx,
              prevHeading: prevHeading || '(no-heading)',
              colCount: firstRow.children.length,
              hasContainer: !!scrollContainer,
              containerLeft: containerRect ? Math.round(containerRect.left) : null,
              containerRight: containerRect ? Math.round(containerRect.right) : null,
              containerWidth: containerRect ? Math.round(containerRect.width) : null,
              containerScrollLeft,
              tableLeft: Math.round(tableRect.left),
              tableRight: Math.round(tableRect.right),
              tableWidth: Math.round(tableRect.width),
              tableScrollW: table.scrollWidth,
              col1Header: {
                text: col1Header.textContent.trim().slice(0, 30),
                left: Math.round(col1HeaderRect.left),
                right: Math.round(col1HeaderRect.right),
                width: Math.round(col1HeaderRect.width),
                visible: col1Visible,
                clippedLeft: col1ClippedLeft,
              },
              dataRowCol1Sample: dataRowCol1.slice(0, 3),
              col1AllVisible: col1Visible && dataRowCol1.every(d => d.visible),
              col1ClippedRowCount: dataRowCol1.filter(d => d.clippedByContainer).length,
              tableOverflowsContainer: containerRect ? (table.scrollWidth > scrollContainer.clientWidth + 4) : false,
            };
          });
        });

        log(`  tables: ${tableChecks.length}`);
        tableChecks.forEach(tc => {
          if (tc.error) { log(`    #${tc.idx} ERROR: ${tc.error}`); return; }
          totalTables++;
          const status = tc.col1AllVisible ? '✅' : '❌';
          if (!tc.col1AllVisible) col1FailCount++;
          log(`    ${status} #${tc.idx} "${tc.prevHeading}" cols=${tc.colCount}`);
          log(`       container=${tc.containerLeft}~${tc.containerRight} (w=${tc.containerWidth}, scrollLeft=${tc.containerScrollLeft})`);
          log(`       table=${tc.tableLeft}~${tc.tableRight} (w=${tc.tableWidth}, overflows=${tc.tableOverflowsContainer})`);
          log(`       col1Header: "${tc.col1Header.text}" left=${tc.col1Header.left} right=${tc.col1Header.right} visible=${tc.col1Header.visible}${tc.col1Header.clippedLeft ? ' CLIPPED-LEFT!' : ''}`);
          if (!tc.col1AllVisible || tc.col1ClippedRowCount > 0) {
            log(`       data col-1 clipped rows: ${tc.col1ClippedRowCount}/${tc.dataRowCol1Sample.length} sampled`);
            tc.dataRowCol1Sample.forEach(d => {
              log(`         row ${d.rowIdx} "${d.fullText.slice(0,30)}" left=${d.left} visible=${d.visible}`);
            });
          }
        });

        // capture screenshot
        const ssPath = path.join(ssDir, `${t.name}_${vp.name}_col1.png`);
        await page.screenshot({ path: ssPath, fullPage: true });

        allResults.push({
          token: t.id, name: t.name, plan: t.plan,
          viewport: vp.name, viewportSize: `${vp.width}x${vp.height}`,
          versions: v,
          tableChecks,
          screenshot: ssPath,
        });

      } catch (e) {
        log(`  ERROR: ${e.message}`);
        allResults.push({ token: t.id, name: t.name, viewport: vp.name, error: String(e) });
      } finally {
        await ctx.close();
      }
    }
  }

  await browser.close();

  const summary = {
    totalTables,
    col1FailCount,
    col1PassCount: totalTables - col1FailCount,
    passRate: ((totalTables - col1FailCount) / totalTables * 100).toFixed(1) + '%',
    ts: new Date().toISOString(),
    results: allResults,
  };
  fs.writeFileSync(
    path.join(__dirname, 'URGENT_col1_visibility_result.json'),
    JSON.stringify(summary, null, 2)
  );
  log(`\n=== SUMMARY ===`);
  log(`Total tables: ${totalTables}, col-1 visible: ${totalTables - col1FailCount}, FAIL: ${col1FailCount} (${summary.passRate} pass)`);
})();
