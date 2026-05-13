// 滾到 stack 後立刻量、立刻截
const path = require('path');
const fs = require('fs');
const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ssDir = 'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/_ab_test/strict_eval_v5_10_78/v5_10_158_simple';
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  const tokens = [
    { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C', plan: 'C' },
  ];
  const vps = [
    { name: 'd1440', width: 1440, height: 900 },
    { name: 'm375',  width: 375,  height: 812 },
  ];

  for (const t of tokens) {
    for (const vp of vps) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const url = `https://jianyuan.life/report/${t.id}?cb=${Date.now()}`;
      console.log(`\n=== ${t.name} ${vp.name} ===`);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(5000);
        // 不展開 details,先量原始位置
        const stackInfo = await page.evaluate(() => {
          const stacks = document.querySelectorAll('.report-card-stack');
          return Array.from(stacks).slice(0, 4).map((s, i) => {
            const r = s.getBoundingClientRect();
            return { idx: i, top_abs: r.top + window.scrollY, h: r.height, w: r.width };
          });
        });
        console.log('  initial stacks:', JSON.stringify(stackInfo));

        // 為了確保不展開後內容穩定、scrollIntoView 第 1 個 stack
        await page.evaluate(() => {
          const s = document.querySelector('.report-card-stack');
          if (s) s.scrollIntoView({ block: 'start', behavior: 'instant' });
        });
        await page.waitForTimeout(800);

        // 立刻截 viewport
        const ssA = path.join(ssDir, `${t.name}_${vp.name}_NO_DETAILS_s0.png`);
        await page.screenshot({ path: ssA, fullPage: false });
        console.log(`  saved: ${ssA}`);

        // 滾下 1 個 viewport(看下一段)
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(500);
        const ssB = path.join(ssDir, `${t.name}_${vp.name}_NO_DETAILS_s0_p2.png`);
        await page.screenshot({ path: ssB, fullPage: false });
        console.log(`  saved p2: ${ssB}`);

        // 再滾下
        await page.evaluate(() => window.scrollBy(0, window.innerHeight));
        await page.waitForTimeout(500);
        const ssC = path.join(ssDir, `${t.name}_${vp.name}_NO_DETAILS_s0_p3.png`);
        await page.screenshot({ path: ssC, fullPage: false });
        console.log(`  saved p3: ${ssC}`);
      } catch (e) {
        console.log(`  ERROR: ${e.message.slice(0, 200)}`);
      } finally {
        await ctx.close();
      }
    }
  }
  await browser.close();
})();
