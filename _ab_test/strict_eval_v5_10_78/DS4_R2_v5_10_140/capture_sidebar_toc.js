// DS4 R2 v5.10.140 SidebarTOC 真實效果驗證
// 5 項驗證 + DS4 7 維度連貫性打分
// 跑法: NODE_PATH="C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules" node capture_sidebar_toc.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TOKENS = [
  { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C 何宥諄', plan: 'C' },
  { id: '64b15504-b3c4-4153-aff6-3f279363dc7e', name: 'C 何紀萳', plan: 'C' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
];

const log = (m) => process.stdout.write(m + '\n');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const allResults = [];

  for (const t of TOKENS) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const url = `https://jianyuan.life/report/${t.id}?cb=v5_10_140`;
      log(`\n=== ${t.name} ${vp.name} (${vp.width}x${vp.height}) ===`);
      log(url);

      const r = { token: t.id, plan: t.plan, name: t.name, vp: vp.name, viewport: `${vp.width}x${vp.height}` };
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(7000); // hydration + ScrollSpy mount

        // === 1. 抓版本號 ===
        const versionInfo = await page.evaluate(() => {
          const matches = (document.body.innerText.match(/v5\.\d+\.\d+/g) || []);
          const sorted = matches.sort((a, b) => {
            const pa = a.replace('v', '').split('.').map(Number);
            const pb = b.replace('v', '').split('.').map(Number);
            for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
            return 0;
          });
          return { highest: sorted[0] || 'unknown', all: [...new Set(matches)] };
        });
        r.version = versionInfo.highest;
        log(`  ver: ${r.version}  all: ${versionInfo.all.join(',')}`);

        // === 2. SidebarTOC 存在 + 顯示狀態 ===
        const sidebarInfo = await page.evaluate(() => {
          const aside = document.querySelector('aside.sticky-sidebar-toc');
          if (!aside) return { exists: false };
          const cs = window.getComputedStyle(aside);
          const rect = aside.getBoundingClientRect();
          const links = aside.querySelectorAll('a.toc-link');
          return {
            exists: true,
            display: cs.display,
            position: cs.position,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            left: rect.left,
            offsetWidth: aside.offsetWidth,
            linkCount: links.length,
            firstLinkHref: links[0]?.getAttribute('href') || null,
            firstLinkText: links[0]?.textContent?.trim()?.slice(0, 30) || null,
          };
        });
        r.sidebar = sidebarInfo;
        log(`  sidebar: exists=${sidebarInfo.exists} display=${sidebarInfo.display} width=${sidebarInfo.width}px linkCount=${sidebarInfo.linkCount}`);

        // === 3. main width(主內容區寬度)===
        const mainWidth = await page.evaluate(() => {
          // page.tsx wrapper:lg:flex.lg:gap-6.lg:items-start
          // child div.w-full.lg:flex-1.lg:min-w-0
          const flexParent = Array.from(document.querySelectorAll('div.lg\\:flex'))
            .find(d => d.className.includes('lg:gap-6'));
          if (!flexParent) return { found: false };
          const mainCol = flexParent.querySelector('div.w-full.lg\\:flex-1');
          if (!mainCol) return { found: false, parentClass: flexParent.className };
          const rect = mainCol.getBoundingClientRect();
          return {
            found: true,
            width: rect.width,
            offsetWidth: mainCol.offsetWidth,
            className: mainCol.className.slice(0, 80),
          };
        });
        r.main = mainWidth;
        log(`  main: width=${mainWidth.width || 'n/a'}px found=${mainWidth.found}`);

        // === 4. mobile 必須隱藏(只 lg+ 顯示)===
        if (vp.name === 'mobile') {
          r.mobileHidden = sidebarInfo.exists ? (sidebarInfo.display === 'none') : 'no-aside';
          log(`  mobileHidden: ${r.mobileHidden}`);
        }

        // === 5. desktop 截圖 + 點擊 sidebar 第 3 條 ===
        if (vp.name === 'desktop' && sidebarInfo.exists && sidebarInfo.linkCount >= 3) {
          // 截圖 1:首頁、有 sidebar
          await page.screenshot({
            path: path.join(screenshotDir, `${t.plan}_${t.id.slice(0, 8)}_desktop_top.png`),
            fullPage: false,
          });

          // 點擊第 3 條 sidebar link、看 scroll 跳轉
          const beforeScroll = await page.evaluate(() => window.scrollY);
          await page.evaluate(() => {
            const links = document.querySelectorAll('aside.sticky-sidebar-toc a.toc-link');
            if (links[2]) {
              const href = links[2].getAttribute('href');
              const target = document.querySelector(href);
              if (target) target.scrollIntoView({ behavior: 'instant', block: 'start' });
              return { clicked: true, href, targetExists: !!target };
            }
            return { clicked: false };
          });
          await page.waitForTimeout(1500);
          const afterScroll = await page.evaluate(() => window.scrollY);
          r.clickJump = {
            beforeScrollY: beforeScroll,
            afterScrollY: afterScroll,
            scrolled: afterScroll - beforeScroll,
            success: (afterScroll - beforeScroll) > 200,
          };
          log(`  click-jump: scrolled=${r.clickJump.scrolled}px success=${r.clickJump.success}`);

          // 截圖 2:點擊 sidebar 後、看 ScrollSpy active
          await page.screenshot({
            path: path.join(screenshotDir, `${t.plan}_${t.id.slice(0, 8)}_desktop_after_click.png`),
            fullPage: false,
          });

          // === ScrollSpy active 驗證 ===
          const activeInfo = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('aside.sticky-sidebar-toc a.toc-link'));
            const actives = links.filter(l => l.getAttribute('data-active') === 'true');
            return {
              totalLinks: links.length,
              activeCount: actives.length,
              activeIndex: actives.length ? links.indexOf(actives[0]) : -1,
              activeText: actives[0]?.textContent?.trim()?.slice(0, 30) || null,
            };
          });
          r.scrollSpy = activeInfo;
          log(`  scrollspy: active=${activeInfo.activeCount}/${activeInfo.totalLinks} idx=${activeInfo.activeIndex}`);
        }

        // mobile 截圖
        if (vp.name === 'mobile') {
          await page.screenshot({
            path: path.join(screenshotDir, `${t.plan}_${t.id.slice(0, 8)}_mobile_top.png`),
            fullPage: false,
          });
        }

        r.status = 'OK';
      } catch (e) {
        r.status = 'ERROR';
        r.error = e.message;
        log(`  ERROR: ${e.message}`);
      } finally {
        await ctx.close();
      }
      allResults.push(r);
    }
  }

  await browser.close();

  fs.writeFileSync(
    path.join(__dirname, 'capture_result.json'),
    JSON.stringify(allResults, null, 2)
  );
  log('\n=== JSON saved ===');
  log(`output: ${path.join(__dirname, 'capture_result.json')}`);
})();
