// QA R2 v5.10.162 — focused label/value style verification (P1-3 fix)
const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto('https://jianyuan.life/report/d143f949-192c-4808-a516-61b03a19f146?cb=qa_r2_label', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);
  await page.waitForSelector('.report-card', { timeout: 15000 });

  const result = await page.evaluate(() => {
    const card = document.querySelector('.report-card');
    if (!card) return { err: 'no card' };
    // Label is inline span, no role attribute. Get all role=listitem div, take first/last span children
    const items = card.querySelectorAll('[role="listitem"]');
    const samples = Array.from(items).slice(0, 3).map((it, i) => {
      const spans = it.querySelectorAll('span');
      const labelEl = spans[0];
      const valueEl = spans[1];
      const lblCS = labelEl ? getComputedStyle(labelEl) : null;
      const valCS = valueEl ? getComputedStyle(valueEl) : null;
      return {
        idx: i,
        labelText: labelEl ? labelEl.textContent.trim() : null,
        labelColor: lblCS ? lblCS.color : null,
        labelFontSize: lblCS ? lblCS.fontSize : null,
        labelFontWeight: lblCS ? lblCS.fontWeight : null,
        labelLetterSpacing: lblCS ? lblCS.letterSpacing : null,
        labelMinWidth: lblCS ? lblCS.minWidth : null,
        valueText: valueEl ? valueEl.textContent.trim().slice(0, 40) : null,
        valueColor: valCS ? valCS.color : null,
        valueFontSize: valCS ? valCS.fontSize : null,
      };
    });
    // h4 title
    const h4 = card.querySelector('h4');
    const h4CS = h4 ? getComputedStyle(h4) : null;
    return {
      cardCount: document.querySelectorAll('.report-card').length,
      itemCount: items.length,
      titleText: h4 ? h4.textContent.trim() : null,
      titleFontSize: h4CS ? h4CS.fontSize : null,
      titleColor: h4CS ? h4CS.color : null,
      titleBorderBottom: h4CS ? h4CS.borderBottom : null,
      samples,
    };
  });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
