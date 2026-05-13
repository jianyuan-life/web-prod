// 用 page-level screenshot + 絕對座標 clip(避開 element.screenshot bug)
const path = require('path');
const fs = require('fs');
const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ssDir = 'D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門/_ab_test/strict_eval_v5_10_78/v5_10_158_abs_clip';
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  const tokens = [
    { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C_HoYouChun', plan: 'C' },
  ];
  const vps = [
    { name: 'desktop_1440', width: 1440, height: 900 },
    { name: 'mobile_375',   width: 375,  height: 812 },
  ];

  for (const t of tokens) {
    for (const vp of vps) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const url = `https://jianyuan.life/report/${t.id}?cb=abs_${Date.now()}`;
      console.log(`\n=== ${t.name} ${vp.name} ===`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);
        await page.evaluate(() => {
          document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
        });
        await page.waitForTimeout(2000);

        // 拿絕對座標(getBoundingClientRect + window.scrollY)
        const stackInfo = await page.evaluate(() => {
          const stacks = document.querySelectorAll('.report-card-stack');
          return Array.from(stacks).map((s, i) => {
            const r = s.getBoundingClientRect();
            const cards = s.querySelectorAll(':scope > .report-card');
            const cardBoxes = Array.from(cards).slice(0, 3).map(c => {
              const cr = c.getBoundingClientRect();
              return { x: cr.left + window.scrollX, y: cr.top + window.scrollY, w: cr.width, h: cr.height };
            });
            return {
              idx: i,
              stack_abs: { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height },
              card_count: cards.length,
              card_boxes: cardBoxes,
            };
          });
        });
        console.log('  stack info:', JSON.stringify(stackInfo, null, 2).slice(0, 1500));

        for (const s of stackInfo) {
          // 每個 stack 整體 clip
          if (s.stack_abs.h > 0 && s.stack_abs.h < 6000) {
            const clipPath = path.join(ssDir, `${t.name}_${vp.name}_stack${s.idx}_FULL.png`);
            await page.screenshot({
              path: clipPath, fullPage: true,
              clip: { x: s.stack_abs.x, y: s.stack_abs.y, width: s.stack_abs.w, height: s.stack_abs.h },
            });
            console.log(`  saved: ${clipPath}`);
          }

          // 第 1 個 card abs clip
          if (s.card_boxes[0]) {
            const cb = s.card_boxes[0];
            const cardPath = path.join(ssDir, `${t.name}_${vp.name}_stack${s.idx}_card0.png`);
            await page.screenshot({
              path: cardPath, fullPage: true,
              clip: { x: cb.x, y: cb.y, width: cb.w, height: cb.h },
            });
            console.log(`    card0: ${cb.w}x${cb.h} → ${cardPath}`);
          }
          // 第 2 個 card
          if (s.card_boxes[1]) {
            const cb = s.card_boxes[1];
            const cardPath = path.join(ssDir, `${t.name}_${vp.name}_stack${s.idx}_card1.png`);
            await page.screenshot({
              path: cardPath, fullPage: true,
              clip: { x: cb.x, y: cb.y, width: cb.w, height: cb.h },
            });
            console.log(`    card1: ${cb.w}x${cb.h} → ${cardPath}`);
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
