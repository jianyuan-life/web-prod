// 檢查 .report-card 類在頁面中的多重使用
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

  const info = await page.evaluate(() => {
    const allCards = document.querySelectorAll('.report-card');
    const insideStack = document.querySelectorAll('.report-card-stack .report-card');
    const outsideStack = Array.from(allCards).filter(c => !c.closest('.report-card-stack'));

    return {
      total_report_card_class: allCards.length,
      inside_stack: insideStack.length,
      outside_stack: outsideStack.length,
      outside_samples: outsideStack.slice(0, 3).map(el => ({
        tag: el.tagName,
        text: el.textContent.slice(0, 60),
        parent: el.parentElement?.className.slice(0, 80),
      })),
    };
  });
  console.log(JSON.stringify(info, null, 2));

  // 試:只截 .report-card-stack > .report-card 第 1 個
  const realCard = await page.$('.report-card-stack > .report-card');
  if (realCard) {
    await realCard.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await realCard.screenshot({ path: 'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/_ab_test/strict_eval_v5_10_78/v5_10_158_REAL_CARD0.png' });
    const box = await realCard.boundingBox();
    console.log('REAL card[0] saved, box:', box);
  }

  // 第 2 個 stack 的第 1 個 card
  const stacks = await page.$$('.report-card-stack');
  for (let s = 0; s < stacks.length; s++) {
    const c = await stacks[s].$('.report-card');
    if (c) {
      await c.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await c.screenshot({ path: `D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/_ab_test/strict_eval_v5_10_78/v5_10_158_REAL_stack${s}_card0.png` });
      const box = await c.boundingBox();
      console.log(`stack[${s}] real card[0] saved, box:`, box);
    }
  }

  await browser.close();
})();
