// 滾到 stack 在 viewport 中、用 viewport 截圖直接看
const path = require('path');
const fs = require('fs');
const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ssDir = 'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/_ab_test/strict_eval_v5_10_78/v5_10_158_viewport_card';
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  const tokens = [
    { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C', plan: 'C' },
    { id: '4e636025-fb87-4099-a91d-a4f6c64df7e5', name: 'D', plan: 'D' },
    { id: '271dcda0-e348-4d98-9c09-4beb14a4634a', name: 'G15', plan: 'G15' },
    { id: '116836df-55a9-4d9a-ac33-3aae5c8ea7f9', name: 'R', plan: 'R' },
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
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);
        await page.evaluate(() => {
          document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
        });
        await page.waitForTimeout(2000);

        const stacks = await page.$$('.report-card-stack');
        console.log(`  stacks: ${stacks.length}`);
        if (stacks.length === 0) {
          // 沒 stack — 找一個寬度極寬的內容、看是否有殘留 wide table
          const tableInfo = await page.evaluate(() => {
            const tables = document.querySelectorAll('table');
            return Array.from(tables).map(t => ({
              cols: t.rows[0]?.cells.length || 0,
              rows: t.rows.length,
              snippet: t.textContent.slice(0, 80)
            }));
          });
          console.log('  table info:', JSON.stringify(tableInfo).slice(0, 300));
          continue;
        }

        // 對每個 stack 滾到中央、截 viewport
        for (let i = 0; i < Math.min(stacks.length, 3); i++) {
          await page.evaluate((idx) => {
            const s = document.querySelectorAll('.report-card-stack')[idx];
            const r = s.getBoundingClientRect();
            const center = r.top + window.scrollY - (window.innerHeight / 2) + (r.height / 2);
            window.scrollTo({ top: center, behavior: 'instant' });
          }, i);
          await page.waitForTimeout(500);

          const ssA = path.join(ssDir, `${t.name}_${vp.name}_s${i}_viewport.png`);
          await page.screenshot({ path: ssA, fullPage: false });

          // 量寫資訊
          const info = await page.evaluate((idx) => {
            const s = document.querySelectorAll('.report-card-stack')[idx];
            const r = s.getBoundingClientRect();
            const cards = s.querySelectorAll(':scope > .report-card');
            const cardRect = cards[0]?.getBoundingClientRect();
            return {
              card_count: cards.length,
              stack_top: r.top, stack_height: r.height,
              first_card: cardRect ? { top: cardRect.top, h: cardRect.height, w: cardRect.width } : null,
              vp_h: window.innerHeight,
            };
          }, i);
          console.log(`  s[${i}] view (${info.card_count} cards):`, JSON.stringify(info).slice(0, 200));
        }

        // 再針對第一個 stack 第一張 card 滾到 viewport top + 50px
        await page.evaluate(() => {
          const c = document.querySelector('.report-card-stack > .report-card');
          if (c) {
            const r = c.getBoundingClientRect();
            window.scrollTo({ top: r.top + window.scrollY - 100, behavior: 'instant' });
          }
        });
        await page.waitForTimeout(500);
        const ssC = path.join(ssDir, `${t.name}_${vp.name}_first_card_view.png`);
        await page.screenshot({ path: ssC, fullPage: false });
        console.log(`  first card viewport saved`);
      } catch (e) {
        console.log(`  ERROR: ${e.message.slice(0, 200)}`);
      } finally {
        await ctx.close();
      }
    }
  }
  await browser.close();
})();
