// DS3 R2 Motion Re-evaluation — v5.10.139
// 驗證 motion token + PartSection id + quick-jump 跳轉
// PASS 標準: motion 子分 +8 達 76、所有 token 正確套用、quick-jump 跳轉 PASS

const path = require('path');
const fs = require('fs');

const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const TOKEN = 'd143f949-192c-4808-a516-61b03a19f146'; // C_HoYouChun (grouped > 1)
const VIEWPORT = { width: 1440, height: 900 };

const log = (m) => process.stdout.write(m + '\n');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const screenshotDir = path.join(__dirname, 'motion_v5_10_139_screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const result = { token: TOKEN, viewport: VIEWPORT, ts: new Date().toISOString() };

  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page = await ctx.newPage();
  const url = `https://jianyuan.life/report/${TOKEN}?cb=motion_v5_10_139_${Date.now()}`;
  log(`\n=== motion eval ${TOKEN} ${VIEWPORT.width}x${VIEWPORT.height} ===\n${url}`);

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(7000);

    // 1. Version detection — 必須 ≥ v5.10.139
    const versionInfo = await page.evaluate(() => {
      const matches = (document.body.innerText.match(/v5\.\d+\.\d+/g) || []);
      const sorted = matches.sort((a, b) => {
        const pa = a.replace('v','').split('.').map(Number);
        const pb = b.replace('v','').split('.').map(Number);
        for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
        return 0;
      });
      return { latest: sorted[0] || null, all: [...new Set(matches)] };
    });
    result.version = versionInfo;
    log(`version: ${versionInfo.latest} (all: ${versionInfo.all.join(', ')})`);

    const isV139Plus = versionInfo.latest && (() => {
      const p = versionInfo.latest.replace('v','').split('.').map(Number);
      return p[0] > 5 || (p[0] === 5 && p[1] > 10) || (p[0] === 5 && p[1] === 10 && p[2] >= 139);
    })();
    result.deployVerified = isV139Plus;
    log(`deploy verified (>= v5.10.139): ${isV139Plus}`);

    // 2. Motion token verification
    const motionTokens = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        '--motion-fast': cs.getPropertyValue('--motion-fast').trim(),
        '--motion-medium': cs.getPropertyValue('--motion-medium').trim(),
        '--motion-slow': cs.getPropertyValue('--motion-slow').trim(),
        '--easing-standard': cs.getPropertyValue('--easing-standard').trim(),
        '--easing-emphasized': cs.getPropertyValue('--easing-emphasized').trim(),
      };
    });
    result.motionTokens = motionTokens;
    log(`motion tokens: ${JSON.stringify(motionTokens)}`);

    // 3. Verify .section-card transition uses var()
    const transitions = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('.section-card')).slice(0, 3);
      const tocLinks = Array.from(document.querySelectorAll('.toc-link')).slice(0, 3);
      const hoverLifts = Array.from(document.querySelectorAll('.hover-lift')).slice(0, 3);
      return {
        sectionCardCount: document.querySelectorAll('.section-card').length,
        sectionCardTransitions: sections.map(el => getComputedStyle(el).transition),
        tocLinkCount: document.querySelectorAll('.toc-link').length,
        tocLinkTransitions: tocLinks.map(el => getComputedStyle(el).transition),
        hoverLiftCount: document.querySelectorAll('.hover-lift').length,
        hoverLiftTransitions: hoverLifts.map(el => getComputedStyle(el).transition),
      };
    });
    result.transitions = transitions;
    log(`section-card count=${transitions.sectionCardCount} sample[0]=${transitions.sectionCardTransitions[0]}`);
    log(`toc-link count=${transitions.tocLinkCount} sample[0]=${transitions.tocLinkTransitions[0]}`);
    log(`hover-lift count=${transitions.hoverLiftCount} sample[0]=${transitions.hoverLiftTransitions[0]}`);

    // 4. PartSection id verification
    const partSections = await page.evaluate(() => {
      const parts = Array.from(document.querySelectorAll('section[id^="part-"]'));
      return parts.map(p => ({
        id: p.id,
        offsetTop: p.offsetTop,
        text: (p.querySelector('h2')?.textContent || '').slice(0, 30),
      }));
    });
    result.partSections = partSections;
    log(`part sections found: ${partSections.length}`);
    partSections.forEach(p => log(`  ${p.id} @ ${p.offsetTop}px - ${p.text}`));

    // 5. Quick-jump test — 30 秒懶人包 click
    const quickJumpTest = await page.evaluate(async () => {
      // Find quick-jump links pointing to #part-*
      const allLinks = Array.from(document.querySelectorAll('a[href^="#part-"]'));
      if (allLinks.length === 0) return { found: false, reason: 'no #part-* anchor links' };
      const link = allLinks[0];
      const targetId = link.getAttribute('href').slice(1);
      const targetEl = document.getElementById(targetId);
      if (!targetEl) return { found: false, reason: `#${targetId} target missing in DOM` };

      const beforeScroll = window.scrollY;
      link.click();
      // Wait for smooth scroll
      await new Promise(r => setTimeout(r, 1500));
      const afterScroll = window.scrollY;
      const targetOffset = targetEl.getBoundingClientRect().top + window.scrollY;

      return {
        found: true,
        targetId,
        linkText: link.textContent?.slice(0, 20),
        beforeScroll,
        afterScroll,
        targetOffset,
        scrollDelta: afterScroll - beforeScroll,
        scrolledToTarget: Math.abs(afterScroll - targetOffset) < 200, // 200px tolerance for smooth scroll easing
        totalLinks: allLinks.length,
      };
    });
    result.quickJump = quickJumpTest;
    log(`quick-jump: ${JSON.stringify(quickJumpTest)}`);

    // 6. Screenshot evidence
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    const ssTop = path.join(screenshotDir, `top_${Date.now()}.png`);
    await page.screenshot({ path: ssTop, fullPage: false });
    result.screenshotTop = ssTop;
    log(`screenshot top: ${ssTop}`);

    // 7. Verify reduced-motion fallback CSS exists
    const reducedMotionCheck = await page.evaluate(() => {
      // Check stylesheets for prefers-reduced-motion rule
      let foundRule = false;
      try {
        for (const sheet of document.styleSheets) {
          try {
            const rules = sheet.cssRules || [];
            for (const rule of rules) {
              if (rule.media && rule.media.mediaText.includes('prefers-reduced-motion')) {
                foundRule = true;
                break;
              }
            }
          } catch (e) {}
          if (foundRule) break;
        }
      } catch (e) {}
      return { foundReducedMotionRule: foundRule };
    });
    result.reducedMotion = reducedMotionCheck;
    log(`reduced-motion rule found: ${reducedMotionCheck.foundReducedMotionRule}`);

  } catch (e) {
    result.error = String(e);
    log(`ERROR: ${e}`);
  } finally {
    await ctx.close();
  }

  await browser.close();

  fs.writeFileSync(
    path.join(__dirname, 'motion_v5_10_139_result.json'),
    JSON.stringify(result, null, 2)
  );
  log(`\n=== DONE — result saved ===`);
})();
