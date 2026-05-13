// Final screenshot after horizontal scroll (proves sticky works)
const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);
const path = require('path');

const URL = 'https://jianyuan.life/report/d143f949-192c-4808-a516-61b03a19f146';
const OUT = 'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/_ab_test/strict_eval_v5_10_78';

async function snap(name, viewport) {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  // scroll first table-breakout horizontally + scroll page to that table region
  const tableInfo = await page.evaluate(() => {
    const t = document.querySelector('.table-breakout');
    if (!t) return null;
    t.scrollIntoView({ behavior: 'instant', block: 'center' });
    t.scrollBy({ left: 500, top: 0, behavior: 'instant' });
    const r = t.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, scrollLeft: t.scrollLeft };
  });
  await page.waitForTimeout(300);

  if (tableInfo) {
    // crop screenshot near the table
    const clip = {
      x: Math.max(0, tableInfo.x - 10),
      y: Math.max(0, tableInfo.y - 30),
      width: Math.min(viewport.width - tableInfo.x + 10, tableInfo.w + 20),
      height: Math.min(400, tableInfo.h + 60),
    };
    const filePath = path.join(OUT, `v5_10_150_sticky_verify_${name}_scrolled.png`);
    await page.screenshot({ path: filePath, clip });
    console.log(JSON.stringify({ name, viewport, tableInfo, screenshot: filePath }, null, 2));
  } else {
    console.log(JSON.stringify({ name, error: 'no .table-breakout' }, null, 2));
  }
  await browser.close();
}

(async () => {
  await snap('desktop', { width: 1440, height: 900 });
  await snap('mobile', { width: 375, height: 812 });
})();
