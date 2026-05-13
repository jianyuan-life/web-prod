// Measure actual paragraph width on v5.10.156 desktop 1440
const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('https://jianyuan.life/report/d143f949-192c-4808-a516-61b03a19f146?cb=measure', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);
  try { await page.waitForSelector('.report-p', { timeout: 15000 }); } catch (e) {}

  // Scroll to mid for actual content
  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(1000);

  const data = await page.evaluate(() => {
    const ps = Array.from(document.querySelectorAll('.report-p > p, .report-p'));
    const samples = ps.slice(0, 8).map(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        tag: el.tagName,
        width: Math.round(r.width),
        text: el.textContent?.slice(0, 50) || '',
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        marginBottom: cs.marginBottom,
        maxWidth: cs.maxWidth,
      };
    });
    const h3s = Array.from(document.querySelectorAll('.report-h3')).slice(0, 3).map(el => {
      const cs = getComputedStyle(el);
      return {
        text: el.textContent?.slice(0, 30) || '',
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        marginTop: cs.marginTop,
        marginBottom: cs.marginBottom,
        fontWeight: cs.fontWeight,
      };
    });
    const h2s = Array.from(document.querySelectorAll('h2.report-h2, .report-h2, .report-main h2')).slice(0, 3).map(el => {
      const cs = getComputedStyle(el);
      return {
        text: el.textContent?.slice(0, 30) || '',
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight,
        marginTop: cs.marginTop,
        marginBottom: cs.marginBottom,
      };
    });
    const main = document.querySelector('.report-main');
    const mainW = main ? Math.round(main.getBoundingClientRect().width) : null;
    return { samples, h3s, h2s, mainW };
  });
  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})();
