// QA R2 v5.10.162 — inspect raw card innerHTML
const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('https://jianyuan.life/report/d143f949-192c-4808-a516-61b03a19f146?cb=qa_r2_inner', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  const result = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.report-card'));
    if (!cards.length) return { err: 'no cards' };
    return {
      totalCards: cards.length,
      sample0Html: cards[0].outerHTML.slice(0, 1500),
      sample1Html: cards[1] ? cards[1].outerHTML.slice(0, 1500) : null,
      sample10Html: cards[10] ? cards[10].outerHTML.slice(0, 1500) : null,
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
