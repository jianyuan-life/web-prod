// v5.10.158 focused: 滾到 Card Stack、截圖該區段(看視覺品質)
const path = require('path');
const fs = require('fs');
const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const TOKENS = [
  { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C_HoYouChun',  plan: 'C'   },
  { id: '4e636025-fb87-4099-a91d-a4f6c64df7e5', name: 'D_HoXuan',     plan: 'D'   },
  { id: '271dcda0-e348-4d98-9c09-4beb14a4634a', name: 'G15_HoFamily', plan: 'G15' },
  { id: '116836df-55a9-4d9a-ac33-3aae5c8ea7f9', name: 'R_latest',     plan: 'R'   },
];

const VIEWPORTS = [
  { name: 'desktop_1920', width: 1920, height: 1080, isMobile: false },
  { name: 'desktop_1440', width: 1440, height: 900,  isMobile: false },
  { name: 'mobile_375',   width: 375,  height: 812,  isMobile: true  },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ssDir = path.join(__dirname, 'v5_10_158_focused');
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  for (const t of TOKENS) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.isMobile ? 2 : 1,
      });
      const page = await ctx.newPage();
      const url = `https://jianyuan.life/report/${t.id}?cb=focus_${Date.now()}`;
      console.log(`\n=== ${t.name} ${vp.name} ===`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);
        await page.evaluate(() => {
          document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
        });
        await page.waitForTimeout(2000);

        // 找第一個 .report-card-stack、滾到它、截 viewport
        const stackInfo = await page.evaluate(() => {
          const stacks = document.querySelectorAll('.report-card-stack');
          if (stacks.length === 0) return { has: false };
          const first = stacks[0];
          first.scrollIntoView({ block: 'start', behavior: 'instant' });
          window.scrollBy(0, -80);  // 留點空間給 sticky header
          const r = first.getBoundingClientRect();
          const cards = first.querySelectorAll('.report-card');
          return {
            has: true,
            stack_count: stacks.length,
            first_card_count: cards.length,
            first_top: r.top, first_bottom: r.bottom, first_height: r.height,
            inViewport: r.top >= 0 && r.top < window.innerHeight,
          };
        });
        console.log('  stack info:', JSON.stringify(stackInfo));

        if (stackInfo.has) {
          await page.waitForTimeout(500);
          // 1) viewport 截圖看 card stack 開頭
          const ssA = path.join(ssDir, `${t.name}_${vp.name}_stack_top.png`);
          await page.screenshot({ path: ssA, fullPage: false });
          console.log('  saved viewport:', ssA);

          // 2) clip 截圖整個 Card Stack(若 < 3000px 高)
          if (stackInfo.first_height > 0 && stackInfo.first_height < 4000) {
            const fullStack = await page.evaluate(() => {
              const s = document.querySelectorAll('.report-card-stack')[0];
              s.scrollIntoView({ block: 'start', behavior: 'instant' });
              window.scrollBy(0, -20);
              const r = s.getBoundingClientRect();
              return { x: r.left, y: r.top, w: r.width, h: r.height };
            });
            const ssB = path.join(ssDir, `${t.name}_${vp.name}_stack_clip.png`);
            await page.screenshot({
              path: ssB,
              clip: { x: Math.max(0, fullStack.x), y: Math.max(0, fullStack.y), width: Math.min(fullStack.w, vp.width), height: Math.min(fullStack.h, 3500) },
            });
            console.log('  saved clip:', ssB);
          }
        } else {
          // 沒 stack — 截 viewport 看內容(D 方案沒寬表時)
          const ssC = path.join(ssDir, `${t.name}_${vp.name}_no_stack_top.png`);
          await page.screenshot({ path: ssC, fullPage: false });
          console.log('  no stack, saved viewport:', ssC);
        }
      } catch (e) {
        console.log('  ERROR:', e.message);
      } finally {
        await ctx.close();
      }
    }
  }
  await browser.close();
})();
