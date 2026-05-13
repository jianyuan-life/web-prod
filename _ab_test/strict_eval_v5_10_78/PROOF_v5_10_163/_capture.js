// PROOF v5.10.163 capture — 4 reports (3 C + 1 G15)
const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const TARGETS = [
  { token: 'd143f949-192c-4808-a516-61b03a19f146', plan: 'C',   name: 'C_d143f949' },
  { token: '64b15504-b3c4-4153-aff6-3f279363dc7e', plan: 'C',   name: 'C_64b15504' },
  { token: 'bf9e30da-eaba-4efd-95ec-1e5e3b8e30f9', plan: 'C',   name: 'C_bf9e30da' },
  { token: '9b6edb0a-f1db-4484-8306-c088e78be8c8', plan: 'G15', name: 'G15_9b6edb0a' }
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();

  // 1) Landing page version
  console.log('--- LANDING ---');
  try {
    await page.goto('https://jianyuan.life/?cb=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2500);
    const versionInfo = await page.evaluate(() => {
      const txt = document.body.innerText;
      const matches = txt.match(/v?5\.10\.\d+/g) || [];
      return { unique: [...new Set(matches)].slice(0, 5), bodyLen: txt.length };
    });
    console.log('LANDING_VERSION:', JSON.stringify(versionInfo));
  } catch (e) { console.log('landing err:', e.message?.slice(0, 80)); }

  const summary = { ts: new Date().toISOString(), reports: [] };

  for (const t of TARGETS) {
    const url = `https://jianyuan.life/report/${t.token}?cb=v5_10_163_PROOF_${Date.now()}`;
    console.log(`\n=== ${t.name} (${t.plan}) ===`);
    const rec = { name: t.name, plan: t.plan, token: t.token, screenshots: [] };
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      try { await page.waitForSelector('.report-p, h1, h2', { timeout: 20000 }); } catch (e) {}
      await page.waitForTimeout(3000);

      // Version check on report page
      const reportVer = await page.evaluate(() => {
        const txt = document.body.innerText;
        const m = txt.match(/v?5\.10\.\d+/g) || [];
        return [...new Set(m)].slice(0, 3);
      });
      rec.report_version = reportVer;
      console.log('  report_ver:', reportVer.join(','));

      // Card stack + table inventory
      const inv = await page.evaluate(() => {
        const stacks = Array.from(document.querySelectorAll('.report-card-stack'));
        const tableOuter = Array.from(document.querySelectorAll('.table-breakout-outer'));
        const tables = Array.from(document.querySelectorAll('table'));
        const stackData = stacks.slice(0, 5).map((s, i) => {
          const cs = getComputedStyle(s);
          const rect = s.getBoundingClientRect();
          const parent = s.parentElement;
          const parentRect = parent?.getBoundingClientRect();
          // first card col-1
          const firstCard = s.querySelector('.report-card, [class*="card"]');
          const col1 = firstCard?.querySelector('th, td, [class*="col"], [class*="header"]');
          return {
            idx: i,
            offsetLeft: s.offsetLeft,
            offsetWidth: s.offsetWidth,
            rectLeft: Math.round(rect.left),
            rectWidth: Math.round(rect.width),
            parentWidth: parent ? parent.offsetWidth : 0,
            parentLeft: parentRect ? Math.round(parentRect.left) : 0,
            maxWidth: cs.maxWidth,
            margin: cs.margin,
            marginLeft: cs.marginLeft,
            marginRight: cs.marginRight,
            display: cs.display,
            firstCardWidth: firstCard ? firstCard.offsetWidth : null,
            col1Text: col1 ? col1.innerText?.slice(0, 40) : null,
            col1Width: col1 ? col1.offsetWidth : null
          };
        });
        return {
          card_stack_count: stacks.length,
          table_breakout_count: tableOuter.length,
          table_count: tables.length,
          stack_data: stackData
        };
      });
      rec.inventory = inv;
      console.log('  inventory:', JSON.stringify({ stacks: inv.card_stack_count, tables: inv.table_count, breakout: inv.table_breakout_count }));
      if (inv.stack_data.length) {
        const s0 = inv.stack_data[0];
        console.log(`  first_stack: offsetLeft=${s0.offsetLeft} width=${s0.offsetWidth} parentW=${s0.parentWidth} maxW=${s0.maxWidth} margin=${s0.margin?.slice(0, 50)}`);
      }

      // Section discovery
      const sections = await page.evaluate(() => {
        const heads = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
        const found = [];
        const keywords = ['節奏', '12 個月', '12個月', '矩陣', '系統', '人生', '運勢曲線', '速查表', '幸運參數'];
        for (const kw of keywords) {
          const el = heads.find(e => e.innerText?.includes(kw));
          if (el) found.push({ kw, tag: el.tagName, text: el.innerText?.slice(0, 60), top: Math.round(el.getBoundingClientRect().top + window.scrollY) });
        }
        return found;
      });
      rec.sections = sections;
      console.log(`  sections: ${sections.length} (${sections.slice(0,4).map(s=>s.kw).join(',')})`);

      // Screenshot 1: card_stack focused (if exists)
      if (inv.card_stack_count > 0) {
        try {
          const loc = page.locator('.report-card-stack').first();
          await loc.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          const fp = path.join(OUT, `${t.name}_card_stack.png`);
          await loc.screenshot({ path: fp });
          rec.screenshots.push({ type: 'card_stack', path: fp });
          console.log('  saved:', path.basename(fp));
        } catch (e) { console.log('  card_stack err:', e.message?.slice(0, 60)); }
      }

      // Screenshot 2: table_breakout focused
      if (inv.table_breakout_count > 0) {
        try {
          const loc = page.locator('.table-breakout-outer').first();
          await loc.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          const fp = path.join(OUT, `${t.name}_table_breakout.png`);
          await loc.screenshot({ path: fp });
          rec.screenshots.push({ type: 'table_breakout', path: fp });
          console.log('  saved:', path.basename(fp));
        } catch (e) { console.log('  breakout err:', e.message?.slice(0, 60)); }
      } else if (inv.table_count > 0) {
        try {
          const loc = page.locator('table').first();
          await loc.scrollIntoViewIfNeeded();
          await page.waitForTimeout(500);
          const fp = path.join(OUT, `${t.name}_table.png`);
          await loc.screenshot({ path: fp });
          rec.screenshots.push({ type: 'table', path: fp });
          console.log('  saved:', path.basename(fp));
        } catch (e) { console.log('  table err:', e.message?.slice(0, 60)); }
      }

      // Screenshot 3: scroll to first matching section
      for (const sec of sections.slice(0, 2)) {
        try {
          await page.evaluate((top) => window.scrollTo({ top: Math.max(0, top - 100), behavior: 'instant' }), sec.top);
          await page.waitForTimeout(700);
          const safeName = sec.kw.replace(/[^a-zA-Z0-9一-龥]/g, '_');
          const fp = path.join(OUT, `${t.name}_section_${safeName}.png`);
          await page.screenshot({ path: fp, fullPage: false });
          rec.screenshots.push({ type: 'section', kw: sec.kw, path: fp });
          console.log(`  saved section ${sec.kw}:`, path.basename(fp));
        } catch (e) { console.log(`  sec ${sec.kw} err:`, e.message?.slice(0, 60)); }
      }

      summary.reports.push(rec);
    } catch (err) {
      rec.error = err.message;
      console.log('  ERROR:', err.message);
      summary.reports.push(rec);
    }
  }

  fs.writeFileSync(path.join(OUT, '_summary.json'), JSON.stringify(summary, null, 2));
  await browser.close();
  console.log('\n=== DONE ===');
  console.log('Summary:', path.join(OUT, '_summary.json'));
})().catch(e => { console.error(e); process.exit(1); });
