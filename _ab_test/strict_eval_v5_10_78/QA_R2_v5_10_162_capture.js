// QA R2 v5.10.162 — verify P1×3 fixes (title 18px / max-width 800px / label cream-55)
const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);
const fs = require('fs');
const path = require('path');

const TOKENS = [
  { name: 'C_HoYouChun', token: 'd143f949-192c-4808-a516-61b03a19f146' },
];

const VIEWPORTS = [
  { name: 'desktop1440', width: 1440, height: 900 },
  { name: 'mobile375',  width: 375,  height: 812 },
];

const outDir = path.join(__dirname, 'QA_R2_v5_10_162_artifacts');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

async function run() {
  const browser = await chromium.launch();
  const allResults = [];

  for (const t of TOKENS) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
      });
      const page = await ctx.newPage();
      const url = `https://jianyuan.life/report/${t.token}?cb=qa_r2_v5_10_162`;
      console.log(`[${t.name}/${vp.name}] navigate ${url}`);
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
        await page.waitForTimeout(4000);
        try { await page.waitForSelector('.report-card-stack', { timeout: 15000 }); }
        catch (e) { console.log('  warning: .report-card-stack not found within 15s'); }

        // version inside HTML (best-effort)
        const html = await page.content();
        const versionMatch = html.match(/v?5\.10\.\d+/);
        const versionFound = versionMatch ? versionMatch[0] : 'N/A';

        // Measure all card stacks + cards + labels
        const data = await page.evaluate(() => {
          const stacks = document.querySelectorAll('.report-card-stack');
          const cards = document.querySelectorAll('.report-card');
          const stackInfo = Array.from(stacks).map((s, i) => {
            const cs = getComputedStyle(s);
            return {
              idx: i,
              maxWidth: cs.maxWidth,
              offsetWidth: s.offsetWidth,
              clientWidth: s.clientWidth,
              cardCount: s.querySelectorAll('.report-card').length,
            };
          });
          const cardSamples = Array.from(cards).slice(0, 5).map((c, i) => {
            const h4 = c.querySelector('h4');
            const labels = c.querySelectorAll('[role="listitem"] > span:first-child');
            const values = c.querySelectorAll('[role="listitem"] > span:last-child');
            const h4Style = h4 ? getComputedStyle(h4) : null;
            const lblStyle = labels.length ? getComputedStyle(labels[0]) : null;
            const valStyle = values.length ? getComputedStyle(values[0]) : null;
            return {
              idx: i,
              cardWidth: c.offsetWidth,
              title: h4 ? h4.textContent.trim().slice(0, 30) : null,
              titleFontSize: h4Style ? h4Style.fontSize : null,
              titleColor: h4Style ? h4Style.color : null,
              titleFontWeight: h4Style ? h4Style.fontWeight : null,
              titleLineHeight: h4Style ? h4Style.lineHeight : null,
              labelText: labels.length ? labels[0].textContent.trim().slice(0, 20) : null,
              labelColor: lblStyle ? lblStyle.color : null,
              labelFontSize: lblStyle ? lblStyle.fontSize : null,
              labelFontWeight: lblStyle ? lblStyle.fontWeight : null,
              labelLetterSpacing: lblStyle ? lblStyle.letterSpacing : null,
              valueColor: valStyle ? valStyle.color : null,
              valueFontSize: valStyle ? valStyle.fontSize : null,
              rowCount: c.querySelectorAll('[role="listitem"]').length,
            };
          });
          // page horizontal overflow check
          const overflowX = document.documentElement.scrollWidth > document.documentElement.clientWidth;
          // truncated cells
          const truncatedCells = Array.from(document.querySelectorAll('.report-card [role="listitem"]')).filter(el => {
            return el.scrollWidth > el.clientWidth + 1;
          }).length;
          return { stacks: stackInfo, cardSamples, overflowX, truncatedCells, totalCards: cards.length };
        });

        console.log(`[${t.name}/${vp.name}] version: ${versionFound}`);
        console.log(`[${t.name}/${vp.name}] data:`, JSON.stringify(data, null, 2));

        // Screenshots
        // Top
        await page.screenshot({ path: `${outDir}/${t.name}_${vp.name}_top.png`, fullPage: false });
        // Scroll to first card stack
        const stackY = await page.evaluate(() => {
          const s = document.querySelector('.report-card-stack');
          if (!s) return 0;
          const rect = s.getBoundingClientRect();
          return window.scrollY + rect.top - 100;
        });
        if (stackY > 0) {
          await page.evaluate((y) => window.scrollTo(0, y), stackY);
          await page.waitForTimeout(800);
          await page.screenshot({ path: `${outDir}/${t.name}_${vp.name}_stack0.png`, fullPage: false });
          // element-level shot of first stack
          const firstStack = await page.$('.report-card-stack');
          if (firstStack) {
            await firstStack.screenshot({ path: `${outDir}/${t.name}_${vp.name}_stack0_element.png` });
          }
        }
        // mid scroll
        await page.evaluate(() => window.scrollTo(0, 4000));
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${outDir}/${t.name}_${vp.name}_mid.png`, fullPage: false });

        allResults.push({ token: t.token, viewport: vp, version: versionFound, data });
      } catch (err) {
        console.error(`[${t.name}/${vp.name}] error:`, err.message);
        allResults.push({ token: t.token, viewport: vp, error: err.message });
      } finally {
        await ctx.close();
      }
    }
  }
  await browser.close();
  fs.writeFileSync(`${outDir}/qa_r2_results.json`, JSON.stringify(allResults, null, 2));
  console.log(`\n[OK] all results saved to ${outDir}/qa_r2_results.json`);
}

run().catch(e => { console.error('FATAL', e); process.exit(1); });
