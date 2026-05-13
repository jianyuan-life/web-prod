const PW_PATH = 'C:\\Users\\Administrator\\AppData\\Local\\npm-cache\\_npx\\705bc6b22212b352\\node_modules\\playwright';
const { chromium } = require(PW_PATH);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('https://jianyuan.life/report/d143f949-192c-4808-a516-61b03a19f146', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  const inspect = await page.evaluate(() => {
    const wrapper = document.querySelector('.table-breakout');
    if (!wrapper) return { error: 'no wrapper' };
    const innerTable = wrapper.querySelector('table');
    const tbody = innerTable.querySelector('tbody');
    const firstTr = tbody.firstElementChild;
    const firstCell = firstTr.firstElementChild;

    // What rules apply to firstCell?
    const matchingRules = [];
    function walkRules(rules, mediaText = '') {
      for (const rule of rules || []) {
        if (rule.cssRules) {
          // CSSMediaRule, CSSSupportsRule, etc
          walkRules(rule.cssRules, mediaText + (rule.media ? '@media ' + rule.media.mediaText : ''));
        }
        if (rule.selectorText) {
          const selectors = rule.selectorText.split(',').map(s => s.trim());
          for (const sel of selectors) {
            try {
              if (firstCell.matches(sel)) {
                const props = {};
                for (let i = 0; i < rule.style.length; i++) {
                  const prop = rule.style.item(i);
                  props[prop] = rule.style.getPropertyValue(prop);
                }
                if (props.position || props.left || props['background-color'] || props.background) {
                  matchingRules.push({ selector: sel, media: mediaText, props });
                }
              }
            } catch (e) {}
          }
        }
      }
    }
    for (const sheet of document.styleSheets) {
      try { walkRules(sheet.cssRules); } catch (e) {}
    }

    return {
      cellTag: firstCell.tagName,
      cellInlineStyle: firstCell.getAttribute('style'),
      cellComputedPosition: getComputedStyle(firstCell).position,
      matchingStickyRules: matchingRules,
      // Also test if tbody > tr > td:first-child matches a th
      thMatches_tdSelector: firstCell.matches('tbody td:first-child'),
      thMatches_thSelector: firstCell.matches('tbody tr:first-child th:first-child'),
    };
  });
  console.log(JSON.stringify(inspect, null, 2));
  await browser.close();
})();
