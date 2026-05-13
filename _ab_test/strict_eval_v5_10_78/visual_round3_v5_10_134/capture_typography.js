// L3 GPT-4o Round 3 — v5.10.134 typography re-evaluation
// 改動驗證: line-height 1.95→1.8, h3 1.125rem→1.25rem, h3 margin 1.75/0.75→2/1, stripRawMarkdown 「東西方十五套」cover
// 抓 desktop 1440 + 1 C 報告(d143f949) 主要驗證、加 1 G15 + 1 D 對照
// PASS: typography 從 78 → 84+ (+6 預期)

const path = require('path');
const fs = require('fs');

// 用 promptfoo 內 playwright(實測既有腳本走過、已驗 work)
const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

const TOKENS = [
  { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C_HoYouChun', plan: 'C' },
  { id: '271dcda0-e348-4d98-9c09-4beb14a4634a', name: 'G15_HoFamily', plan: 'G15' },
  { id: '4e636025-fb87-4099-a91d-a4f6c64df7e5', name: 'D_HoXuan', plan: 'D' },
];

const VIEWPORT = { name: 'desktop', width: 1440, height: 900 };

const log = (m) => process.stdout.write(m + '\n');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const allResults = [];

  for (const t of TOKENS) {
    const ctx = await browser.newContext({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height } });
    const page = await ctx.newPage();
    const url = `https://jianyuan.life/report/${t.id}?cb=v5_10_134_L3R3_${Date.now()}`;
    log(`\n=== ${t.name} desktop ${VIEWPORT.width}x${VIEWPORT.height} ===\n${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(7000);
      await page.evaluate(() => {
        document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
        document.querySelectorAll('button[aria-expanded="false"]').forEach(b => { try { b.click(); } catch (e) {} });
      });
      await page.waitForTimeout(2000);

      // 1. version detection
      const versionInfo = await page.evaluate(() => {
        const matches = (document.body.innerText.match(/v5\.\d+\.\d+/g) || []);
        const sorted = matches.sort((a, b) => {
          const pa = a.replace('v','').split('.').map(Number);
          const pb = b.replace('v','').split('.').map(Number);
          for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
          return 0;
        });
        return { all: [...new Set(matches)], highest: sorted[0] || 'unknown' };
      });

      // 2. typography measurements: line-height of .report-p, font-size of h3, h3 margins
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
          'is-family report-p': sample('.is-family .report-p'),
        };
      });

      // 3. content-leak check: 「東西方十五套」「十五系統」
      const leaks = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          dongxi15: (text.match(/東西方十五套/g) || []).length,
          shiwu_xt: (text.match(/十五系統/g) || []).length,
          shiwu_da: (text.match(/十五大命理/g) || []).length,
          shiwu_tao: (text.match(/十五套(?!系統)/g) || []).length,
          fifteen_leak_total: ((text.match(/十五(?:個系統|張底片|大命理系統|套系統|套)/g) || []).length),
        };
      });

      // 4. starStar leak (residual markdown)
      const ssCount = await page.evaluate(() => (document.body.innerText.match(/\*\*[一-鿿A-Za-z]/g) || []).length);

      // 5. callout fallback
      const callouts = await page.evaluate(() => {
        const list = Array.from(document.querySelectorAll('[class*="callout"]'));
        return {
          total: list.length,
          fallback: list.filter(c => {
            const t = c.innerText.trim();
            return t === '' || t === '重要提示' || t.length < 5;
          }).length,
        };
      });

      // 6. desktop full-page screenshot (just first 5000px to avoid huge file)
      const dims = await page.evaluate(() => ({
        documentHeight: document.documentElement.scrollHeight,
        viewportWidth: window.innerWidth,
      }));

      const screenshotPath = path.join(screenshotDir, `${t.plan}_${t.id.slice(0, 8)}_desktop_v5_10_134.png`);
      await page.screenshot({
        path: screenshotPath,
        clip: { x: 0, y: 0, width: VIEWPORT.width, height: Math.min(dims.documentHeight, 6000) },
      });

      const result = {
        token: t.id,
        name: t.name,
        plan: t.plan,
        versionDetected: versionInfo.highest,
        versionAll: versionInfo.all,
        typography,
        leaks,
        starStar: ssCount,
        callouts,
        dims,
        screenshot: path.relative(__dirname, screenshotPath),
      };
      allResults.push(result);
      log(`  ver=${versionInfo.highest}  height=${dims.documentHeight}px`);
      log(`  report-p line-height=${typography['report-p'].lineHeight}  font-size=${typography['report-p'].fontSize}`);
      log(`  report-h3 font-size=${typography['report-h3'].fontSize}  margin=${typography['report-h3'].marginTop}/${typography['report-h3'].marginBottom}  weight=${typography['report-h3'].fontWeight}`);
      log(`  leak: 東西方十五套=${leaks.dongxi15}  十五系統=${leaks.shiwu_xt}  十五大命理=${leaks.shiwu_da}  十五套(other)=${leaks.shiwu_tao}  fifteen-total=${leaks.fifteen_leak_total}`);
      log(`  noise: SS=${ssCount}  callout-fb=${callouts.fallback}/${callouts.total}`);

      fs.writeFileSync(path.join(__dirname, 'capture_result.json'), JSON.stringify(allResults, null, 2));
    } catch (e) {
      log(`  ERROR: ${e.message}`);
      allResults.push({ token: t.id, name: t.name, plan: t.plan, error: e.message });
    } finally {
      await ctx.close();
    }
  }

  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'capture_result.json'), JSON.stringify(allResults, null, 2));
  log(`\n=== JSON saved ===`);
})();
