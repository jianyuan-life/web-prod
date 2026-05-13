// 用 elementHandle.screenshot 直接截元素本體
const path = require('path');
const fs = require('fs');
const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const TOKENS = [
  { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C_HoYouChun', plan: 'C' },
  { id: '4e636025-fb87-4099-a91d-a4f6c64df7e5', name: 'D_HoXuan',    plan: 'D' },
  { id: '271dcda0-e348-4d98-9c09-4beb14a4634a', name: 'G15_HoFamily',plan: 'G15' },
  { id: '116836df-55a9-4d9a-ac33-3aae5c8ea7f9', name: 'R_latest',    plan: 'R' },
];

const VIEWPORTS = [
  { name: 'desktop_1920', width: 1920, height: 1080 },
  { name: 'desktop_1440', width: 1440, height: 900  },
  { name: 'mobile_375',   width: 375,  height: 812  },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ssDir = path.join(__dirname, 'v5_10_158_element');
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  const cardData = [];

  for (const t of TOKENS) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const url = `https://jianyuan.life/report/${t.id}?cb=el_${Date.now()}`;
      console.log(`\n=== ${t.name} ${vp.name} ===`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);
        await page.evaluate(() => {
          document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
        });
        await page.waitForTimeout(2000);

        const stacks = await page.$$('.report-card-stack');
        console.log(`  found ${stacks.length} stacks`);
        if (stacks.length === 0) continue;

        // 截第 1 個 stack 整體
        const ssA = path.join(ssDir, `${t.name}_${vp.name}_stack0.png`);
        try {
          await stacks[0].screenshot({ path: ssA });
          console.log(`  saved stack0: ${ssA}`);
        } catch (e) {
          console.log(`  stack0 too tall, skip:`, e.message.slice(0, 80));
          // 改用 bounding box clip
          const box = await stacks[0].boundingBox();
          if (box && box.height < 8000) {
            await stacks[0].scrollIntoViewIfNeeded();
            await page.waitForTimeout(300);
            console.log(`  bbox: ${box.width}x${box.height}`);
          }
        }

        // 抽樣第 1 個 card 細節
        const cards = await stacks[0].$$('.report-card');
        if (cards.length > 0) {
          const ssB = path.join(ssDir, `${t.name}_${vp.name}_card0.png`);
          await cards[0].screenshot({ path: ssB });
          console.log(`  saved card0: ${ssB}`);

          const cardDetail = await cards[0].evaluate(el => {
            const h4 = el.querySelector('h4');
            const titleStyle = h4 ? window.getComputedStyle(h4) : null;
            const rows = el.querySelectorAll(':scope > div > div');
            return {
              title: h4?.textContent.trim().slice(0, 40),
              title_color: titleStyle?.color,
              title_fontSize: titleStyle?.fontSize,
              title_borderBottom: titleStyle?.borderBottom,
              row_count: rows.length,
              first_3_rows: Array.from(rows).slice(0, 3).map(r => r.textContent.trim().slice(0, 60)),
              card_padding: window.getComputedStyle(el).padding,
              card_border: window.getComputedStyle(el).border,
              card_bg: window.getComputedStyle(el).backgroundColor,
            };
          });
          cardData.push({ token: t.name, vp: vp.name, ...cardDetail });
          console.log(`  card detail:`, JSON.stringify(cardDetail).slice(0, 300));
        }
      } catch (e) {
        console.log(`  ERROR: ${e.message.slice(0, 200)}`);
      } finally {
        await ctx.close();
      }
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'v5_10_158_card_data.json'), JSON.stringify(cardData, null, 2));
})();
