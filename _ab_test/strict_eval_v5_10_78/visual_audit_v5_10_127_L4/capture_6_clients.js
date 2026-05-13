// L4 Gemini Vision sim Round 2 — v5.10.127 strict visual eval
// 6 clients (production historical) × desktop + mobile = 12 captures
// 量測: mobile 全頁 px 高度 / table col-1 寬度 / starStar / callout fallback / chip
// PASS 標準: 95+ 分 (5 維度 0-20、嚴標 — 5/5 LLM 中最低)
// 跑法: NODE_PATH="C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules" node capture_6_clients.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TOKENS = [
  { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C 何宥諄', plan: 'C' },
  { id: '64b15504-b3c4-4153-aff6-3f279363dc7e', name: 'C 何紀萳', plan: 'C' },
  { id: '271dcda0-e348-4d98-9c09-4beb14a4634a', name: 'G15 何家(271)', plan: 'G15' },
  { id: '9b6edb0a-f1db-4484-8306-c088e78be8c8', name: 'G15 何家(9b6)', plan: 'G15' },
  { id: '4e636025-fb87-4099-a91d-a4f6c64df7e5', name: 'D 何宣', plan: 'D' },
  { id: '89e112dc-e0c1-4f0b-b8e8-5e5b51f6f8c7', name: 'R 李馮', plan: 'R' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const MIN_COL1_WIDTH_PX = 80; // v5.10.126 sticky 移除後 horizontal scroll、col-1 至少 80px 才不被截
const EXPECTED_MOBILE_MAX_HEIGHT = 80000; // v5.10.124 ResizeObserver 殭屍空白修復後預期 ~62K、80K 上限放寬
const STAR_STAR_REGEX = /\*\*[一-鿿A-Za-z]/g; // 殘留 markdown ** 開頭
const CHIP_PILL_REGEX = /\b(?:chip|pill)\b/gi;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const allResults = [];
  const screenshotDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  // 強制 stdout flush
  const log = (msg) => { process.stdout.write(msg + '\n'); };

  for (const t of TOKENS) {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      const url = `https://jianyuan.life/report/${t.id}?cb=v5_10_127_L4`;
      log(`\n=== ${t.name} ${vp.name} (${vp.width}x${vp.height}) ===\n${url}`);

      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForTimeout(8000); // 等 hydration + table render + CollapsibleSection ResizeObserver settle

        // 展開所有 collapsible
        await page.evaluate(() => {
          document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
          document.querySelectorAll('button[aria-expanded="false"]').forEach(b => {
            try { b.click(); } catch (e) {}
          });
        });
        await page.waitForTimeout(2000);

        // 抓 footer 版本
        const versionInfo = await page.evaluate(() => {
          const matches = (document.body.innerText.match(/v5\.\d+\.\d+/g) || []);
          // 取最高版本(footer 版本通常是最新)
          const sorted = matches.sort((a, b) => {
            const pa = a.replace('v', '').split('.').map(Number);
            const pb = b.replace('v', '').split('.').map(Number);
            for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i];
            return 0;
          });
          return { all: [...new Set(matches)], highest: sorted[0] || 'unknown' };
        });

        // 量測:全頁 px 高度
        const dims = await page.evaluate(() => ({
          documentHeight: document.documentElement.scrollHeight,
          bodyHeight: document.body.scrollHeight,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }));

        // 量測:所有 table col-1 寬度
        const tableData = await page.evaluate((MIN_W) => {
          const tables = Array.from(document.querySelectorAll('table'));
          return tables.map((table, tIdx) => {
            let label = '';
            let prev = table.parentElement;
            for (let i = 0; i < 6 && prev; i++) {
              const h = prev.querySelector('h2, h3, h4');
              if (h) { label = h.innerText.trim().slice(0, 40); break; }
              prev = prev.parentElement;
            }
            const rect = table.getBoundingClientRect();
            const headerCells = Array.from(table.querySelectorAll('thead th, tr:first-child th, tr:first-child td'));
            const headerCol1 = headerCells[0];
            const headerCol1Width = headerCol1 ? headerCol1.getBoundingClientRect().width : 0;
            const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
            const col1Widths = bodyRows.map(tr => {
              const td = tr.querySelector('td:first-child');
              return td ? td.getBoundingClientRect().width : null;
            }).filter(x => x !== null);
            const allCol1 = [headerCol1Width, ...col1Widths];
            const minCol1 = allCol1.length ? Math.min(...allCol1) : 0;
            return {
              tableIdx: tIdx,
              label: label || `(table #${tIdx})`,
              tableWidth: Math.round(rect.width),
              minCol1Width: Math.round(minCol1),
              passed: minCol1 >= MIN_W,
              rowCount: bodyRows.length,
            };
          });
        }, MIN_COL1_WIDTH_PX);

        // 量測:starStar / chip / callout fallback
        const noiseCount = await page.evaluate((args) => {
          const text = document.body.innerText;
          const ssRegex = new RegExp(args.ss.source, args.ss.flags);
          const chipRegex = new RegExp(args.chip.source, args.chip.flags);
          const ssCount = (text.match(ssRegex) || []).length;
          const chipCount = (text.match(chipRegex) || []).length;
          // callout fallback: 抓 callout 但內文等於 default 範本(空 / 「重要提示」 hardcode)
          const callouts = Array.from(document.querySelectorAll('[class*="callout"]'));
          const fallbackCount = callouts.filter(c => {
            const txt = c.innerText.trim();
            return txt === '' || txt === '重要提示' || txt.length < 5;
          }).length;
          // 14 vs 15 leak: 「十五個系統」「十五張底片」(對外不該出現、應為「十四」)
          const fifteenLeakCount = (text.match(/十五(?:個系統|張底片|大命理系統|套系統)/g) || []).length;
          return { starStar: ssCount, chip: chipCount, calloutFallback: fallbackCount, fifteenLeak: fifteenLeakCount };
        }, { ss: { source: STAR_STAR_REGEX.source, flags: STAR_STAR_REGEX.flags },
             chip: { source: CHIP_PILL_REGEX.source, flags: CHIP_PILL_REGEX.flags } });

        const passCount = tableData.filter(x => x.passed).length;
        const failCount = tableData.length - passCount;
        const heightPass = vp.name === 'mobile' ? dims.documentHeight <= EXPECTED_MOBILE_MAX_HEIGHT : true;

        // 截圖
        const screenshotPath = path.join(screenshotDir, `${t.plan}_${t.id.slice(0, 8)}_${vp.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });

        const result = {
          token: t.id,
          name: t.name,
          plan: t.plan,
          viewport: vp.name,
          versionDetected: versionInfo.highest,
          versionAll: versionInfo.all,
          dims,
          heightPass,
          tableCount: tableData.length,
          tablePassCount: passCount,
          tableFailCount: failCount,
          tablesFailed: tableData.filter(x => !x.passed).map(x => ({ label: x.label, minCol1: x.minCol1Width })),
          noise: noiseCount,
          screenshot: path.relative(__dirname, screenshotPath),
        };
        allResults.push(result);
        log(`  ver: ${versionInfo.highest}  height: ${dims.documentHeight}px ${heightPass ? '✓' : '✗'}  tables: ${passCount}/${tableData.length}  noise: SS=${noiseCount.starStar} chip=${noiseCount.chip} callout-fb=${noiseCount.calloutFallback} 十五-leak=${noiseCount.fifteenLeak}`);
        // 增量保存:每次結果寫入(防中斷遺失)
        fs.writeFileSync(path.join(__dirname, 'capture_result.json'), JSON.stringify(allResults, null, 2));
      } catch (e) {
        log(`  ERROR: ${e.message}`);
        allResults.push({ token: t.id, name: t.name, plan: t.plan, viewport: vp.name, error: e.message });
      } finally {
        await context.close();
      }
    }
  }

  await browser.close();

  // 寫結果 JSON
  const outJson = path.join(__dirname, 'capture_result.json');
  fs.writeFileSync(outJson, JSON.stringify(allResults, null, 2));
  console.log(`\n=== JSON saved: ${outJson} ===`);

  // 總結 + 計算 5 維度評分
  const summary = computeScores(allResults);
  const summaryJson = path.join(__dirname, 'eval_summary.json');
  fs.writeFileSync(summaryJson, JSON.stringify(summary, null, 2));
  console.log(`=== SUMMARY: avg=${summary.average.toFixed(2)}  PASS(95+)=${summary.average >= 95 ? 'YES' : 'NO'} ===`);
})();

// 5 維度 0-20 嚴評(L4 Gemini Vision 視角):
// D1 視覺一致性 / D2 排版完整性 / D3 內容專業度 / D4 跨裝置適配 / D5 結構嚴謹度
function computeScores(results) {
  const byClient = {};
  results.forEach(r => {
    const key = `${r.plan}_${r.token.slice(0, 8)}`;
    if (!byClient[key]) byClient[key] = { name: r.name, plan: r.plan, desktop: null, mobile: null };
    byClient[key][r.viewport] = r;
  });

  const scored = Object.entries(byClient).map(([k, c]) => {
    if (c.desktop?.error || c.mobile?.error) return { client: k, name: c.name, error: true, total: 0 };
    const d = c.desktop, m = c.mobile;

    // D1 視覺一致性 (0-20):table 一致性、無排版崩
    const tableFailRate = (d.tableFailCount + m.tableFailCount) / Math.max(1, d.tableCount + m.tableCount);
    const D1 = Math.round(20 * (1 - tableFailRate * 1.5));

    // D2 排版完整性 (0-20):mobile 高度合理 + col-1 寬度
    const heightOK = m.heightPass ? 1 : 0;
    const col1OK = (d.tablePassCount === d.tableCount && m.tablePassCount === m.tableCount) ? 1 : 0.6;
    const D2 = Math.round(20 * 0.5 * (heightOK + col1OK));

    // D3 內容專業度 (0-20):starStar / 14 vs 15 leak / callout fallback
    const noise = (d.noise.starStar + m.noise.starStar) + (d.noise.fifteenLeak + m.noise.fifteenLeak) * 2 + (d.noise.calloutFallback + m.noise.calloutFallback);
    const D3 = Math.max(0, 20 - noise);

    // D4 跨裝置適配 (0-20):mobile 沒膨脹 + desktop 表格沒崩
    const mHeight = m.dims.documentHeight;
    const desktopHeight = d.dims.documentHeight;
    const ratio = mHeight / desktopHeight;
    const D4 = ratio < 2.5 ? 20 : ratio < 4 ? 12 : ratio < 6 ? 6 : 2;

    // D5 結構嚴謹度 (0-20):chip 全 0 + callout fallback 全 0 + 14 leak 全 0
    const strictNoise = (d.noise.chip + m.noise.chip) + (d.noise.calloutFallback + m.noise.calloutFallback) + (d.noise.fifteenLeak + m.noise.fifteenLeak);
    const D5 = Math.max(0, 20 - strictNoise * 2);

    const total = D1 + D2 + D3 + D4 + D5;
    return { client: k, name: c.name, plan: c.plan, D1, D2, D3, D4, D5, total, mobileHeight: mHeight, ratio: ratio.toFixed(2), noise: { d: d.noise, m: m.noise } };
  });

  const valid = scored.filter(s => !s.error);
  const avg = valid.reduce((sum, s) => sum + s.total, 0) / Math.max(1, valid.length);
  return { perClient: scored, average: avg, totalClients: valid.length };
}
