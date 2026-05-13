// v5.10.126 表格第 1 欄寬度真實驗證
// PASS 標準:所有 col-1 td 寬度 >= 80px(min-width:80px 強制)
// 跑法:NODE_PATH="C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules" node verify_table_col1.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TOKENS = [
  { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C 何宥諄', plan: 'C' },
  { id: '9b6edb0a-f1db-4484-8306-c088e78be8c8', name: 'G15 7LLM', plan: 'G15' },
  { id: '4e636025-fb87-4099-a91d-a4f6c64df7e5', name: 'D 何宣', plan: 'D' },
  { id: '89e112dc-e0c1-4f0b-b8e8-5e5b51f6f8c7', name: 'R 李馮', plan: 'R' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const MIN_COL1_WIDTH_PX = 80;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const allResults = [];

  for (const t of TOKENS) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      const url = `https://jianyuan.life/report/${t.id}`;
      console.log(`\n=== ${t.name} ${vp.name} (${vp.width}x${vp.height}) ===\n${url}`);

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(4000); // 等 hydration + table render

        // 展開所有 collapsible (CollapsibleSection 多數預設展開、保險起見)
        await page.evaluate(() => {
          document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
          // 點擊所有 collapsible toggle button(若有)
          document.querySelectorAll('button[aria-expanded="false"]').forEach(b => {
            try { b.click(); } catch (e) {}
          });
        });
        await page.waitForTimeout(1500);

        // 抓 footer 版本
        const footerVersion = await page.evaluate(() => {
          const m = document.body.innerText.match(/v5\.\d+\.\d+/);
          return m ? m[0] : 'unknown';
        });

        // 抓所有 table 第 1 欄 td 真實寬度
        const tableData = await page.evaluate((MIN_W) => {
          const tables = Array.from(document.querySelectorAll('table'));
          const results = [];
          tables.forEach((table, tIdx) => {
            const rect = table.getBoundingClientRect();
            // 找 table 上方最近 h2/h3 識別
            let label = '';
            let prev = table.parentElement;
            for (let i = 0; i < 6 && prev; i++) {
              const h = prev.querySelector('h2, h3, h4');
              if (h) { label = h.innerText.trim().slice(0, 40); break; }
              prev = prev.parentElement;
            }
            const headerCells = Array.from(table.querySelectorAll('thead th, tr:first-child th, tr:first-child td'));
            const headerCol1 = headerCells[0];
            const headerCol1Text = headerCol1 ? headerCol1.innerText.trim().slice(0, 20) : '(無)';
            const headerCol1Width = headerCol1 ? headerCol1.getBoundingClientRect().width : 0;

            // 抓 body 第 1 欄 td 寬度(取所有 row 的第一個 td)
            const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
            const col1Widths = bodyRows.map(tr => {
              const td = tr.querySelector('td:first-child');
              if (!td) return null;
              return {
                width: td.getBoundingClientRect().width,
                text: td.innerText.trim().slice(0, 20),
              };
            }).filter(x => x !== null);

            // 全表 col-1 最小寬度
            const allCol1Widths = [headerCol1Width, ...col1Widths.map(x => x.width)];
            const minCol1 = allCol1Widths.length ? Math.min(...allCol1Widths) : 0;
            const passed = minCol1 >= MIN_W;

            results.push({
              tableIdx: tIdx,
              label: label || `(table #${tIdx})`,
              tableWidth: rect.width,
              headerCol1Text,
              headerCol1Width: Math.round(headerCol1Width),
              col1Sample: col1Widths.slice(0, 3).map(x => ({ text: x.text, w: Math.round(x.width) })),
              minCol1Width: Math.round(minCol1),
              passed,
              rowCount: bodyRows.length,
            });
          });
          return results;
        }, MIN_COL1_WIDTH_PX);

        const passCount = tableData.filter(t => t.passed).length;
        const failCount = tableData.length - passCount;

        // 截圖
        const screenshotDir = path.join(__dirname, 'screenshots');
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        const screenshotPath = path.join(screenshotDir, `${t.plan}_${t.id.slice(0, 8)}_${vp.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        const result = {
          token: t.id,
          name: t.name,
          plan: t.plan,
          viewport: vp.name,
          footerVersion,
          tableCount: tableData.length,
          passCount,
          failCount,
          tables: tableData,
          screenshot: screenshotPath,
        };
        allResults.push(result);
        console.log(`  footer: ${footerVersion}, tables: ${tableData.length}, PASS ${passCount}, FAIL ${failCount}`);
        if (failCount > 0) {
          tableData.filter(x => !x.passed).forEach(t => {
            console.log(`    FAIL: "${t.label}" col1 minWidth=${t.minCol1Width}px (header="${t.headerCol1Text}" ${t.headerCol1Width}px)`);
          });
        }
      } catch (e) {
        console.log(`  ERROR: ${e.message}`);
        allResults.push({
          token: t.id,
          name: t.name,
          plan: t.plan,
          viewport: vp.name,
          error: e.message,
        });
      } finally {
        await context.close();
      }
    }
  }

  await browser.close();

  // 寫結果 JSON
  const outJson = path.join(__dirname, 'verify_table_col1_result.json');
  fs.writeFileSync(outJson, JSON.stringify(allResults, null, 2));
  console.log(`\n=== JSON saved: ${outJson} ===`);

  // 總結
  const totalTables = allResults.reduce((sum, r) => sum + (r.tableCount || 0), 0);
  const totalPass = allResults.reduce((sum, r) => sum + (r.passCount || 0), 0);
  const totalFail = allResults.reduce((sum, r) => sum + (r.failCount || 0), 0);
  console.log(`\n=== 總結 ===`);
  console.log(`Total tables: ${totalTables}`);
  console.log(`PASS: ${totalPass} (${totalTables ? (totalPass/totalTables*100).toFixed(1) : 0}%)`);
  console.log(`FAIL: ${totalFail}`);
})();
