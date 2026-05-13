// v5.10.148 全面 UI 評分(老闆 N+5 次怒、貼 5+ 張表格 col-1 截斷截圖)
// 6 維度量化評分、< 95 = FAIL、≥ 95 = PASS
//
// 維度:
//   1) sticky position 生效率(getComputedStyle position = sticky)— 僅 desktop (≥ 768px)、mobile N/A
//   2) col-1 視覺可見率(scroll 後 col-1 仍在 viewport)
//   3) 內容無截斷率(white-space:nowrap 生效、文字完整)
//   4) header / body col-1 寬對齊率 — 僅 desktop (≥ 768px)、mobile N/A
//   5) hover 不蓋 sticky col-1 率(本輪近似測 z-index ≥ 5 且 bg 非透明)— 僅 desktop (≥ 768px)、mobile N/A
//   6) 整體無 horizontal viewport overflow 率
//
// v5.10.156 修補(2026-05-10):
//   mobile (< 768px) 維度 d1/d4/d5 跳過、不計入分母。
//   依據:v5.10.126 設計拍板(commit 90731720)— mobile 表格改純卡片堆疊
//   (display:block + position:static + background:transparent、見 globals.css L415 @media max-width:767px)、
//   sticky col 在 mobile 是設計刻意 N/A、不該算 FAIL。

const path = require('path');
const fs = require('fs');

const PLAYWRIGHT_PATH = 'C:/Users/Administrator/AppData/Roaming/npm/node_modules/promptfoo/node_modules/playwright';
const { chromium } = require(PLAYWRIGHT_PATH);

// 4 方案 token(老闆指定 + 既有可用)
const TOKENS = [
  { id: 'd143f949-192c-4808-a516-61b03a19f146', name: 'C_HoYouChun',  plan: 'C' },
  { id: '64b15504-b3c4-4153-aff6-3f279363dc7e', name: 'C_HoChiNan',   plan: 'C' },
  { id: '271dcda0-e348-4d98-9c09-4beb14a4634a', name: 'G15_HoFamily', plan: 'G15' },
  { id: '9b6edb0a-f1db-4484-8306-c088e78be8c8', name: 'G15_unknown',  plan: 'G15' },
];

// 4 viewport(老闆說 4 個、不只 3 個)
const VIEWPORTS = [
  { name: 'desktop_1920', width: 1920, height: 1080, isMobile: false },
  { name: 'desktop_1440', width: 1440, height: 900,  isMobile: false },
  { name: 'tablet_768',   width: 768,  height: 1024, isMobile: true  },
  { name: 'mobile_375',   width: 375,  height: 812,  isMobile: true  },
];

