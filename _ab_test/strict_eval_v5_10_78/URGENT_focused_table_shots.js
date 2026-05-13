// 抓老闆 4 張截圖中提到的關鍵表格特寫(viewport-only 不 fullPage)
// 1. 人生節奏總覽表(年齡欄)
// 2. 12 月逐月分析(行動建議)
// 3. 12 月星評分表(★ 欄)
// 4. 系統矩陣表(13-17 欄、紫微在第 1 欄)

const path = require('path');
const fs = require('fs');

const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const VIEWPORTS = [
  { name: 'desktop_1920', width: 1920, height: 1080 },
  { name: 'desktop_1440', width: 1440, height: 900 },
  { name: 'mobile_375',   width: 375,  height: 812 },
];
const TOKEN = 'd143f949-192c-4808-a516-61b03a19f146';
const ssDir = path.join(__dirname, 'urgent_focused_screenshots');
if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

const log = (m) => process.stdout.write(m + '\n');

// 我們要找的表格特徵:
// - 17 欄 = 系統矩陣表
// - 6 欄 + col-1 是「農曆月」 = 12 月逐月
// - col-1 是「年齡段」or「大運段」 = 人生節奏總覽
// - col-1 是 "#" + 7+ rows + col-2 含「月」字 = 月星評分

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.name === 'mobile_375' ? 2 : 1,
      userAgent: vp.name === 'mobile_375'
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
        : undefined,
    });
    const page = await ctx.newPage();
    const url = `https://jianyuan.life/report/${TOKEN}?cb=focused_${Date.now()}`;
    log(`\n=== ${vp.name} ${vp.width}x${vp.height} ===`);
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(7000);
      // FULLY expand all details/buttons
      await page.evaluate(() => {
        document.querySelectorAll('details').forEach(d => d.setAttribute('open', ''));
        document.querySelectorAll('[aria-expanded="false"]').forEach(b => { try { b.setAttribute('aria-expanded','true'); b.click(); } catch (e) {} });
        document.querySelectorAll('[hidden]').forEach(el => el.removeAttribute('hidden'));
      });
      await page.waitForTimeout(3000);
      // Force layout recalc
      await page.evaluate(() => document.body.offsetHeight);
      await page.waitForTimeout(1000);

      // identify key tables by signature
      const tableInfo = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll('table'));
        return tables.map((t, i) => {
          const headerCells = Array.from(t.querySelectorAll('thead tr')[0]?.children || t.querySelector('tbody tr')?.children || []);
          const headerTexts = headerCells.map(c => c.textContent.trim());
          const rect = t.getBoundingClientRect();
          return {
            idx: i,
            colCount: headerCells.length,
            headers: headerTexts,
            top: rect.top + window.scrollY,
            left: rect.left,
            width: rect.width,
          };
        });
      });

      // identify by signatures
      const signatures = [
        { key: 'systemMatrix', match: t => t.colCount >= 13, label: '系統矩陣表' },
        { key: 'monthlyDetail', match: t => t.colCount === 6 && (t.headers[0]?.includes('農曆') || t.headers[0] === '#'), label: '12 月逐月' },
        { key: 'monthlyStar', match: t => t.colCount >= 5 && (t.headers[1]?.includes('整體') || t.headers[0] === '#'), label: '12 月星評分' },
        { key: 'lifeRhythm', match: t => t.headers[0]?.includes('年齡') || t.headers[0]?.includes('大運段') || t.headers[0]?.includes('年齡段'), label: '人生節奏總覽' },
      ];

      const tableMatches = {};
      for (const sig of signatures) {
        const match = tableInfo.find(t => sig.match(t));
        if (match) tableMatches[sig.key] = { ...match, label: sig.label };
      }

      log(`  found tables:`);
      Object.entries(tableMatches).forEach(([key, t]) => {
        log(`    ${key}: #${t.idx} (${t.label}) cols=${t.colCount} headers=[${t.headers.slice(0,5).join(',')}]`);
      });

      // for each match, scroll to it (use bounding rect since details now open) and screenshot viewport
      for (const [key, t] of Object.entries(tableMatches)) {
        const scrollResult = await page.evaluate((idx) => {
          const tables = document.querySelectorAll('table');
          const tb = tables[idx];
          if (!tb) return { ok: false };
          // Try scrollIntoView, then if didn't work, manual scroll
          tb.scrollIntoView({ block: 'center', behavior: 'instant' });
          const rect = tb.getBoundingClientRect();
          // ensure container also scrollLeft = 0 (col-1 visible)
          let parent = tb.parentElement;
          while (parent && parent !== document.body) {
            const cs = window.getComputedStyle(parent);
            if (cs.overflowX === 'auto' || cs.overflowX === 'scroll' || parent.classList.contains('table-breakout')) {
              parent.scrollLeft = 0;
              break;
            }
            parent = parent.parentElement;
          }
          return { ok: true, rectTop: rect.top, scrollY: window.scrollY };
        }, t.idx);
        await page.waitForTimeout(1000);
        const ssPath = path.join(ssDir, `${vp.name}_${key}_table${t.idx}.png`);
        await page.screenshot({ path: ssPath, fullPage: false });
        log(`    saved: ${path.basename(ssPath)} (scroll: rectTop=${scrollResult.rectTop} scrollY=${scrollResult.scrollY})`);
      }
    } catch (e) {
      log(`  ERROR: ${e.message}`);
    } finally {
      await ctx.close();
    }
  }
  await browser.close();
  log(`\nDone. screenshots in: ${ssDir}`);
})();
