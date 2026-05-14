/*
 * v5.10.324 (P0 #4 CSP 強化第一步)
 * 把原本 app/layout.tsx 內嵌的 DevTools 版權警告 + 右鍵禁用搬到外部 .js
 * 目的:CSP 之後可移除 script-src 'unsafe-inline'(目前 FB Pixel 還在 inline、待 Sprint 2 統一 nonce 化)
 *
 * 載入方式:<script src="/scripts/devtools-warning.js" defer></script>
 */
(function () {
  'use strict';

  try {
    // DevTools 開啟時的版權警告(讓抓 console 的人看到法律告示)
    var styles = 'color:#c9a84c;font-size:16px;font-weight:bold';
    var title = '%c⚠️ 鑒源 JianYuan — 版權所有';
    var body =
      '本網站所有原始碼、演算法、命理規則引擎均受智慧財產權保護。\n' +
      '未經授權複製、修改或散佈將依法追究。\n\n' +
      '© 2026 鑒源 JianYuan. All rights reserved.\n' +
      'https://jianyuan.life';
    console.log(title, styles, body);
  } catch (e) {
    /* console 不可用時靜默 */
  }

  // 報告頁禁右鍵(避免複製貼上 AI 生成內容到對手平台)
  try {
    document.addEventListener('contextmenu', function (e) {
      try {
        if (e.target && e.target.closest && e.target.closest('main')) {
          // 只在 <main> 內封鎖、不影響全站體驗
          e.preventDefault();
        }
      } catch (err) {
        /* 防止 closest 在 SVG / shadow DOM 噴錯 */
      }
    });
  } catch (e) {
    /* 老 browser 無 addEventListener 時靜默 */
  }
})();
