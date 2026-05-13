// DS1 R2 — capture v5.10.156 typography screenshots for re-eval
const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);
const fs = require('fs');

const TOKENS = [
  { name: 'C_HoYouChun', token: 'd143f949-192c-4808-a516-61b03a19f146' },
];

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const outDir = __dirname + '/DS1_R2_screenshots';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const results = [];
  for (const t of TOKENS) {
    const page = await ctx.newPage();
    const url = `https://jianyuan.life/report/${t.token}?cb=v5_10_156_R2`;
    console.log(`[${t.name}] navigate ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(5000);
      // wait for report content to render
      try { await page.waitForSelector('.report-p', { timeout: 15000 }); }
      catch (e) { console.log('  warning: .report-p not found within 15s'); }
      // version check
      const html = await page.content();
      const versionMatch = html.match(/5\.10\.\d+/);
      const versionFound = versionMatch ? versionMatch[0] : 'N/A';
      console.log(`[${t.name}] version found: ${versionFound}`);

      // measure typography
      const metrics = await page.evaluate(() => {
        const p = document.querySelector('.report-p');
        const h2 = document.querySelector('h2.report-h2, .report-h2');
        const h3 = document.querySelector('.report-h3');
        const get = (el) => el ? {
          fontSize: getComputedStyle(el).fontSize,
          lineHeight: getComputedStyle(el).lineHeight,
          marginTop: getComputedStyle(el).marginTop,
          marginBottom: getComputedStyle(el).marginBottom,
          fontWeight: getComputedStyle(el).fontWeight,
          color: getComputedStyle(el).color,
        } : null;
        return { p: get(p), h2: get(h2), h3: get(h3) };
      });
      console.log(`[${t.name}] metrics:`, JSON.stringify(metrics, null, 2));

      // top screenshot (first viewport)
      await page.screenshot({
        path: `${outDir}/${t.name}_desktop_top.png`,
        fullPage: false,
      });
      // mid scroll
      await page.evaluate(() => window.scrollTo(0, 2000));
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: `${outDir}/${t.name}_desktop_mid.png`,
        fullPage: false,
      });
      // deep scroll
      await page.evaluate(() => window.scrollTo(0, 5000));
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: `${outDir}/${t.name}_desktop_deep.png`,
        fullPage: false,
      });
      // very deep
      await page.evaluate(() => window.scrollTo(0, 10000));
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: `${outDir}/${t.name}_desktop_far.png`,
        fullPage: false,
      });
      results.push({ token: t.token, version: versionFound, metrics });
    } catch (err) {
      console.error(`[${t.name}] ERR ${err.message}`);
      results.push({ token: t.token, error: err.message });
    } finally {
      await page.close();
    }
  }
  fs.writeFileSync(`${outDir}/_metrics.json`, JSON.stringify(results, null, 2));
  await browser.close();
  console.log('DONE — output to', outDir);
}

run().catch(e => { console.error(e); process.exit(1); });
