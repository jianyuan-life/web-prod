# C／G15 跨模型反例審查（2026-08-09）

## 審查物

- `origin/main..dd42f27d` 的兩個完整 patch，共約 600 KB。
- Fly.io 唯讀驗算報告。
- 25 維市場與 UI 對照。
- Codex → Claude 接力檔。

每次正式審查都綁定 task id `jianyuan-c-g15-full-ui-20260809` 與上述檔案 SHA-256。Claude 與 Gemini 沒有讀彼此的答案。

## 可採信收據

- Claude Opus 4.8：`D:\ClaudeData\ops-standard\receipts\team-call-claude-20260809T101411.545Z-4b9f10f6.json`
- Gemini 3.1 Pro Preview：`D:\ClaudeData\ops-standard\receipts\team-call-gemini-20260809T102117.253Z-54fba648.json`

Claude 第一次呼叫使用 no-tools，只看得到檔名與 hash、讀不到內容；收據 `team-call-claude-20260809T100429.293Z-e9569603.json` 明確回 `not_observed`，因此不採計為審查席。

## 共同確認的阻擋

### P0：錯誤 placeholder 可通過 web 完整性檢查

Fly live 的西洋占星結果可同時具備：`detail/sub_summary` 含「計算異常」、沒有 `error`、`success` 不等於 false、`score=0`。修正前的 `legacy-calculator-safety.ts` 只攔 `success === false`、`error` 或無效 score，因此這個 live 形狀會進入 C prompt。

處置：採納，web 端已在本分支修正。`__tests__/84-consultation-calculator-fail-closed.test.mjs` 先以 Fly live 同形 fixture 證明舊實作漏接，再鎖定 `detail`、`sub_summary`、`summary` 的明確錯誤前綴；`score=0` 或「未見計算異常」不會單獨被誤判。`calculator-facts.ts` 與 legacy gate 共用同一判定器。Fly 端仍須回正式的 `failed_systems`／`partial_failures`，不能只靠自然語言表達失敗。

### P0：未知時辰在 Fly 被當成 12:00

Fly live 的 unknown-time 與明確 12:00 案例 raw SHA 相同，15 個系統 hash 全同，未知時辰仍含完整時柱。兩家都判定前端遮罩不能取代後端正確的 input contract。

處置：採納。Fly `BirthRequest` 與 `_to_birth_input()` 必須接收並傳遞 unknown-time 語意；時間相依系統不得把中午占位當客戶事實。修完後需以差異測試證明 unknown-time 與 12:00 不再逐 byte 相同。

### P0：現有測試沒有覆蓋 live placeholder

原先測試只用 `{success:false,error:...}`，剛好是實作本來就會攔的形狀，所以當時的 766/0 不能證明 live placeholder 安全。

處置：採納並補回歸。新增 live 同形、合法零分否定句與 `summary` alias 三個行為案例；完整測試現為 774 pass／0 fail／2 skip。

## 需要 Claude 明確決策的項目

### G15 逐人同意與撤回

Gemini 判為 P0；市場矩陣則客觀記為「部分」。目前只有購買者聲明，並清楚揭露這不等於逐一身分核驗；尚無每位成年成員的獨立邀請、同意時間、共享範圍與撤回紀錄。

處置：列為商業化／隱私發布阻擋，但不在缺少適用法域與正式法律意見時自行宣稱違法。Claude 必須二選一：實作逐人授權；或在法務與產品明確接受限制後，縮小共同報告暴露的個人原始資料並清楚揭露限制。不能把付款者一次勾選寫成「每位成員都已同意」。

### C inline fallback 的未知時辰字串

Claude 找到 `app/api/generate-report/route.ts` 仍可內插 `${birthData.hour}時` 與完整八字，但 artifacts 無法證明 C 實際可達；目前 `consultationFallbackDecision('C')` 看來固定為 workflow-only。

處置：已用實際 `app/api/generate-report/route.ts` POST handler 加控制流測試。`USE_CONSULTATION_REPORT_V1_C` 為 true、false 或未設定時，正式請求都在任何 calculator／Claude／DeepSeek／其他網路邊界之前回 409；dry-run 回 `C-workflow-only`，outbound 呼叫為 0。這證明目前分支的 C inline fallback 不可達，但不代表 `origin/main` 在本分支合併前已有同一保護。

## 收尾修正的外部反例審查

- Claude targeted review：`D:\ClaudeData\ops-standard\receipts\team-call-claude-20260809T103932.572Z-a7fde5c9.json`，300 秒逾時，未取得有效判決，不採計為審查席。
- Gemini targeted review：`D:\ClaudeData\ops-standard\receipts\team-call-gemini-20260809T104414.586Z-0ebe75cc.json`，確認 live placeholder 與否定句邊界修正有效，也確認 C fallback 測試走的是真實 route handler；但找到相鄰風險，因此維持 `TARGETED_WEB_P0=HOLD`。

Gemini 找到的相鄰風險是：`app/api/generate-report/route.ts` 的非 C legacy 路徑在呼叫 AI 前沒有套用排盤失敗閘。獨立逐方案調查確認，`assertCompleteConsultationCalculatorResult` 是 C 專用的固定 15 槽契約，不能套到其他方案：D 只選 5–8 套、R 每位成員只選 8 套，G15 canonical family 路徑讀既有 C 報告，E1–E4 另走奇門 Top；E3 golden fixture 只有 4 套 analyses。這個 finding 採納為接手項，但本輪不改共用路由。Claude 接手時應先為 D／R／legacy G15 建真實 route-level RED 測試，再新增「只拒絕 top-level／analysis failure marker、不要求 15 槽」的窄 gate；E1–E4 全部排除，E3 必須繼續通過 freeze 與 golden parity。

## 沒有採用的泛化判斷

- Gemini 對 Dashboard 刪除引用了第一個 patch 的舊 `!res.ok` 形狀；第二個 patch 已改成 `internalDelete` 並有 JSON body 回歸。因 Gemini沒有據此列缺陷，這段不作為 finding。
- Claude 表示 artifacts 無法獨立證明 E3 byte parity 與 G15 consent helper 全文；本機 E3 freeze/golden 已通過，但這不能取代 immutable preview 與完整檔案審查，因此仍保留在接手驗證清單。

## 結論

Claude：`RELEASE=HOLD`。

Gemini：`RELEASE=HOLD`。

本分支可以作為 Claude 的接力基線，不能合併 main 或部署 production。web 的 C live-placeholder 漏洞與 C fallback reachability 已有修正及行為證據；解除整體 HOLD 仍至少要完成：Fly unknown-time、Fly partial/failed ledger、D／R／legacy G15 的窄型 fail-closed、structured attestation、G15 同意範圍決策、乾淨環境預設 build、immutable preview 96 案，以及修正後的新一輪跨模型反例審查。
