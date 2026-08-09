# C／G15 全面優化 Codex → Claude 交接（2026-08-09）

## 結論先行

本批已在獨立分支完成大部分 C 人生藍圖／G15 家族藍圖的結帳 UI、資料邊界、Prompt 合約、排盤完整性與報告 fail-closed 改造。尚未合併 main、尚未佈署 production；原因是全套測試仍為 `745 pass / 8 fail / 2 skip`，不得將 HOLD 假裝成 verified。

## 接手位置

- Repo：`D:\Users\Desktop\Claude專案\Claude-鑑源-worktrees\web-checkout-tone-fix-20260809`
- Branch：`codex/checkout-tone-fix-20260809`
- Integration owner：Claude 接手後請先明確認領；本批不可與其他 agent 共用同一 branch 同時改檔。
- Work-state task id：`jianyuan-c-g15-full-ui-20260809`
- Improvement id：`imp-20260809T080818Z-a1a98fed`
- E3 要求：嚴格凍結，不改 production 行為。

## 已完成

1. C／G15 專屬購買須知與結帳視覺，不再走舊的藍白彈窗；價格來自 SSOT，移除未可證實的固定字數／時間承諾。
2. C 出生資料：國曆、城市、時區、DST、未知時間、未來日期、18+ 與關係狀態全部 fail closed；固定 `as_of` 與 `target_year`。
3. G15：僅接受同帳戶、已完成、未刪除的 C 報告；同意書 30 分鐘到期可重勾；關係與諮詢目標明文收集，不猜父母／夫妻角色。
4. 優惠碼／積分競態、Enter 重複送出、授權查詢卡死、USD 0 免 Stripe、最終金額組成與 ARIA 狀態已修正。
5. C Prompt：精確年齡階段、報告基準日、目標年、未知時間、關係狀態、客戶問題作為 untrusted client data，不再使用固定 2026。
6. C 舊生成路徑現在強制 15 套排盤唯一且完整，partial failure 立即停止；九星氣學仍列入完整性台帳，但不支撐客戶結論。
7. C Post-generation QA 異常改為轉人工，不再帶錯交付。G15 的同意、所有權、成年、期間、品質與 fresh review 均在 PDF／completed／email 前重驗。
8. 報告閱讀、PDF 錯誤頁、儀表板刪除與進度狀態、登入／註冊／存取頁的 C／G15 文案與主題也已整合。

## 已驗證

- `npx tsc --noEmit`：PASS。
- C／G15 相關批次：`207 / 207` PASS。
- `__tests__/35-e3-freeze-contract.test.mjs`：`31 / 31` PASS。
- `__tests__/68-e3-generation-golden-contract.test.mjs`：`10 / 10` PASS，候選路徑與 immutable base 一致。
- `git diff --check`：PASS。
- 全套 `npm test`：`745 pass / 8 fail / 2 skip`，所以狀態是 HOLD。

## Claude 必須先解的失敗

### A. `__tests__/38-g15-selection-validator.test.mjs`（5 個內層斷言失敗，runner 將此檔計為單一失敗測試檔）

- 合法同帳戶選擇被拒絕。
- 同名同生日、不同出生地被誤當同一人。
- 舊報告 `user_id` 缺口無法用已驗證 email 通過。
- 重複人物／`client_name` 與 `birth_data.name` 不一致時，回傳 `INELIGIBLE_REPORT` 而非預期的 `DUPLICATE_PERSON`。
- `2000-02-29` fixture 被拒絕。

先判斷是舊 fixture 缺少新必填欄位，還是 `validate-g15-selection.ts` 指紋／驗證順序真 bug；不得為了讓測試變綠而降低所有權或出生資料邊界。

### B. `__tests__/40-consultation-marketing.test.mjs`

- C 還在期待「30 秒」；新文案刻意移除不可證實的時間承諾。應校正過時測試，不要把 30 秒寫回產品。
- G15 測試預期「監護人」；新產品目前直接不接受未成年人。請將測試改為核對 18+ 邊界與監護流程未開放。

### C. `__tests__/42-consultation-reader-surface.test.mjs`

- `app/consultation/access/page.tsx` 或閱讀組件仍被偵測為全域 `<main>` 裡再嵌 `<main>`。修成單一 main landmark，同時保留 heading/focus 邏輯。

### D. `__tests__/46-consultation-report-link-integration.test.mjs`

- 新 reader 不再出現測試預期的「下載 PDF 完整版」文字。不要只改文字過測；先確認 structured 與 legacy C/G15 的 PDF link 都可達、失敗可恢復，再同步測試。

## 還沒做，不可宣稱完成

1. Claude Opus 4.8 與 Gemini 3.1 Pro 的最終 fresh-context counterexample review 尚未執行。
2. `npm run pre-deploy`／完整 Next production build 尚未在最終 diff 上重跑。
3. 桌面／平板／手機、light／dark 的真實瀏覽器矩陣與視覺截圖尚未完成。
4. 未合併 main、未推 production、`https://jianyuan.life/` 還看不到本批。
5. Production 結構化 C／G15 路徑仍缺 calculator attestation/runtime receipts 與對應 env；不得假裝 50k／100k 結構化報告已 live。
6. Fly.io 只授權唯讀與虛擬案例驗算，不得修改 Fly 狀態或部署。

## 接手後指令順序

```powershell
python D:/ClaudeData/ops-standard/bin/improvement_loop.py status --context
python D:/ClaudeData/ops-standard/bin/work_state.py context --cwd "D:/Users/Desktop/Claude專案/Claude-鑑源-worktrees/web-checkout-tone-fix-20260809"
git status --short
git diff --check
node --test __tests__/38-g15-selection-validator.test.mjs __tests__/40-consultation-marketing.test.mjs __tests__/42-consultation-reader-surface.test.mjs __tests__/46-consultation-report-link-integration.test.mjs
```

修完後：重跑 `npm test` → `npm run pre-deploy` → Claude/Gemini counterexample review → 修正 findings → 只 stage 本任務檔案 → 合併／push main → 輪詢 Vercel 版本 → production 真機截圖與 0×5xx 驗證。
