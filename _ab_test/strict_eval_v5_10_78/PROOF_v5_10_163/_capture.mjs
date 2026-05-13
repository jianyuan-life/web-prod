import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const OUT = 'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/_ab_test/strict_eval_v5_10_78/PROOF_v5_10_163';
const BASE = 'https://jianyuan.life';

const TARGETS = [
  { token: 'd143f949-192c-4808-a516-61b03a19f146', plan: 'C',   name: 'C_d143f949' },
  { token: '64b15504-b3c4-4153-aff6-3f279363dc7e', plan: 'C',   name: 'C_64b15504' },
  { token: 'bf9e30da-eaba-4efd-95ec-1e5e3b8e30f9', plan: 'C',   name: 'C_bf9e30da' },
  { token: '9b6edb0a-f1db-4484-8306-c088e78be8c8', plan: 'G15', name: 'G15_9b6edb0a' }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 1) Check landing page version
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  const landingHTML = await page.content();
  const versionMatch = landingHTML.match(/v?5\.10\.\d+/g);
  const footerVersion = await page.evaluate(() => {
    const txt = document.body.innerText;
    const m = txt.match(/v?5\.10\.\d+/);
    return m ? m[0] : 'NOT_FOUND';
  });
  console.log('VERSION_LANDING:', versionMatch?.slice(0,3) || 'none', '| FOOTER:', footerVersion);

  const summary = { version_landing: versionMatch?.slice(0,3) || [], footer: footerVersion, screenshots: [] };

  for (const t of TARGETS) {
    const url = `${BASE}/report/${t.token}`;
    console.log(`\n=== ${t.name} (${t.plan}) ===`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(2000);

      // Find Card Stack
      const cardStackInfo = await page.evaluate(() => {
        const stacks = Array.from(document.querySelectorAll('.report-card-stack'));
        const tables = Array.from(document.querySelectorAll('.table-breakout-outer, table'));
        return {
          card_stack_count: stacks.length,
          table_count: tables.length,
          first_stack: stacks[0] ? {
            offsetLeft: stacks[0].offsetLeft,
            offsetWidth: stacks[0].offsetWidth,
            parentWidth: stacks[0].parentElement?.offsetWidth || 0,
            maxWidth: getComputedStyle(stacks[0]).maxWidth,
            margin: getComputedStyle(stacks[0]).margin,
            text_preview: stacks[0].innerText?.slice(0, 100) || ''
          } : null
        };
      });
      console.log(JSON.stringify(cardStackInfo, null, 2));

      // Scroll to first card-stack or table
      const scrolled = await page.evaluate(() => {
        const target = document.querySelector('.report-card-stack') || document.querySelector('.table-breakout-outer') || document.querySelector('table');
        if (target) {
          target.scrollIntoView({ behavior: 'instant', block: 'center' });
          return { found: true, tag: target.tagName, cls: target.className?.slice(0,80) };
        }
        return { found: false };
      });
      console.log('SCROLL:', JSON.stringify(scrolled));
      await page.waitForTimeout(1000);

      // Full page screenshot of viewport
      const fp = path.join(OUT, `${t.name}_viewport.png`);
      await page.screenshot({ path: fp, fullPage: false });
      console.log('SAVED viewport:', fp);

      // Try focused screenshot of first card-stack
      const focused = await page.locator('.report-card-stack').first();
      if (await focused.count() > 0) {
        const fp2 = path.join(OUT, `${t.name}_card_stack.png`);
        await focused.screenshot({ path: fp2 });
        console.log('SAVED card_stack:', fp2);
      }

      // Try focused screenshot of first table
      const tbl = await page.locator('.table-breakout-outer, table').first();
      if (await tbl.count() > 0) {
        const fp3 = path.join(OUT, `${t.name}_table.png`);
        await tbl.screenshot({ path: fp3 });
        console.log('SAVED table:', fp3);
      }

      // Scroll to "節奏" or "12 個月" or "矩陣" sections
      const sectionScroll = await page.evaluate(() => {
        const allText = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
        const keywords = ['節奏', '12 個月', '12個月', '矩陣', '系統', '人生', '月運'];
        const found = [];
        for (const kw of keywords) {
          const el = allText.find(e => e.innerText?.includes(kw));
          if (el) found.push({ kw, tag: el.tagName, text: el.innerText?.slice(0, 50) });
        }
        return found;
      });
      console.log('SECTIONS:', JSON.stringify(sectionScroll));

      // Scroll to first matching section and screenshot
      for (const sec of sectionScroll.slice(0, 3)) {
        try {
          const headEl = await page.locator(`${sec.tag.toLowerCase()}:has-text("${sec.kw}")`).first();
          if (await headEl.count() > 0) {
            await headEl.scrollIntoViewIfNeeded();
            await page.waitForTimeout(800);
            const safeName = sec.kw.replace(/[^a-zA-Z0-9一-龥]/g, '_');
            const fp4 = path.join(OUT, `${t.name}_section_${safeName}.png`);
            await page.screenshot({ path: fp4, fullPage: false });
            console.log(`SAVED section ${sec.kw}:`, fp4);
          }
        } catch (e) {
          console.log(`section ${sec.kw} skip:`, e.message?.slice(0,60));
        }
      }

      summary.screenshots.push({ name: t.name, ok: true, ...cardStackInfo });
    } catch (err) {
      console.log('ERROR:', err.message);
      summary.screenshots.push({ name: t.name, ok: false, error: err.message });
    }
  }

  fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 2));
  await browser.close();
  console.log('\nDONE. Summary at', path.join(OUT, '_summary.json'));
})();
