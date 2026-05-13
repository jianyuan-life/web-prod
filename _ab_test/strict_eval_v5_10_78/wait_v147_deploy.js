// 等 v5.10.147 production 切換完成
const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const REQUIRED = 'v5.10.147';
const TOKEN = 'd143f949-192c-4808-a516-61b03a19f146';
const MAX_ATTEMPTS = 30;
const INTERVAL_MS = 25000;

(async () => {
  const browser = await chromium.launch({ headless: true });
  for (let i = 1; i <= MAX_ATTEMPTS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const url = `https://jianyuan.life/report/${TOKEN}?cb=wait_${Date.now()}`;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(5000);
      const versions = await page.evaluate(() => {
        const matches = (document.body.innerText.match(/v5\.\d+\.\d+/g) || []);
        return [...new Set(matches)];
      });
      const has147 = versions.some(v => {
        const p = v.replace('v','').split('.').map(Number);
        return p[0]===5 && p[1]===10 && p[2]>=147;
      });
      const highest = versions.sort((a,b) => {
        const pa=a.replace('v','').split('.').map(Number);
        const pb=b.replace('v','').split('.').map(Number);
        for (let i=0;i<3;i++) if (pa[i]!==pb[i]) return pb[i]-pa[i];
        return 0;
      })[0] || 'none';
      console.log(`[${i}/${MAX_ATTEMPTS}] highest=${highest} (all: ${versions.join(',')})`);
      await ctx.close();
      if (has147) {
        console.log(`\n✅ v5.10.147 LIVE after ${i} attempts`);
        await browser.close();
        process.exit(0);
      }
    } catch (e) {
      console.log(`[${i}/${MAX_ATTEMPTS}] error: ${e.message}`);
      await ctx.close();
    }
    if (i < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
  console.log(`\n❌ TIMEOUT — v5.10.147 not live after ${MAX_ATTEMPTS} attempts`);
  await browser.close();
  process.exit(1);
})();
