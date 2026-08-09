# C／G15 全面優化 Codex → Claude 交接（2026-08-09）

## 結論先行

本批已在獨立分支完成 C 人生藍圖／G15 家族藍圖的結帳 UI、資料邊界、Prompt 合約、閱讀／PDF 入口、排盤完整性與報告「發現錯誤即停止」改造。程式測試與可重現 build 已轉綠，但 Fly 唯讀驗算新發現兩個排盤 P0，且 structured v1 attestation 尚不存在，因此仍是 **HOLD**：不可合併 main、不可佈署 production、不可開啟 C／G15 structured feature flags。

## 接手位置

- Repo：`D:\Users\Desktop\Claude專案\Claude-鑑源-worktrees\web-checkout-tone-fix-20260809`
- Branch：`codex/checkout-tone-fix-20260809`
- Integration owner：Codex 已完成本批收尾並停止寫入；Claude 接手後請先明確認領，再從遠端分支最新 commit 繼續。本批不可與其他 agent 共用同一 branch 同時改檔。
- Work-state task id：`jianyuan-c-g15-full-ui-20260809`
- Improvement id：`imp-20260809T080818Z-a1a98fed`
- E3 要求：嚴格凍結，不改 production 行為。

## 已完成

1. C／G15 專屬購買須知與結帳視覺，不再走舊的藍白彈窗；價格來自 SSOT，移除未可證實的固定字數／時間承諾。
2. C 出生資料：國曆、城市、時區、DST、未知時間、未來日期、18+ 與關係狀態只要缺漏或矛盾就停止；固定 `as_of` 與 `target_year`。
3. G15：僅接受同帳戶、已完成、未刪除的 C 報告；同意書 30 分鐘到期可重勾；關係與諮詢目標明文收集，不猜父母／夫妻角色。
4. 優惠碼／積分競態、Enter 重複送出、授權查詢卡死、USD 0 免 Stripe、最終金額組成與 ARIA 狀態已修正。
5. C Prompt：精確年齡階段、報告基準日、目標年、未知時間、關係狀態、客戶問題作為 untrusted client data，不再使用固定 2026。
6. C 舊生成路徑現在強制 15 套排盤唯一且完整，partial failure 立即停止；九星氣學仍列入完整性清單，但不支撐客戶結論。
7. C Post-generation QA 異常改為轉人工，不再帶錯交付。G15 的同意、所有權、成年、期間、品質與 fresh review 均在 PDF／completed／email 前重驗。
8. 報告閱讀、PDF 錯誤頁、儀表板刪除與進度狀態、登入／註冊／存取頁的 C／G15 文案與主題也已整合。

## 已驗證（最終收尾）

- `npm test`：`766 pass / 0 fail / 2 skip`。
- `npm run type-check`：PASS。
- `npm run check:no-raw-clients`：PASS，raw fetch 維持既有 baseline 80，沒有新增例外。
- C／G15 相關閱讀、PDF、Dashboard、DELETE body 批次：19 檔、111 項斷言 PASS。
- `__tests__/35-e3-freeze-contract.test.mjs`：`31 / 31` PASS。
- `__tests__/68-e3-generation-golden-contract.test.mjs`：`10 / 10` PASS，候選路徑與 immutable base 一致。
- `npx next build --webpack`：PASS，137 個 route/static page 全部完成；build 僅使用行程內的 build-only placeholder Supabase 值與已觀察 Fly host，未寫入設定或秘密。
- `git diff --check`：PASS。

`npm run pre-deploy` 的預設 Turbopack build 在本工作樹會因 `node_modules` symlink 指向工作樹外而 panic；改走 webpack 後先因本機缺 Supabase build env 而停止，補入非秘密 build-only placeholder 後完整 PASS。這是工作樹／本機驗證環境限制，不能寫成 production build 已驗證；Claude 合併前仍須在乾淨 clone 或 Vercel immutable preview 重跑預設 build。

## Fly.io 唯讀驗算新增的 P0 阻擋

完整證據：`tasks/fly_readonly_validation_2026-08-09.md`。

1. **未知時辰被忽略**：同一虛構案例標示未知時辰與明確 12:00 的 raw SHA 完全相同，15 個 system hash 也全同，且未知時辰輸出仍含 12:00 與完整時柱。Claude 必須先修 Fly calculator 的 unknown-time contract，並用時間相依系統的負向斷言鎖住。
2. **錯誤 placeholder 被算成成功**：西洋占星回傳 `計算異常：'planet_name'`，API 仍回 HTTP 200、`systems_count=15`，且沒有 `partial_failures`／`failed_systems`。Claude 必須同步修 Fly 成功清單與 web `legacy-calculator-safety.ts` 的 error-shaped detection；任何 placeholder 都要阻止 prompt、PDF、completed 與 email。
3. **structured v1 attestation 不存在**：帶 nonce 的 live response 缺少全部 13 個 attestation headers；Fly production code 與 secret names 也未見 `CALCULATOR_ATTESTATION_*`。在 Fly 與 Vercel 兩端完成同一 release/code hash/HMAC contract 前，不得開啟 `USE_CONSULTATION_REPORT_V1_C/G15`。
4. 同一虛構案例 3/3 bytes 一致只證明 deterministic，**不證明命理規則正確**。

