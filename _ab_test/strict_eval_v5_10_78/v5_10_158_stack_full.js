// 截每個 stack 完整 + 第 1 + 2 個 card 各自獨立
const path = require('path');
const fs = require('fs');
const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const TOKENS = [
  { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C_HoYouChun', plan: 'C' },
];

const VIEWPORTS = [
  { name: 'desktop_1440', width: 1440, height: 900 },
  { name: 'mobile_375',   width: 375,  height: 812 },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ssDir = path.join(__dirname, 'v5_10_158_stack_full');
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  for (const t of TOKENS) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const url = `https://jianyuan.life/report/${t.id}?cb=full_${Date.now()}`;
      console.log(`\n=== ${t.name} ${vp.name} ===`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);
        await page.evaluate(() => {
          document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
        });
        await page.waitForTimeout(2000);

        const stacks = await page.$$('.report-card-stack');
        console.log(`  ${stacks.length} stacks`);

        for (let i = 0; i < stacks.length; i++) {
          // 每個 stack 截整體
          try {
            await stacks[i].scrollIntoViewIfNeeded();
            await page.waitForTimeout(200);
            const ssA = path.join(ssDir, `${t.name}_${vp.name}_stack${i}_FULL.png`);
            await stacks[i].screenshot({ path: ssA });
            const cards = await stacks[i].$$('.report-card');
            const box = await stacks[i].boundingBox();
            console.log(`  stack[${i}] full saved (${cards.length} cards, ${box?.width.toFixed(0)}x${box?.height.toFixed(0)}px): ${ssA}`);

            // 第 1 個 card 獨立截
            if (cards.length > 0) {
              await cards[0].scrollIntoViewIfNeeded();
              await page.waitForTimeout(200);
              const ssB = path.join(ssDir, `${t.name}_${vp.name}_stack${i}_card0.png`);
              await cards[0].screenshot({ path: ssB });
              const cardBox = await cards[0].boundingBox();
              console.log(`    card[0]: ${cardBox?.width.toFixed(0)}x${cardBox?.height.toFixed(0)}`);
            }
            // 第 2 個 card 獨立截(看連續性)
            if (cards.length > 1) {
              await cards[1].scrollIntoViewIfNeeded();
              await page.waitForTimeout(200);
              const ssC = path.join(ssDir, `${t.name}_${vp.name}_stack${i}_card1.png`);
              await cards[1].screenshot({ path: ssC });
            }
          } catch (e) {
            console.log(`  stack[${i}] err:`, e.message.slice(0, 100));
          }
        }
      } catch (e) {
        console.log(`  ERROR: ${e.message.slice(0, 200)}`);
      } finally {
        await ctx.close();
      }
    }
  }
  await browser.close();
})();
