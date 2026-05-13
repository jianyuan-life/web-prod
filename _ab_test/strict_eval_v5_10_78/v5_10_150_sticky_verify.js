// v5.10.150 sticky col-1 真生效驗證
// FAST 5min eval - desktop 1440 + mobile 375
const path = require('path');

const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);

const URL = 'https://jianyuan.life/report/d143f949-192c-4808-a516-61b03a19f146';
const OUT_DIR = 'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/_ab_test/strict_eval_v5_10_78';

async function verify(viewportName, viewport) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();

  const result = {
    viewport: viewportName,
    width: viewport.width,
    height: viewport.height,
    found_table_breakout: false,
    table_count: 0,
    th_position: null,
    td_position: null,
    td_left: null,
    td_bg: null,
    scroll_test: null,
    screenshot: null,
    error: null,
  };

  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Find any .table-breakout
    const tables = await page.$$('.table-breakout');
    result.table_count = tables.length;
    result.found_table_breakout = tables.length > 0;

    if (tables.length === 0) {
      throw new Error('no .table-breakout found on page');
    }

    // Diagnostic: drill into inner <table> for thead lookup
    const diag = [];
    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      const innerTable = await t.$('table');
      let info = { idx: i, hasInnerTable: !!innerTable };
      if (innerTable) {
        const th = await innerTable.$('thead > tr > th:first-child');
        const td = await innerTable.$('tbody > tr > td:first-child');
        info.hasTh = !!th;
        info.hasTd = !!td;
        if (th) {
          info.thDisplay = await th.evaluate(el => getComputedStyle(el).display);
          info.thPosition = await th.evaluate(el => getComputedStyle(el).position);
          info.thLeft = await th.evaluate(el => getComputedStyle(el).left);
          info.thBg = await th.evaluate(el => getComputedStyle(el).backgroundColor);
        }
        if (td) {
          info.tdDisplay = await td.evaluate(el => getComputedStyle(el).display);
          info.tdPosition = await td.evaluate(el => getComputedStyle(el).position);
          info.tdLeft = await td.evaluate(el => getComputedStyle(el).left);
          info.tdBg = await td.evaluate(el => getComputedStyle(el).backgroundColor);
        }
      }
      diag.push(info);
    }
    result.diag_tables = diag;

    // Pick first table where both th + td are visible (table-cell mode = desktop)
    let targetTable = null;
    let targetThead = null;
    let targetTd = null;
    for (const t of tables) {
      const innerTable = await t.$('table');
      if (!innerTable) continue;
      const th = await innerTable.$('thead > tr > th:first-child');
      const td = await innerTable.$('tbody > tr > td:first-child');
      if (th && td) {
        const thDisplay = await th.evaluate(el => getComputedStyle(el).display);
        const tdDisplay = await td.evaluate(el => getComputedStyle(el).display);
        if (thDisplay !== 'none' && (tdDisplay === 'table-cell' || tdDisplay === 'table-cell-group')) {
          targetTable = t;
          targetThead = th;
          targetTd = td;
          break;
        }
      }
    }
    // fallback - any td
    if (!targetTable) {
      for (const t of tables) {
        const innerTable = await t.$('table');
        if (!innerTable) continue;
        const td = await innerTable.$('tbody > tr > td:first-child');
        if (td) {
          targetTable = t;
          targetTd = td;
          break;
        }
      }
    }

    if (!targetTable) throw new Error('no usable table with col-1 cells');

    // 4 項 getComputedStyle
    if (targetThead) {
      result.th_position = await targetThead.evaluate(el => getComputedStyle(el).position);
    } else {
      result.th_position = 'N/A (mobile thead hidden)';
    }
    result.td_position = await targetTd.evaluate(el => getComputedStyle(el).position);
    result.td_left = await targetTd.evaluate(el => getComputedStyle(el).left);
    result.td_bg = await targetTd.evaluate(el => getComputedStyle(el).backgroundColor);

    // 水平滾動測試 - find scroll container (table-breakout has overflow-x:auto)
    // scroll the .table-breakout container, then verify col-1 still left
    const beforeRect = await targetTd.boundingBox();
    const containerRectBefore = await targetTable.boundingBox();

    await targetTable.evaluate(el => {
      // find the scrolling ancestor (likely the .table-breakout itself)
      el.scrollBy({ left: 500, top: 0, behavior: 'instant' });
    });
    await page.waitForTimeout(500);

    const afterRect = await targetTd.boundingBox();
    const containerRectAfter = await targetTable.boundingBox();

    result.scroll_test = {
      td_before_left: beforeRect ? beforeRect.x : null,
      td_after_left: afterRect ? afterRect.x : null,
      container_left: containerRectAfter ? containerRectAfter.x : null,
      // sticky should keep td.left ≈ container.left after scroll
      td_offset_from_container: (afterRect && containerRectAfter)
        ? afterRect.x - containerRectAfter.x
        : null,
      sticky_works: (afterRect && containerRectAfter)
        ? Math.abs(afterRect.x - containerRectAfter.x) <= 5
        : false,
      scroll_left_after: await targetTable.evaluate(el => el.scrollLeft),
    };

    // Screenshot
    const screenshotPath = path.join(OUT_DIR, `v5_10_150_sticky_verify_${viewportName}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    result.screenshot = screenshotPath;
  } catch (e) {
    result.error = e.message;
  }

  await browser.close();
  return result;
}

(async () => {
  const desktop = await verify('desktop', { width: 1440, height: 900 });
  const mobile = await verify('mobile', { width: 375, height: 812 });
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
})().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