## 本輪已解掉的舊失敗

### A. `__tests__/38-g15-selection-validator.test.mjs`

- 合法同帳戶選擇被拒絕。
- 同名同生日、不同出生地被誤當同一人。
- 舊報告 `user_id` 缺口無法用已驗證 email 通過。
- 重複人物／`client_name` 與 `birth_data.name` 不一致時，回傳 `INELIGIBLE_REPORT` 而非預期的 `DUPLICATE_PERSON`。
- `2000-02-29` fixture 被拒絕。

已確認為 fixture／契約漂移並修正；`validate-g15-selection.ts` 未放寬。17/17 PASS。

### B. `__tests__/40-consultation-marketing.test.mjs`

- C 還在期待「30 秒」；新文案刻意移除不可證實的時間承諾。應校正過時測試，不要把 30 秒寫回產品。
- G15 測試預期「監護人」；新產品目前直接不接受未成年人。已改為核對 18+ 邊界與監護流程未開放。11/11 PASS。

### C. `__tests__/42-consultation-reader-surface.test.mjs`

- 已移除 access page 內層 `<main>`，保留 RouteChrome 的唯一 `main#main-content` 與標題關聯。

### D. `__tests__/46-consultation-report-link-integration.test.mjs`

- 已以實際 resolver 驗證 structured C/G15 走 fragment/session PDF、legacy 走受驗證 stored URL、惡意 URL 不渲染；不是只改字串過測。

### E. Dashboard DELETE

- C/G15 刪除已改用 `internalDelete`，成功後才從 UI 移除；API/限流/網路失敗保留報告並顯示可恢復訊息。
- `internalDelete` 以向後相容 options 加入 JSON body，舊 options-only 呼叫不會被捏造 body 或 Content-Type；新測試 `87-internal-delete-json.test.mjs` 鎖定。

## 還沒做，不可宣稱完成

1. Claude Opus 4.8 與 Gemini 3.1 Pro 已各自完成完整 patch 反例審查，兩者結論都是 `RELEASE=HOLD`。採納／保留／不採用理由見 `tasks/c_g15_cross_model_review_2026-08-09.md`。
2. 兩家共同確認 web 會漏接 Fly live 的 `detail/sub_summary` 計算異常 placeholder，且現有測試與實作共同漏接；這是尚未修正的 P0。
3. Gemini 另指出 G15 目前仍是購買者單次聲明，沒有逐位成年成員的獨立同意與撤回紀錄。這項先列商業化／隱私發布阻擋，不在缺正式法律意見時自行宣稱違法。
4. 桌面／平板／手機、light／dark／reduced-motion／400% zoom 的 immutable preview 96 案真實瀏覽器矩陣尚未完成。
5. `tasks/c_g15_market_ui_benchmark_2026-08-09.md` 已列 25 個客觀商業/UI 維度；其中「未見」與「部分」不可冒充 100 分。
6. 上述 Fly P0 與 attestation 缺口尚未修；Fly.io 此次只有唯讀與虛擬案例授權，不得修改、部署、重啟、縮放或寫 secrets。
7. 未合併 main、未推 production，`https://jianyuan.life/` 尚未反映本分支。

## 接手後指令順序

```powershell
python D:/ClaudeData/ops-standard/bin/improvement_loop.py status --context
python D:/ClaudeData/ops-standard/bin/work_state.py context --cwd "D:/Users/Desktop/Claude專案/Claude-鑑源-worktrees/web-checkout-tone-fix-20260809"
git status --short
git diff --check
node --test __tests__/38-g15-selection-validator.test.mjs __tests__/40-consultation-marketing.test.mjs __tests__/42-consultation-reader-surface.test.mjs __tests__/46-consultation-report-link-integration.test.mjs
```

接手順序：先修 Fly unknown-time 與 placeholder/partial ledger → web「發現錯誤即停止」回歸 → 乾淨 clone 預設 `npm run pre-deploy` → Claude/Gemini counterexample review → 修正 findings → immutable Vercel preview 96 案 → 只 stage 任務檔案 → 取得 production/main 最終確認後合併、push → 輪詢 Vercel 版本 → production 真機截圖與 0×5xx 驗證。
