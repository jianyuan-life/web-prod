// L1 Claude QA Round 3 FINAL — v5.10.138 6 維度驗證
// 目標:typography(line-height/h3) + 14 vs 15 leak + callout fallback + 30s lazyguide + motion + H2 cascade

const path = require('path');
const fs = require('fs');

const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

// 6 historical tokens (從 L2 IA v5.10.127 round 1):
const TOKENS = [
  { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C_HoYouChun',  plan: 'C',   viewport: 'desktop' },
  { id: '64b15504-b3c4-4153-aff6-3f279363dc7e', name: 'C_HoChiNan',   plan: 'C',   viewport: 'desktop' },
  { id: '271dcda0-e348-4d98-9c09-4beb14a4634a', name: 'G15_HoFamily', plan: 'G15', viewport: 'desktop' },
  { id: '9b6edb0a-f1db-4484-8306-c088e78be8c8', name: 'unknown_9b',   plan: '?',   viewport: 'desktop' },
  { id: '4e636025-fb87-4099-a91d-a4f6c64df7e5', name: 'D_HoXuan',     plan: 'D',   viewport: 'desktop' },
  { id: '89e112dc-e0c1-4f0b-b8e8-5e5b51f6f8c7', name: 'unknown_89',   plan: '?',   viewport: 'desktop' },
  // mobile 1 個確認 prefers-reduced-motion / responsive
  { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C_HoYouChun_M', plan: 'C',  viewport: 'mobile' },
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile:  { width: 375, height: 812 },
};

const log = (m) => process.stdout.write(m + '\n');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const allResults = [];

  for (const t of TOKENS) {
    const vp = VIEWPORTS[t.viewport];
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: t.viewport === 'mobile' ? 2 : 1 });
    const page = await ctx.newPage();
    const url = `https://jianyuan.life/report/${t.id}?cb=v5_10_138_L1R3F_${Date.now()}`;
    log(`\n=== ${t.name} ${t.viewport} ${vp.width}x${vp.height} ===\n${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(7000);
      await page.evaluate(() => {
        document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
        document.querySelectorAll('button[aria-expanded="false"]').forEach(b => { try { b.click(); } catch (e) {} });
      });
      await page.waitForTimeout(2000);

      // 1. version + 404 detection
      const versionInfo = await page.evaluate(() => {
        const text = document.body.innerText;
        const matches = (text.match(/v5\.\d+\.\d+/g) || []);
        const sorted = matches.sort((a, b) => {
          const pa = a.replace('v','').split('.').map(Number);
          const pb = b.replace('v','').split('.').map(Number);
          for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
          return 0;
        });
        const is404 = /找不到報告|報告不存在|404/.test(text) && text.length < 3000;
        return { all: [...new Set(matches)], highest: sorted[0] || 'unknown', is404, textLen: text.length };
      });

      if (versionInfo.is404) {
        log(`  ❌ 404 / 報告不存在 (textLen=${versionInfo.textLen})`);
        allResults.push({ ...t, error: '404', versionDetected: versionInfo.highest, textLen: versionInfo.textLen });
        await ctx.close();
        continue;
      }

      // 2. typography measurements
      const typography = await page.evaluate(() => {
        const sample = (sel) => {
          const els = Array.from(document.querySelectorAll(sel));
          if (!els.length) return { count: 0 };
          const cs = window.getComputedStyle(els[0]);
          return {
            count: els.length,
            fontSize: cs.fontSize,
            lineHeight: cs.lineHeight,
            marginTop: cs.marginTop,
            marginBottom: cs.marginBottom,
            fontWeight: cs.fontWeight,
            color: cs.color,
          };
        };
        return {
          'report-p': sample('.report-p'),
          'report-h3': sample('.report-h3'),
          'report-h2': sample('.report-h2'),
        };
      });

      // 3. content-leak check: 14 vs 15
      const leaks = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          dongxi15: (text.match(/東西方十五/g) || []).length,
          shiwu_xt: (text.match(/十五系統/g) || []).length,
          shiwu_da: (text.match(/十五大命理/g) || []).length,
          shiwu_15set: (text.match(/十五套/g) || []).length,
          digit_15set: (text.match(/15\s*套(?!備案)/g) || []).length,
          fifteen_total: ((text.match(/十五(?:個系統|張底片|大命理系統|套系統|套|系統)/g) || []).length),
          // sanity: 14 出現次數
          fourteen_xt: (text.match(/十四系統|十四套|14 套|14套|十四大|東西方十四/g) || []).length,
        };
      });

      // 4. starStar leak (residual markdown ** 殘)
      const ssCount = await page.evaluate(() => (document.body.innerText.match(/\*\*[一-鿿A-Za-z]/g) || []).length);

      // 5. callout fallback rate
      const callouts = await page.evaluate(() => {
        const list = Array.from(document.querySelectorAll('[class*="callout"]'));
        const totals = list.length;
        const fallbacks = list.filter(c => {
          const t = c.innerText.trim();
          return t === '' || t === '重要提示' || t.length < 5;
        });
        return {
          total: totals,
          fallback: fallbacks.length,
          fallbackTexts: fallbacks.slice(0, 3).map(f => f.innerText.trim().slice(0, 40)),
        };
      });

      // 6. 30s lazyguide(grouped > 1 才該顯示)
      const lazyguide = await page.evaluate(() => {
        const text = document.body.innerText;
        const has = /30 秒懶人包|30秒懶人包|30 秒|30秒掌握/.test(text);
        const sections = Array.from(document.querySelectorAll('[id^="part-"]'));
        return { hasLazyguide: has, partSectionCount: sections.length };
      });

      // 7. motion token usage(M3 標準)
      const motion = await page.evaluate(() => {
        // 抓 :root computed style 是否有 --motion-fast / --motion-medium
        const root = getComputedStyle(document.documentElement);
        return {
          motionFast:     root.getPropertyValue('--motion-fast').trim(),
          motionMedium:   root.getPropertyValue('--motion-medium').trim(),
          motionSlow:     root.getPropertyValue('--motion-slow').trim(),
          easingStandard: root.getPropertyValue('--easing-standard').trim(),
        };
      });

      // 8. screenshot
      const dims = await page.evaluate(() => ({
        documentHeight: document.documentElement.scrollHeight,
        viewportWidth:  window.innerWidth,
      }));

      const screenshotPath = path.join(screenshotDir, `${t.plan}_${t.id.slice(0, 8)}_${t.viewport}_v5_10_138.png`);
      await page.screenshot({
        path: screenshotPath,
        clip: { x: 0, y: 0, width: vp.width, height: Math.min(dims.documentHeight, t.viewport === 'mobile' ? 8000 : 6000) },
      });

      const result = {
        token: t.id,
        name: t.name,
        plan: t.plan,
        viewport: t.viewport,
        versionDetected: versionInfo.highest,
        versionAll: versionInfo.all,
        typography,
        leaks,
        starStar: ssCount,
        callouts,
        lazyguide,
        motion,
        dims,
        screenshot: path.relative(__dirname, screenshotPath),
      };
      allResults.push(result);
      log(`  ver=${versionInfo.highest}  height=${dims.documentHeight}px`);
      log(`  P lh=${typography['report-p'].lineHeight}  size=${typography['report-p'].fontSize}`);
      log(`  H3 size=${typography['report-h3'].fontSize}  margin=${typography['report-h3'].marginTop}/${typography['report-h3'].marginBottom}`);
      log(`  leaks: 東西方15=${leaks.dongxi15} 十五系統=${leaks.shiwu_xt} 十五大命理=${leaks.shiwu_da} 十五套=${leaks.shiwu_15set} 15套=${leaks.digit_15set} 14_total=${leaks.fourteen_xt}`);
      log(`  noise: SS=${ssCount}  callout-fb=${callouts.fallback}/${callouts.total}  lazyguide=${lazyguide.hasLazyguide} parts=${lazyguide.partSectionCount}`);
      log(`  motion: fast=${motion.motionFast} medium=${motion.motionMedium} easing=${motion.easingStandard}`);

      fs.writeFileSync(path.join(__dirname, 'capture_result.json'), JSON.stringify(allResults, null, 2));
    } catch (e) {
      log(`  ERROR: ${e.message}`);
      allResults.push({ token: t.id, name: t.name, plan: t.plan, viewport: t.viewport, error: e.message });
    } finally {
      await ctx.close();
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'capture_result.json'), JSON.stringify(allResults, null, 2));
  log(`\n=== JSON saved (${allResults.length} results) ===`);
})();
