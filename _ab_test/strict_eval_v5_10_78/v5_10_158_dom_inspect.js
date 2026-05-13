// Inspect actual .report-card-stack DOM structure
const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const url = 'https://jianyuan.life/report/d143f949-192c-4808-a516-61b03a19f146?cb=' + Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(7000);
  await page.evaluate(() => {
    document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
  });
  await page.waitForTimeout(2000);

  const inspect = await page.evaluate(() => {
    const stacks = document.querySelectorAll('.report-card-stack');
    const out = [];
    stacks.forEach((s, i) => {
      out.push({
        idx: i,
        outerHTML_first_500: s.outerHTML.slice(0, 500),
        children_count: s.children.length,
        children_classes: Array.from(s.children).slice(0, 5).map(c => c.className),
        children_tags: Array.from(s.children).slice(0, 5).map(c => c.tagName),
        text_first_200: s.textContent.slice(0, 200),
      });
    });
    return out;
  });
  console.log(JSON.stringify(inspect, null, 2));

  // 也檢查所有寬表(≥ 5 col)是否還在 — 若版本 5.10.159+ 是不是寬表全部都 stack 了?
  const wideTables = await page.evaluate(() => {
    const tables = document.querySelectorAll('table');
    const wides = [];
    tables.forEach(t => {
      const cols = t.rows[0]?.cells.length || 0;
      if (cols >= 5) wides.push({ cols, html_first_300: t.outerHTML.slice(0, 300) });
    });
    return { total: tables.length, wides };
  });
  console.log('\n=== WIDE TABLES (≥5 col) ===');
  console.log(JSON.stringify(wideTables, null, 2));

  await browser.close();
})();
