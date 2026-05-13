// v5.10.158 QA — 寬表 ≥ 5 col 改 Card Stack 客戶體驗審
// 4 客戶(C/D/G15/R)× 3 viewport(1920/1440/375)= 12 截圖
// 嚴格客戶視角、寧嚴勿鬆、≥ 95/100 PASS

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

const log = (m) => process.stdout.write(m + '\n');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ssDir = path.join(__dirname, 'v5_10_158_qa_screenshots');
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  const allResults = [];

  for (const t of TOKENS) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.isMobile ? 2 : 1,
        userAgent: vp.isMobile
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
          : undefined,
      });
      const page = await ctx.newPage();
      const url = `https://jianyuan.life/report/${t.id}?cb=v158_${Date.now()}`;
      log(`\n=== ${t.name} ${vp.name} ===`);
      const result = { name: t.name, plan: t.plan, vp: vp.name, url };
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);
        await page.evaluate(() => {
          document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
        });
        await page.waitForTimeout(2000);

        // Version
        const versions = await page.evaluate(() => {
          const m = document.body.innerText.match(/v5\.10\.\d+/g) || [];
          return [...new Set(m)];
        });
        result.versions = versions;
        log(`  versions: ${versions.join(',') || '(none)'}`);

        // 數據抽取
        const stats = await page.evaluate(() => {
          // Card Stack 數量(寬表 ≥ 5 col 應 render 為 .report-card-stack)
          const cardStacks = document.querySelectorAll('.report-card-stack');
          const stackCount = cardStacks.length;

          // Card 數量
          let totalCards = 0;
          let cardsWithTitle = 0;
          let cardsEmpty = 0;
          let cardTitleColors = [];
          let cardOverflow = 0;
          const cardSamples = [];

          cardStacks.forEach((stack, sidx) => {
            const cards = stack.querySelectorAll('.report-card');
            totalCards += cards.length;
            cards.forEach((card, cidx) => {
              const title = card.querySelector('.report-card-title');
              const body = card.querySelector('.report-card-body');
              if (title && title.textContent.trim()) cardsWithTitle++;
              if (!body || body.children.length === 0) cardsEmpty++;

              if (title && cardTitleColors.length < 3) {
                cardTitleColors.push(window.getComputedStyle(title).color);
              }

              // overflow 檢測
              const cRect = card.getBoundingClientRect();
              const sRect = stack.getBoundingClientRect();
              if (cRect.right > sRect.right + 2 || cRect.left < sRect.left - 2) cardOverflow++;

              // 抽樣
              if (sidx === 0 && cidx < 2) {
                const labels = card.querySelectorAll('.report-card-label');
                const values = card.querySelectorAll('.report-card-value');
                cardSamples.push({
                  title: title ? title.textContent.trim().slice(0, 40) : null,
                  labels: Array.from(labels).slice(0, 3).map(l => l.textContent.trim().slice(0, 20)),
                  values: Array.from(values).slice(0, 3).map(v => v.textContent.trim().slice(0, 30)),
                  labelCount: labels.length,
                  valueCount: values.length,
                });
              }
            });
          });

          // 短表(≤ 4 col)應該還是 table、檢查 sticky
          const tables = document.querySelectorAll('table');
          let tableCount = tables.length;
          let stickyCol1Count = 0;
          let shortTables = 0;
          let longTables = 0;
          let truncatedCells = 0;
          tables.forEach(tbl => {
            const headerCells = tbl.querySelectorAll('thead tr:first-child th, thead tr:first-child td');
            const cols = headerCells.length || (tbl.rows[0] && tbl.rows[0].cells.length) || 0;
            if (cols >= 5) longTables++;
            else shortTables++;

            // sticky check 第 1 欄(僅短表期望 sticky)
            const firstCells = tbl.querySelectorAll('tr > *:first-child');
            firstCells.forEach(c => {
              if (window.getComputedStyle(c).position === 'sticky') stickyCol1Count++;
            });

            // 截字檢查(任何 cell scrollWidth > clientWidth + 2 且 overflow:hidden)
            tbl.querySelectorAll('th, td').forEach(c => {
              const cs = window.getComputedStyle(c);
              if ((cs.overflow === 'hidden' || cs.overflowX === 'hidden') && c.scrollWidth > c.clientWidth + 2) {
                truncatedCells++;
              }
            });
          });

          // viewport 水平溢出
          const docW = document.documentElement.scrollWidth;
          const winW = window.innerWidth;
          const horizOverflow = docW > winW + 2;

          // 整體 overflow elements
          let overflowEls = 0;
          document.querySelectorAll('*').forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.right > winW + 2) overflowEls++;
          });

          return {
            stackCount, totalCards, cardsWithTitle, cardsEmpty,
            cardTitleColors, cardOverflow, cardSamples,
            tableCount, longTables, shortTables, stickyCol1Count, truncatedCells,
            docW, winW, horizOverflow, overflowEls
          };
        });
        result.stats = stats;
        log(`  stack: ${stats.stackCount} / cards: ${stats.totalCards} (title:${stats.cardsWithTitle}, empty:${stats.cardsEmpty})`);
        log(`  tables: ${stats.tableCount} (long≥5: ${stats.longTables}, short≤4: ${stats.shortTables}, sticky col1: ${stats.stickyCol1Count})`);
        log(`  overflow: card ${stats.cardOverflow} / cells truncated ${stats.truncatedCells} / viewport horiz ${stats.horizOverflow ? 'YES' : 'no'} (docW ${stats.docW} / winW ${stats.winW})`);
        if (stats.cardSamples.length) {
          log(`  sample card[0] title="${stats.cardSamples[0].title}" labels=${stats.cardSamples[0].labelCount} values=${stats.cardSamples[0].valueCount}`);
          log(`    labels: ${JSON.stringify(stats.cardSamples[0].labels)}`);
          log(`    values: ${JSON.stringify(stats.cardSamples[0].values)}`);
        }

        // 截圖(全頁)
        const ssPath = path.join(ssDir, `${t.name}_${vp.name}.png`);
        await page.screenshot({ path: ssPath, fullPage: true });
        result.screenshot = ssPath;
        log(`  screenshot saved: ${ssPath}`);
      } catch (e) {
        result.error = String(e.message || e);
        log(`  ERROR: ${result.error}`);
      } finally {
        await ctx.close();
      }
      allResults.push(result);
    }
  }

  await browser.close();

  // Aggregate
  const summary = {
    timestamp: new Date().toISOString(),
    version_target: 'v5.10.158',
    total_pages: allResults.length,
    success: allResults.filter(r => !r.error).length,
    error: allResults.filter(r => r.error).length,
    total_card_stacks: allResults.reduce((a, r) => a + (r.stats?.stackCount || 0), 0),
    total_cards: allResults.reduce((a, r) => a + (r.stats?.totalCards || 0), 0),
    total_empty_cards: allResults.reduce((a, r) => a + (r.stats?.cardsEmpty || 0), 0),
    total_card_overflow: allResults.reduce((a, r) => a + (r.stats?.cardOverflow || 0), 0),
    total_truncated_cells: allResults.reduce((a, r) => a + (r.stats?.truncatedCells || 0), 0),
    total_horiz_overflow_pages: allResults.filter(r => r.stats?.horizOverflow).length,
    total_long_tables_remaining_table: allResults.reduce((a, r) => a + (r.stats?.longTables || 0), 0),
  };

  log(`\n========== SUMMARY ==========`);
  log(JSON.stringify(summary, null, 2));

  fs.writeFileSync(
    path.join(__dirname, 'v5_10_158_qa_result.json'),
    JSON.stringify({ summary, results: allResults }, null, 2)
  );
  log(`\nWritten: v5_10_158_qa_result.json`);
})();
