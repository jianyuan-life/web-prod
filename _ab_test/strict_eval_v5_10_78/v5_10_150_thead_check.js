const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('https://jianyuan.life/report/d143f949-192c-4808-a516-61b03a19f146', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  const stat = await page.evaluate(() => {
    const wrappers = document.querySelectorAll('.table-breakout');
    const out = { wrapperCount: wrappers.length, samples: [] };
    for (let i = 0; i < Math.min(3, wrappers.length); i++) {
      const w = wrappers[i];
      const innerTable = w.querySelector('table');
      const sample = {
        idx: i,
        wrapperTag: w.tagName,
        innerTable: !!innerTable,
        innerTableHTML_first300: innerTable ? innerTable.outerHTML.substring(0, 300) : null,
        thCountInTable: innerTable ? innerTable.querySelectorAll('th').length : 0,
        tdCountInTable: innerTable ? innerTable.querySelectorAll('td').length : 0,
        theadCountInTable: innerTable ? innerTable.querySelectorAll('thead').length : 0,
        tbodyCountInTable: innerTable ? innerTable.querySelectorAll('tbody').length : 0,
      };
      // try query first th/td and report computed style
      if (innerTable) {
        const firstTh = innerTable.querySelector('th');
        if (firstTh) {
          const cs = getComputedStyle(firstTh);
          sample.firstTh_position = cs.position;
          sample.firstTh_left = cs.left;
          sample.firstTh_bg = cs.backgroundColor;
          sample.firstTh_isFirstChild = firstTh.matches(':first-child');
          // also test the exact selector v5.10.150 uses
          const matchSel = innerTable.querySelector('thead > tr > th:first-child');
          sample.matches_thead_tr_th_firstChild = !!matchSel;
        }
      }
      out.samples.push(sample);
    }
    return out;
  });
  console.log(JSON.stringify(stat, null, 2));
  await browser.close();
})();
