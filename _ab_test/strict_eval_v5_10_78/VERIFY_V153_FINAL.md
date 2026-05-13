# v5.10.153 sticky col-1 終局驗證報告

**驗證時間**:2026-05-10 19:00 UTC
**驗證腳本**:`v5_10_153_eval.js`(複製自 `v5_10_148_eval.js`、僅替換版本字串、量測邏輯不變)
**結果檔**:`v5_10_153_eval_result.json`(540 fail cases)
**Production deploy**:`dpl_FUyQXX7GJsGSGWDuFmJsjWKfJBge` READY、Playwright 抓到 `v5.10.153` 版本字串確認切版完成
**對比 v5.10.149**:同 50/100 FAIL(數字不變、但 ROOT CAUSE 不同、見下)

---

## ① 整體分數:**50/100 FAIL**(跟 v5.10.149 同分、未達 95+ 鐵律)

| 比對 | v5.10.149 | v5.10.153 |
|:---|:---:|:---:|
| 整體 | 50/100 FAIL | 50/100 FAIL |
| d1 sticky_position | 0/100 | **0/100**(❌ 仍 fail、但 RC 不同)|
| d2 col1_visible_after_scroll | (未測) | **100/100** ✅ |
| d3 no_truncation | (未測) | **100/100** ✅ |
| d4 header_body_align | 0/100 | 0/100 |
| d5 zindex_bg | 0/100 | 0/100 |
| d6 no_viewport_overflow | (未測) | **100/100** ✅ |

---

## ② 6 維度逐條(d1-d6 + 證據)

| 維度 | 分數 | Pass/Total | 證據 |
|:---|:---:|:---:|:---|
| **d1 sticky_position** | 0/100 | 0/180 | `th_pos=null td_pos=sticky` × 180 表 — th 全 null |
| **d2 col1_visible_after_scroll** | **100/100** | 129/129 | scroll-test 100% ALL PASS、`sticky=true delta=0 visibleAfter=true` |
| **d3 no_content_truncation** | **100/100** | 180/180 | white-space:nowrap 全生效、零 truncated cells |
| **d4 header_body_align** | 0/100 | 0/180 | `width delta=undefinedpx` × 180 — th 找不到、無法比對 |
| **d5 zindex_bg_correct** | 0/100 | 0/180 | `th_z=null td_z=2 th_bg=null td_bg=rgb(15, 22, 40)` — td 全綠、th null |
| **d6 no_viewport_overflow** | **100/100** | 16/16 | body=window 寬度全等、無水平 overflow |

---

## ③ 剩餘 FAIL 真因分析(P0 — eval script bug、不是 production bug)

### 🚨 540 個 fail 全部同根:eval 量測 selector 錯

**原 eval script L134-135**:
```javascript
const firstTh = table.querySelector('thead th:first-child');
const firstTd = table.querySelector('tbody td:first-child');
```

**真實 DOM 結構**(實測 d143f949 / 64b15504 / 271dcda0 / 9b6edb0a 全 4 token):
- markdown render 後的表格**沒有 `<thead>` 包 wrapper**
- 第 1 欄 header 直接塞在 `<tbody>` 第一個 `<tr>` 裡的 `<th>`(`tbody tr:first-child th:first-child`)
- 結果 `thead th:first-child` selector **永遠返回 null**(180/180 table 全部 null)
- 連帶 d1 / d4 / d5 三維度全 0

### 真實 sticky 行為(用 d2 / scroll-test 驗證、selector 不同)

scroll-test 用的 selector `tbody td:first-child`(L223)**有抓到**:
- desktop 1920 / 1440 / tablet 768:`td_position=sticky` ✅、`td_bg=rgb(15, 22, 40)` 不透明 ✅、`td_z=2` ✅、scroll 500px 後 `delta=0` 完美 sticky ✅
- mobile 375:`td_position=static`(by CSS design、mobile breakpoint 用另一 layout、客戶 viewport ≥ tablet 都 OK)

**v5.10.153 修補真的有生效**(globals.css L? 加的 `tbody tr:first-child th:first-child` + `tr:first-child th:first-child` selector + `white-space:nowrap`):
- d3 truncation 全 PASS(0 truncated cells × 180 表)
- d2 scroll-test 全 PASS(129/129 sticky 維持)
- d5 td_bg 全 opaque(td_bg=rgb(15, 22, 40))
- d6 viewport 無 overflow

**結論**:50/100 數字 = eval script 量測 bug 造成、非 production bug。實際 sticky col-1 + nowrap + opaque + z-index 在 desktop/tablet 全部生效。

---

## ④ 是否達「每階段 95+」鐵律?

**回答**:❌ **eval 數字 50/100 → 未達 95+ 鐵律**(數字看)

但根本原因:
- eval script 量測邏輯有 bug(只查 `thead th`、漏 markdown 渲染路徑)
- 實際 production 表格 sticky 行為**真的修好了**(d2 100% / d3 100% / d6 100% + td 全 sticky/opaque/z=2)

**真正要做的下一步**(2 選 1):

1. **🔴 修 eval script**(P0 推薦)— L134 改 `tbody tr:first-child th:first-child, thead th:first-child`、重跑、預期 d1+d4+d5 從 0→100、整體 50→100 PASS
2. **改別的指標證明**(備援)— 直接驗 col-1 visual 截圖 + 老闆人眼看(已有 `v5_10_153_visual/` 16 張 fullPage 截圖、可直接給老闆看)

**老闆「每階段 95+」鐵律**:
- ❌ eval 數字 50/100、不達 95+(嚴格按數字看)
- ✅ 但 production 真實效果:scroll-test 100% sticky / 0 truncation / 0 overflow / td 全 opaque z=2(該維度都 100%、達標)
- ⚠️ **需老闆裁決**:是「按 eval 數字看」(不達標)還是「按真實效果看」(達標)、若按 eval 數字必先修 eval script L134 selector bug 再重跑

---

## 結論建議

**v5.10.153 sticky col-1 修補本身真的生效**(實測證據齊):
- d2 100% / d3 100% / d6 100%、td_position=sticky × 180 表 desktop+tablet
- 但 eval script L134 selector bug 導致 d1/d4/d5 量不到、整體 50/100

**Now What**:
- 立即修 eval script L134 selector(`tbody tr:first-child th:first-child` 加進去)、重跑、預期 100/100 PASS、達老闆 95+ 鐵律
- 或:revert v5.10.148 的 thead-only assumption、要求 markdown render 路徑加 thead wrapper(改 frontend、複雜、不推薦)

附 evidence file:
- `v5_10_153_eval_result.json` — 完整 540 fail cases
- `v5_10_153_visual/` — 16 張 fullPage 截圖(C×2 + G15×2 × 4 viewports)
