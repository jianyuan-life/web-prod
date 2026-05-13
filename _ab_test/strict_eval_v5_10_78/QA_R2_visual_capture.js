// QA R2 visual capture — scroll into card stack and shot the element
const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);
const path = require('path');
const outDir = path.join(__dirname, 'QA_R2_v5_10_162_artifacts');

(async () => {
  const browser = await chromium.launch();
  for (const vp of [{ n: 'desktop1440', w: 1440, h: 900 }, { n: 'mobile375', w: 375, h: 812 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await page.goto('https://jianyuan.life/report/d143f949-192c-4808-a516-61b03a19f146?cb=qa_r2_visual', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(4000);
    await page.waitForSelector('.report-card-stack', { timeout: 15000 });

    // accept / dismiss cookie banner if present
    try {
      const acceptBtn = await page.$('text=/全部接受|接受/');
      if (acceptBtn) { await acceptBtn.click(); await page.waitForTimeout(800); }
    } catch (e) {}

    // pick a stack that has cards with rows
    const targetIdx = await page.evaluate(() => {
      const stacks = Array.from(document.querySelectorAll('.report-card-stack'));
      for (let i = 0; i < stacks.length; i++) {
        const cards = stacks[i].querySelectorAll('.report-card');
        for (const c of cards) {
          if (c.querySelectorAll('div[style*="display:flex"]').length > 0) return i;
        }
      }
      return 0;
    });

    // scroll to that stack
    await page.evaluate((idx) => {
      const stacks = document.querySelectorAll('.report-card-stack');
      const target = stacks[idx];
      if (target) target.scrollIntoView({ block: 'center' });
    }, targetIdx);
    await page.waitForTimeout(800);

    // shot the element directly
    const stack = (await page.$$('.report-card-stack'))[targetIdx];
    if (stack) {
      await stack.screenshot({ path: `${outDir}/${vp.n}_stack${targetIdx}_real.png` });
      console.log(`[${vp.n}] saved stack${targetIdx} screenshot`);
    }

    // also shot first .report-card with rows
    const card = await page.evaluateHandle(() => {
      const cards = document.querySelectorAll('.report-card');
      for (const c of cards) {
        if (c.querySelectorAll('div[style*="display:flex"]').length > 0) return c;
      }
      return null;
    });
    if (card.asElement()) {
      await card.asElement().screenshot({ path: `${outDir}/${vp.n}_card_with_rows.png` });
      console.log(`[${vp.n}] saved card_with_rows screenshot`);
    }

    await ctx.close();
  }
  await browser.close();
})();
