// EYES v5.10.162 — Owner asked "did you actually look at the UI?" — capture 8 screenshots fast
const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);
const fs = require('fs');
const path = require('path');

const TOKENS = [
  { plan: 'C',   token: 'd143f949-192c-4808-a516-61b03a19f146' },
  { plan: 'D',   token: '4e636025-fb87-4099-a91d-a4f6c64df7e5' },
  { plan: 'G15', token: '271dcda0-e348-4d98-9c09-4beb14a4634a' },
  { plan: 'R',   token: '89e112dc-e0c1-4f0b-b8e8-5e5b51f6f8c7' },
];

const VIEWPORTS = [
  { name: 'desktop1440', width: 1440, height: 900 },
  { name: 'mobile375',   width: 375,  height: 812 },
];

const outDir = __dirname;

(async () => {
  const browser = await chromium.launch();
  const versionsFound = [];

  for (const t of TOKENS) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      const url = `https://jianyuan.life/report/${t.token}?cb=eyes_v5_10_162`;
      const tag = `${t.plan}/${vp.name}`;
      console.log(`[${tag}] navigate ${url}`);

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(3500);

        // Try wait for card-stack OR section heading (R might not have stacks)
        try {
          await Promise.race([
            page.waitForSelector('.report-card-stack', { timeout: 10000 }),
            page.waitForSelector('h2', { timeout: 10000 }),
          ]);
        } catch (e) {
          console.log(`  [${tag}] selector wait timeout: ${e.message}`);
        }

        const html = await page.content();
        const vMatch = html.match(/v?5\.10\.\d+/);
        const v = vMatch ? vMatch[0] : 'N/A';
        versionsFound.push({ plan: t.plan, viewport: vp.name, version: v });
        console.log(`  [${tag}] version-in-html: ${v}`);

        // Scroll to a middle area where wide tables / card stacks usually appear
        await page.evaluate(() => {
          const stacks = document.querySelectorAll('.report-card-stack');
          if (stacks.length >= 2) {
            stacks[1].scrollIntoView({ behavior: 'instant', block: 'start' });
            return;
          }
          const tables = document.querySelectorAll('table');
          if (tables.length >= 1) {
            tables[0].scrollIntoView({ behavior: 'instant', block: 'start' });
            return;
          }
          // R may not have stacks — go to ~30% of page
          window.scrollTo(0, Math.floor(document.body.scrollHeight * 0.3));
        });
        await page.waitForTimeout(800);

        const file = path.join(outDir, `${t.plan}_${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: false });
        console.log(`  [${tag}] saved ${file}`);
      } catch (e) {
        console.log(`  [${tag}] FAILED: ${e.message}`);
      } finally {
        await ctx.close();
      }
    }
  }

  await browser.close();
  fs.writeFileSync(
    path.join(outDir, 'versions.json'),
    JSON.stringify(versionsFound, null, 2),
  );
  console.log('\nDONE. versions:', JSON.stringify(versionsFound));
})();
