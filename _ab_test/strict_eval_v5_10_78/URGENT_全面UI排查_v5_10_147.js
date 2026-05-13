// 🚨 URGENT P0 — 全面性 UI 表格 overflow 排查 v5.10.147
// 老闆貼 4 張截圖證據:表格第 1 欄被截斷
// 任務:4 方案 × 3 viewport = 12 組合,每個掃所有 <table>,偵測 td clip / col-1 width / horizontal overflow
//
// PASS 標準:
//   - 所有 <table> 在父容器內 (table.scrollWidth <= parent.clientWidth + 4) OR 父為 .table-breakout overflow:auto
//   - 所有 td 沒被 horizontal clip (td.scrollWidth <= td.clientWidth + 2)
//   - col-1 width >= contentWidth (避免文字被裁)
//   - body / main 沒有 horizontal scrollbar (scrollWidth > clientWidth)
//   - 所有 .section-card / callout / button 元素內文不被截

const path = require('path');
const fs = require('fs');

const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const TOKENS = [
  // C 人生藍圖 (含 15 系統矩陣表 / 12 個月星評分 / 12 月逐月 / 人生節奏總覽)
  { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C_HoYouChun', plan: 'C' },
  { id: '64b15504-b3c4-4153-aff6-3f279363dc7e', name: 'C_HoChiNan',  plan: 'C' },
  // G15 家族藍圖
  { id: '271dcda0-e348-4d98-9c09-4beb14a4634a', name: 'G15_HoFamily', plan: 'G15' },
  // D 心之所惑 (備用,可能 404)
  { id: '4e636025-fb87-4099-a91d-a4f6c64df7e5', name: 'D_HoXuan', plan: 'D' },
  // R 合否
  { id: '89e112dc-e0c1-4f0b-b8e8-5e5b51f6f8c7', name: 'R_unknown_89', plan: 'R' },
  { id: '9b6edb0a-f1db-4484-8306-c088e78be8c8', name: 'unknown_9b', plan: '?' },
];

const VIEWPORTS = [
  { name: 'desktop_1920', width: 1920, height: 1080 },
  { name: 'desktop_1440', width: 1440, height: 900 },
  { name: 'mobile_375',   width: 375,  height: 812 },
];

const log = (m) => process.stdout.write(m + '\n');

const REQUIRED_VERSION = 'v5.10.147';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const screenshotDir = path.join(__dirname, 'urgent_v5_10_147_screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const allResults = [];
  let totalCombos = 0;
  let passCombos = 0;

  for (const t of TOKENS) {
    for (const vp of VIEWPORTS) {
      totalCombos++;
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.name === 'mobile_375' ? 2 : 1,
        userAgent: vp.name === 'mobile_375'
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
          : undefined,
      });
      const page = await ctx.newPage();
      const url = `https://jianyuan.life/report/${t.id}?cb=urgent_v147_${Date.now()}_${Math.random()}`;
      log(`\n=== ${t.name} ${vp.name} (${vp.width}x${vp.height}) ===\n${url}`);

      const result = {
        token: t.id, name: t.name, plan: t.plan,
        viewport: vp.name, viewportSize: `${vp.width}x${vp.height}`,
        ts: new Date().toISOString(),
      };

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(8000);

        // expand all collapsible
        await page.evaluate(() => {
          document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
          document.querySelectorAll('button[aria-expanded="false"]').forEach(b => { try { b.click(); } catch (e) {} });
        });
        await page.waitForTimeout(2500);

        // 1. version detection — 必須 v5.10.147
        const vinfo = await page.evaluate(() => {
          const text = document.body.innerText;
          const matches = (text.match(/v5\.\d+\.\d+/g) || []);
          const sorted = matches.sort((a, b) => {
            const pa = a.replace('v','').split('.').map(Number);
            const pb = b.replace('v','').split('.').map(Number);
            for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
            return 0;
          });
          const is404 = /找不到報告|報告不存在|404/.test(text) && text.length < 3000;
          return { all: [...new Set(matches)], highest: sorted[0] || 'unknown', is404, textLen: text.length };
        });
        result.version = vinfo;
        result.deployVerified = vinfo.highest === REQUIRED_VERSION;
        log(`  version: ${vinfo.highest} (verified=${result.deployVerified})`);

        if (vinfo.is404) {
          log(`  ❌ 404 / 報告不存在 (textLen=${vinfo.textLen})`);
          result.error = '404';
          allResults.push(result);
          await ctx.close();
          continue;
        }

        // 2. body / main horizontal overflow
        const pageOverflow = await page.evaluate(() => {
          const html = document.documentElement;
          const body = document.body;
          const main = document.querySelector('main') || body;
          return {
            htmlScrollW: html.scrollWidth, htmlClientW: html.clientWidth,
            bodyScrollW: body.scrollWidth, bodyClientW: body.clientWidth,
            mainScrollW: main.scrollWidth, mainClientW: main.clientWidth,
            viewportW: window.innerWidth,
            hasHorizScroll: body.scrollWidth > body.clientWidth + 2,
          };
        });
        result.pageOverflow = pageOverflow;
        log(`  page: body ${pageOverflow.bodyScrollW}/${pageOverflow.bodyClientW} hasScroll=${pageOverflow.hasHorizScroll}`);

        // 3. ALL TABLES — 核心檢測
        const tables = await page.evaluate(() => {
          const results = [];
          document.querySelectorAll('table').forEach((table, idx) => {
            // find nearest scroll container (.table-breakout / [overflow:auto])
            let parent = table.parentElement;
            let scrollContainer = null;
            while (parent && parent !== document.body) {
              const pcs = window.getComputedStyle(parent);
              if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll' ||
                  parent.classList.contains('table-breakout') ||
                  parent.classList.contains('overflow-x-auto')) {
                scrollContainer = parent;
                break;
              }
              parent = parent.parentElement;
            }

            // table caption / preceding heading for identification
            const caption = table.querySelector('caption')?.textContent?.trim().slice(0, 50) || '';
            let prevHeading = '';
            let sib = table.previousElementSibling;
            for (let i = 0; i < 5 && sib; i++) {
              if (/^H[1-6]$/.test(sib.tagName) || sib.classList.contains('report-h2') || sib.classList.contains('report-h3')) {
                prevHeading = sib.textContent.trim().slice(0, 60);
                break;
              }
              sib = sib.previousElementSibling;
            }

            const tableRect = table.getBoundingClientRect();
            const containerRect = scrollContainer ? scrollContainer.getBoundingClientRect() : null;

            // analyze first row to count columns + measure col-1
            const firstRow = table.querySelector('thead tr, tbody tr');
            const cells = firstRow ? Array.from(firstRow.children) : [];
            const colCount = cells.length;

            // header (first row) all cells
            const headers = cells.map((cell, ci) => {
              const cs = window.getComputedStyle(cell);
              const r = cell.getBoundingClientRect();
              return {
                idx: ci,
                text: cell.textContent.trim().slice(0, 30),
                width: Math.round(r.width),
                clientWidth: cell.clientWidth,
                scrollWidth: cell.scrollWidth,
                clipped: cell.scrollWidth > cell.clientWidth + 2,
                whiteSpace: cs.whiteSpace,
                overflow: cs.overflowX,
                textOverflow: cs.textOverflow,
                paddingLeft: cs.paddingLeft,
                paddingRight: cs.paddingRight,
              };
            });

            // sample 5 td from data rows for clip detection
            const allTds = Array.from(table.querySelectorAll('tbody td'));
            const sampleTds = [];
            const tdsFirstCol = allTds.filter((td, i) => {
              const tr = td.parentElement;
              return tr.children[0] === td;
            });
            // take all first-col tds + first 3 from other cols
            const tdSamples = [...tdsFirstCol.slice(0, 8), ...allTds.filter(td => td.parentElement.children[0] !== td).slice(0, 5)];
            tdSamples.forEach((td, ti) => {
              const tr = td.parentElement;
              const colIdx = Array.from(tr.children).indexOf(td);
              const r = td.getBoundingClientRect();
              const cs = window.getComputedStyle(td);
              sampleTds.push({
                rowIdx: Array.from(tr.parentElement.children).indexOf(tr),
                colIdx,
                text: td.textContent.trim().slice(0, 40),
                fullText: td.textContent.trim(),
                width: Math.round(r.width),
                clientWidth: td.clientWidth,
                scrollWidth: td.scrollWidth,
                clipped: td.scrollWidth > td.clientWidth + 2,
                whiteSpace: cs.whiteSpace,
                overflow: cs.overflowX,
              });
            });

            const clippedCells = [
              ...headers.filter(h => h.clipped),
              ...sampleTds.filter(td => td.clipped),
            ];

            // table overflow vs container
            const tableOverflowsContainer = containerRect
              ? table.scrollWidth > scrollContainer.clientWidth + 4
              : tableRect.right > document.documentElement.clientWidth + 2;

            results.push({
              idx,
              caption,
              prevHeading,
              colCount,
              tableScrollW: table.scrollWidth,
              tableClientW: table.clientWidth,
              tableRectW: Math.round(tableRect.width),
              tableRectLeft: Math.round(tableRect.left),
              tableRectRight: Math.round(tableRect.right),
              hasScrollContainer: !!scrollContainer,
              scrollContainerClass: scrollContainer ? scrollContainer.className.slice(0, 100) : '',
              scrollContainerW: scrollContainer ? scrollContainer.clientWidth : null,
              tableOverflowsContainer,
              headers,
              sampleTds,
              clippedCellCount: clippedCells.length,
              col1Width: headers[0]?.width || 0,
              col1Clipped: headers[0]?.clipped || false,
            });
          });
          return results;
        });
        result.tables = tables;
        result.tableCount = tables.length;
        result.tableFailCount = tables.filter(t =>
          t.tableOverflowsContainer || t.clippedCellCount > 0 || t.col1Clipped
        ).length;
        log(`  tables: ${tables.length} total, ${result.tableFailCount} FAIL`);
        tables.forEach(t => {
          if (t.tableOverflowsContainer || t.clippedCellCount > 0 || t.col1Clipped) {
            log(`    ❌ #${t.idx} "${t.prevHeading || t.caption || 'no-title'}" cols=${t.colCount} table=${t.tableScrollW}/${t.tableClientW} container=${t.scrollContainerW || 'NONE'} clip=${t.clippedCellCount} col1Clip=${t.col1Clipped}`);
          } else {
            log(`    ✅ #${t.idx} "${t.prevHeading || t.caption || 'no-title'}" cols=${t.colCount} (no clip)`);
          }
        });

        // 4. other overflow elements (cards, callouts, buttons)
        const otherOverflow = await page.evaluate(() => {
          const checks = [];
          ['.section-card', '.callout', '.report-h2', '.report-h3', '.personality-card', '.recommendation-chip', 'blockquote'].forEach(sel => {
            const els = Array.from(document.querySelectorAll(sel));
            const overflow = els.filter(el => {
              return el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0;
            }).map(el => ({
              text: el.textContent.trim().slice(0, 40),
              scrollW: el.scrollWidth,
              clientW: el.clientWidth,
            }));
            if (overflow.length) checks.push({ selector: sel, overflowCount: overflow.length, samples: overflow.slice(0, 3) });
          });
          return checks;
        });
        result.otherOverflow = otherOverflow;
        if (otherOverflow.length) {
          log(`  ⚠️ other overflow: ${otherOverflow.length} categories`);
          otherOverflow.forEach(c => log(`    ${c.selector}: ${c.overflowCount} overflowing`));
        }

        // 5. screenshot
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        // scroll to first failing table for evidence
        if (result.tableFailCount > 0) {
          await page.evaluate(() => {
            const tables = document.querySelectorAll('table');
            for (const tb of tables) {
              if (tb.scrollWidth > tb.clientWidth + 2 || tb.parentElement?.scrollWidth > tb.parentElement?.clientWidth + 4) {
                tb.scrollIntoView({ block: 'center' });
                break;
              }
            }
          });
          await page.waitForTimeout(800);
        }
        const ssPath = path.join(screenshotDir, `${t.name}_${vp.name}_${Date.now()}.png`);
        await page.screenshot({ path: ssPath, fullPage: false });
        result.screenshot = ssPath;
        log(`  screenshot: ${path.basename(ssPath)}`);

        // overall pass/fail
        const overallPass = result.deployVerified
          && result.tableFailCount === 0
          && otherOverflow.length === 0
          && !pageOverflow.hasHorizScroll;
        result.overallPass = overallPass;
        if (overallPass) passCombos++;
        log(`  overall: ${overallPass ? '✅ PASS' : '❌ FAIL'}`);

      } catch (e) {
        result.error = String(e);
        log(`  ERROR: ${e}`);
      } finally {
        await ctx.close();
      }
      allResults.push(result);
    }
  }

  await browser.close();

  const summary = {
    requiredVersion: REQUIRED_VERSION,
    totalCombos,
    passCombos,
    failCombos: totalCombos - passCombos,
    passRate: ((passCombos / totalCombos) * 100).toFixed(1) + '%',
    ts: new Date().toISOString(),
    results: allResults,
  };
  fs.writeFileSync(
    path.join(__dirname, 'URGENT_全面UI排查_v5_10_147_result.json'),
    JSON.stringify(summary, null, 2)
  );
  log(`\n\n=== SUMMARY ===`);
  log(`Total: ${totalCombos}, PASS: ${passCombos}, FAIL: ${totalCombos - passCombos} (${summary.passRate})`);
  log(`Result saved.`);
})();