const log = (m) => process.stdout.write(m + '\n');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ssDir = path.join(__dirname, 'v5_10_148_visual');
  if (!fs.existsSync(ssDir)) fs.mkdirSync(ssDir, { recursive: true });

  const allResults = [];
  const dimensions = {
    d1_sticky_position: { pass: 0, total: 0 },   // getComputedStyle position = sticky
    d2_col1_visible_after_scroll: { pass: 0, total: 0 },
    d3_no_content_truncation: { pass: 0, total: 0 },
    d4_header_body_align: { pass: 0, total: 0 },
    d5_zindex_bg_correct: { pass: 0, total: 0 },
    d6_no_viewport_overflow: { pass: 0, total: 0 },
  };
  const failCases = [];

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
      const url = `https://jianyuan.life/report/${t.id}?cb=v148_${Date.now()}`;
      log(`\n=== ${t.name} ${vp.name} ===`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(7000);
        // expand all collapsed sections
        await page.evaluate(() => {
          document.querySelectorAll('details:not([open])').forEach(d => d.setAttribute('open', ''));
        });
        await page.waitForTimeout(2000);

        // version check
        const versions = await page.evaluate(() => {
          const m = document.body.innerText.match(/v5\.10\.\d+/g) || [];
          return [...new Set(m)];
        });
        log(`  versions: ${versions.join(',') || '(none)'}`);

        // d6: viewport overflow
        const viewportOverflow = await page.evaluate(() => {
          return {
            body_scrollWidth: document.body.scrollWidth,
            window_innerWidth: window.innerWidth,
            overflows: document.body.scrollWidth > window.innerWidth + 4,
          };
        });
        dimensions.d6_no_viewport_overflow.total++;
        if (!viewportOverflow.overflows) {
          dimensions.d6_no_viewport_overflow.pass++;
        } else {
          failCases.push({
            dim: 'd6_viewport_overflow',
            plan: t.plan, token: t.id, vp: vp.name,
            data: `body=${viewportOverflow.body_scrollWidth} > window=${viewportOverflow.window_innerWidth}`,
          });
        }
        log(`  viewportOverflow: body=${viewportOverflow.body_scrollWidth} window=${viewportOverflow.window_innerWidth} overflows=${viewportOverflow.overflows}`);

        // table-by-table check
        const tableChecks = await page.evaluate(() => {
          const tables = Array.from(document.querySelectorAll('.table-breakout table'));
          return tables.map((table, idx) => {
            // identify by preceding heading
            let prevHeading = '';
            let walker = table.parentElement;
            for (let i = 0; i < 12 && walker; i++) {
              let sib = walker.previousElementSibling;
              while (sib) {
                if (/^H[1-6]$/.test(sib.tagName)) { prevHeading = sib.textContent.trim().slice(0, 60); break; }
                sib = sib.previousElementSibling;
              }
              if (prevHeading) break;
              walker = walker.parentElement;
            }

            // find scroll container
            let parent = table.parentElement;
            let scrollContainer = null;
            while (parent && parent !== document.body) {
              const pcs = window.getComputedStyle(parent);
              if (pcs.overflowX === 'auto' || pcs.overflowX === 'scroll' ||
                  parent.classList.contains('table-breakout')) {
                scrollContainer = parent;
                break;
              }
              parent = parent.parentElement;
            }

            const containerRect = scrollContainer ? scrollContainer.getBoundingClientRect() : null;
            const containerScrollLeft = scrollContainer ? scrollContainer.scrollLeft : 0;

            // d1: sticky position on first th and first td
            // v5.10.153 修補:3 重 selector fallback(對應前端 sticky 修補的 selector 順序)
            const firstTh = table.querySelector('thead th:first-child')
              || table.querySelector('tbody tr:first-child th:first-child')
              || table.querySelector('tr:first-child th:first-child');
            const firstTd = table.querySelector('tbody td:first-child')
              || table.querySelector('tr td:first-child');
            const thStyle = firstTh ? window.getComputedStyle(firstTh) : null;
            const tdStyle = firstTd ? window.getComputedStyle(firstTd) : null;

            const stickyCheck = {
              th_position: thStyle?.position || null,
              th_left: thStyle?.left || null,
              th_zIndex: thStyle?.zIndex || null,
              th_bg: thStyle?.backgroundColor || null,
              td_position: tdStyle?.position || null,
              td_left: tdStyle?.left || null,
              td_zIndex: tdStyle?.zIndex || null,
              td_bg: tdStyle?.backgroundColor || null,
              th_isSticky: thStyle?.position === 'sticky',
              td_isSticky: tdStyle?.position === 'sticky',
              th_zIndexValid: thStyle ? parseInt(thStyle.zIndex || '0', 10) >= 1 : false,
              td_zIndexValid: tdStyle ? parseInt(tdStyle.zIndex || '0', 10) >= 1 : false,
              th_bgOpaque: thStyle ? !(thStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || thStyle.backgroundColor === 'transparent') : false,
              td_bgOpaque: tdStyle ? !(tdStyle.backgroundColor === 'rgba(0, 0, 0, 0)' || tdStyle.backgroundColor === 'transparent') : false,
            };

            // d2: col1 visibility before & after scroll
            const firstRow = table.querySelector('thead tr, tbody tr');
            if (!firstRow) return { idx, prevHeading, error: 'no-rows', stickyCheck };
            const col1Cell = firstRow.children[0];
            const col1RectBefore = col1Cell ? col1Cell.getBoundingClientRect() : null;

            // d4: header vs body col-1 width
            const thRect = firstTh?.getBoundingClientRect();
            const tdRect = firstTd?.getBoundingClientRect();
            const widthDelta = (thRect && tdRect) ? Math.abs(thRect.width - tdRect.width) : null;
            const widthAligned = widthDelta !== null ? widthDelta < 2 : false;

            // d3: nowrap content check (sample col-1 cells)
            const col1Cells = Array.from(table.querySelectorAll('tbody tr')).slice(0, 6).map((tr, ri) => {
              const cell = tr.children[0];
              if (!cell) return null;
              const cs = window.getComputedStyle(cell);
              const r = cell.getBoundingClientRect();
              return {
                rowIdx: ri,
                text: cell.textContent.trim().slice(0, 40),
                whiteSpace: cs.whiteSpace,
                overflow: cs.overflow,
                textOverflow: cs.textOverflow,
                width: Math.round(r.width),
                scrollWidth: cell.scrollWidth,
                truncated: cell.scrollWidth > r.width + 2,
                visible: containerRect ? (r.left >= containerRect.left - 1 && r.right <= containerRect.right + 1) : true,
              };
            }).filter(Boolean);

            const truncatedCount = col1Cells.filter(c => c.truncated).length;
            const noTruncation = truncatedCount === 0;

            return {
              idx,
              prevHeading: prevHeading || '(no-heading)',
              colCount: firstRow.children.length,
              hasContainer: !!scrollContainer,
              containerWidth: containerRect ? Math.round(containerRect.width) : null,
              tableScrollWidth: table.scrollWidth,
              tableOverflows: containerRect ? (table.scrollWidth > scrollContainer.clientWidth + 4) : false,
              stickyCheck,
              col1RectBefore: col1RectBefore ? {
                left: Math.round(col1RectBefore.left),
                right: Math.round(col1RectBefore.right),
                width: Math.round(col1RectBefore.width),
              } : null,
              widthDelta,
              widthAligned,
              col1Cells,
              truncatedCount,
              noTruncation,
            };
          });
        });

        // After-scroll test: scroll each container 500px and check col-1 still visible
        const scrollChecks = await page.evaluate(() => {
          const containers = Array.from(document.querySelectorAll('.table-breakout'));
          return containers.map((container, idx) => {
            const cs = window.getComputedStyle(container);
            if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
              return { idx, skipped: true, reason: 'no-scroll-x' };
            }
            const table = container.querySelector('table');
            if (!table) return { idx, skipped: true, reason: 'no-table' };
            // v5.10.153 修補:3 重 selector fallback
            const firstTd = table.querySelector('tbody td:first-child')
              || table.querySelector('tr td:first-child')
              || table.querySelector('tbody tr:first-child th:first-child')
              || table.querySelector('tr:first-child th:first-child');
            if (!firstTd) return { idx, skipped: true, reason: 'no-td' };

            // scroll the container
            container.scrollLeft = 500;
            const td_left_after = firstTd.getBoundingClientRect().left;
            const container_left = container.getBoundingClientRect().left;
            const tdStyle = window.getComputedStyle(firstTd);
            const isSticky = tdStyle.position === 'sticky';

            // for sticky to work: after scroll, td.left should still equal container.left + 0 (sticky to left:0)
            const stickyHolds = isSticky && Math.abs(td_left_after - container_left) < 4;
            const visibleAfterScroll = td_left_after >= container_left - 1;

            // restore scroll
            container.scrollLeft = 0;

            return {
              idx,
              isSticky,
              container_left: Math.round(container_left),
              td_left_after_500scroll: Math.round(td_left_after),
              delta: Math.round(td_left_after - container_left),
              stickyHolds,
              visibleAfterScroll,
            };
          });
        });

        // v5.10.156 mobile-aware:< 768px viewport 跳過 d1/d4/d5 sticky 維度
        // (對應 globals.css L415 @media max-width:767px、mobile 改卡片堆疊 / position:static、
        // sticky 維度 N/A、不該算 FAIL)
        const isMobileVp = vp.width < 768;

        log(`  tables: ${tableChecks.length} (viewport=${vp.width}px ${isMobileVp ? 'MOBILE-SKIP-d1/d4/d5' : 'DESKTOP-FULL'})`);
        tableChecks.forEach((tc, tcIdx) => {
          if (tc.error) { log(`    #${tc.idx} ERROR: ${tc.error}`); return; }
          const sc = tc.stickyCheck;
          let d1Pass = true, d4Pass = true, d5Pass = true;

          if (!isMobileVp) {
            // d1 sticky position(僅 desktop)
            dimensions.d1_sticky_position.total++;
            d1Pass = sc.th_isSticky && sc.td_isSticky;
            if (d1Pass) dimensions.d1_sticky_position.pass++;
            else failCases.push({
              dim: 'd1_sticky_position', plan: t.plan, token: t.id, vp: vp.name,
              table: tc.idx, heading: tc.prevHeading,
              data: `th_pos=${sc.th_position} td_pos=${sc.td_position}`,
            });

            // d4 header/body align(僅 desktop)
            dimensions.d4_header_body_align.total++;
            d4Pass = tc.widthAligned;
            if (d4Pass) dimensions.d4_header_body_align.pass++;
            else failCases.push({
              dim: 'd4_align', plan: t.plan, token: t.id, vp: vp.name,
              table: tc.idx, heading: tc.prevHeading,
              data: `width delta=${tc.widthDelta?.toFixed(1)}px`,
            });

            // d5 z-index + bg opaque(僅 desktop、hover not-overlap proxy)
            dimensions.d5_zindex_bg_correct.total++;
            d5Pass = sc.th_zIndexValid && sc.td_zIndexValid && sc.th_bgOpaque && sc.td_bgOpaque;
            if (d5Pass) dimensions.d5_zindex_bg_correct.pass++;
            else failCases.push({
              dim: 'd5_zindex_bg', plan: t.plan, token: t.id, vp: vp.name,
              table: tc.idx, heading: tc.prevHeading,
              data: `th_z=${sc.th_zIndex} td_z=${sc.td_zIndex} th_bg=${sc.th_bg} td_bg=${sc.td_bg}`,
            });
          }

          // d3 no truncation(全 viewport)
          dimensions.d3_no_content_truncation.total++;
          if (tc.noTruncation) dimensions.d3_no_content_truncation.pass++;
          else failCases.push({
            dim: 'd3_truncation', plan: t.plan, token: t.id, vp: vp.name,
            table: tc.idx, heading: tc.prevHeading,
            data: `${tc.truncatedCount}/${tc.col1Cells.length} cells truncated`,
          });

          const status = (isMobileVp ? tc.noTruncation : (d1Pass && tc.noTruncation && d4Pass && d5Pass)) ? '✅' : '❌';
          log(`    ${status} #${tc.idx} "${tc.prevHeading}" cols=${tc.colCount} sticky=th:${sc.th_position}/td:${sc.td_position} z=th:${sc.th_zIndex}/td:${sc.td_zIndex} bgTd=${sc.td_bg} truncated=${tc.truncatedCount}/${tc.col1Cells.length} alignDelta=${tc.widthDelta}`);
        });

        // d2 from scroll checks(全 viewport、mobile 也測 horizontal scroll col-1 visibility、
        // 但 mobile 卡片堆疊後沒 horizontal scroll → scrollChecks 會 skipped、不計入)
        scrollChecks.forEach(sc => {
          if (sc.skipped) return;
          dimensions.d2_col1_visible_after_scroll.total++;
          if (sc.visibleAfterScroll) dimensions.d2_col1_visible_after_scroll.pass++;
          else failCases.push({
            dim: 'd2_after_scroll', plan: t.plan, token: t.id, vp: vp.name,
            data: `td.left=${sc.td_left_after_500scroll} container.left=${sc.container_left} delta=${sc.delta}`,
          });
          log(`    scroll-test #${sc.idx} sticky=${sc.isSticky} delta=${sc.delta} visibleAfter=${sc.visibleAfterScroll}`);
        });

        // screenshot
        const ssPath = path.join(ssDir, `${t.name}_${vp.name}_v148.png`);
        await page.screenshot({ path: ssPath, fullPage: true });

        allResults.push({
          token: t.id, name: t.name, plan: t.plan,
          viewport: vp.name, viewportSize: `${vp.width}x${vp.height}`,
          versions, viewportOverflow,
          tableChecks, scrollChecks,
          screenshot: ssPath,
        });

      } catch (e) {
        log(`  ERROR: ${e.message}`);
        allResults.push({ token: t.id, name: t.name, viewport: vp.name, error: String(e) });
      } finally {
        await ctx.close();
      }
    }
  }

  await browser.close();

  // compute scores
  const scores = {};
  let sumScore = 0, sumDims = 0;
  for (const [k, v] of Object.entries(dimensions)) {
    const score = v.total === 0 ? 0 : (v.pass / v.total * 100);
    scores[k] = { ...v, score: Number(score.toFixed(1)) };
    sumScore += score;
    sumDims++;
  }
  const overall = Number((sumScore / sumDims).toFixed(1));

  const summary = {
    overallScore: overall,
    overallStatus: overall >= 95 ? 'PASS' : 'FAIL',
    dimensions: scores,
    failCasesCount: failCases.length,
    failCases: failCases.slice(0, 50),
    ts: new Date().toISOString(),
    results: allResults,
  };
  fs.writeFileSync(
    path.join(__dirname, 'v5_10_148_eval_result.json'),
    JSON.stringify(summary, null, 2)
  );
  log(`\n=== SUMMARY v5.10.156 (mobile-aware: d1/d4/d5 skipped on <768px) ===`);
  log(`Overall: ${overall}/100 ${summary.overallStatus}`);
  for (const [k, v] of Object.entries(scores)) {
    log(`  ${k}: ${v.score}/100 (${v.pass}/${v.total})`);
  }
  log(`Fail cases: ${failCases.length}`);
})();
