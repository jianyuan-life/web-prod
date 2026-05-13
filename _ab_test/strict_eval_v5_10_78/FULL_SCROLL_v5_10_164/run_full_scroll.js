// FULL_SCROLL_v5_10_164 — capture every 800px scroll for 4 plans
const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);
const fs = require('fs');
const path = require('path');

const TOKENS = [
  { name: 'C',   token: 'd143f949-192c-4808-a516-61b03a19f146' }, // C 人生藍圖
  { name: 'D',   token: '9c08fc78-7c0e-4bd3-a70f-6f0e714c62bd' }, // D 心之所惑
  { name: 'G15', token: '9b6edb0a-f1db-4484-8306-c088e78be8c8' }, // G15 家族藍圖
  { name: 'R',   token: '116836df-55a9-4d9a-ac33-3aae5c8ea7f9' }, // R 合否?
];

const STEP = 800;
const MAX_SHOTS = 30; // safety cap
const OUT_BASE = __dirname;

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  const summary = [];

  for (const t of TOKENS) {
    const planDir = path.join(OUT_BASE, t.name);
    if (!fs.existsSync(planDir)) fs.mkdirSync(planDir, { recursive: true });

    const consoleErrors = [];
    const pageErrors = [];

    const page = await ctx.newPage();
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => pageErrors.push(String(err)));

    const url = `https://jianyuan.life/report/${t.token}?cb=full_scroll_164`;
    console.log(`\n[${t.name}] navigate ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    } catch (e) {
      console.log(`  goto warning: ${e.message}`);
    }
    await page.waitForTimeout(3000);
    try { await page.waitForSelector('.report-p, h1, h2', { timeout: 15000 }); }
    catch (e) { console.log('  no .report-p / h1 found within 15s'); }
    await page.waitForTimeout(2000);

    // measure full page height
    const pageInfo = await page.evaluate(() => ({
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      title: document.title,
    }));
    console.log(`  page height=${pageInfo.scrollHeight}px viewport=${pageInfo.clientHeight}px title="${pageInfo.title}"`);

    const totalShots = Math.min(MAX_SHOTS, Math.ceil(pageInfo.scrollHeight / STEP) + 1);
    const shots = [];

    // ensure at top first
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);

    for (let i = 0; i < totalShots; i++) {
      const targetY = i * STEP;
      await page.evaluate(y => window.scrollTo(0, y), targetY);
      await page.waitForTimeout(700);
      const fname = `scroll_${String(i).padStart(2, '0')}.png`;
      const fpath = path.join(planDir, fname);
      try {
        await page.screenshot({ path: fpath, fullPage: false });
      } catch (e) {
        console.log(`  screenshot ${i} failed: ${e.message}`);
        continue;
      }

      // probe what's at center of viewport
      const probe = await page.evaluate(() => {
        const cx = Math.floor(window.innerWidth / 2);
        const cy = Math.floor(window.innerHeight / 2);
        const els = document.elementsFromPoint(cx, cy);
        const top = els[0];
        let txt = '';
        if (top) {
          const t = (top.innerText || top.textContent || '').trim();
          txt = t.substring(0, 100);
        }
        const sy = window.scrollY;
        const docH = document.documentElement.scrollHeight;
        return {
          scrollY: sy,
          docHeight: docH,
          centerEls: els.length,
          topTag: top ? top.tagName : null,
          topClass: top ? (top.className || '').toString().substring(0, 80) : null,
          centerText: txt,
        };
      });

      const blank = !probe.centerText && probe.centerEls < 3;
      shots.push({
        idx: i,
        file: fname,
        path: fpath.replace(/\\/g, '/'),
        scrollY: probe.scrollY,
        centerEls: probe.centerEls,
        topTag: probe.topTag,
        topClass: probe.topClass,
        textPreview: probe.centerText,
        blank,
      });
      console.log(`  [${i}] y=${probe.scrollY} els=${probe.centerEls} tag=${probe.topTag} blank=${blank} text="${probe.centerText.substring(0, 50)}"`);

      // stop if reached bottom
      if (probe.scrollY + pageInfo.clientHeight >= probe.docHeight - 50) {
        console.log(`  reached bottom at shot ${i}, stopping`);
        break;
      }
    }

    summary.push({
      plan: t.name,
      token: t.token,
      shotsCount: shots.length,
      pageHeight: pageInfo.scrollHeight,
      blankShots: shots.filter(s => s.blank).length,
      shots,
      consoleErrors,
      pageErrors,
    });

    await page.close();
  }

  await browser.close();

  const reportPath = path.join(OUT_BASE, 'FULL_SCROLL_REPORT.json');
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8');

  // text summary
  const lines = [];
  lines.push('=== FULL SCROLL v5.10.164 SUMMARY ===\n');
  for (const s of summary) {
    lines.push(`\n[${s.plan}] token=${s.token}`);
    lines.push(`  page height: ${s.pageHeight}px`);
    lines.push(`  shots: ${s.shotsCount}`);
    lines.push(`  blank shots: ${s.blankShots}`);
    lines.push(`  console errors: ${s.consoleErrors.length}`);
    lines.push(`  page errors: ${s.pageErrors.length}`);
    lines.push(`  files:`);
    for (const sh of s.shots) {
      const marker = sh.blank ? ' [BLANK]' : '';
      lines.push(`    ${sh.path} (y=${sh.scrollY}, ${sh.topTag}, els=${sh.centerEls})${marker}`);
    }
    if (s.consoleErrors.length) {
      lines.push(`  --- console errors ---`);
      s.consoleErrors.forEach(e => lines.push(`    ${e.substring(0, 200)}`));
    }
    if (s.pageErrors.length) {
      lines.push(`  --- page errors ---`);
      s.pageErrors.forEach(e => lines.push(`    ${e.substring(0, 200)}`));
    }
  }
  fs.writeFileSync(path.join(OUT_BASE, 'FULL_SCROLL_REPORT.txt'), lines.join('\n'), 'utf8');

  console.log(`\n=== DONE ===`);
  console.log(`JSON: ${reportPath}`);
  console.log(`TXT: ${path.join(OUT_BASE, 'FULL_SCROLL_REPORT.txt')}`);
}

run().catch(err => { console.error('FATAL:', err); process.exit(1); });
