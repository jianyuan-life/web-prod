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

Fly live 的西洋占星結果可同時具備：`detail/sub_summary` 含「計算異常」、沒有 `error`、`success` 不等於 false、`score=0`。`legacy-calculator-safety.ts` 現在只攔 `success === false`、`error` 或無效 score，因此這個 live 形狀會進入 C prompt。

處置：採納。Claude 接手後必須先加一個與 live response 同形狀的紅燈測試，再讓 `detail`、`sub_summary`、`summary` 中的計算異常或錯誤標記停止生成。Fly 端也要回正式的 `failed_systems`／`partial_failures`，不能靠自然語言猜錯誤。

### P0：未知時辰在 Fly 被當成 12:00

Fly live 的 unknown-time 與明確 12:00 案例 raw SHA 相同，15 個系統 hash 全同，未知時辰仍含完整時柱。兩家都判定前端遮罩不能取代後端正確的 input contract。

處置：採納。Fly `BirthRequest` 與 `_to_birth_input()` 必須接收並傳遞 unknown-time 語意；時間相依系統不得把中午占位當客戶事實。修完後需以差異測試證明 unknown-time 與 12:00 不再逐 byte 相同。

### P0：現有測試沒有覆蓋 live placeholder

目前測試只用 `{success:false,error:...}`，剛好是實作本來就會攔的形狀，所以 766/0 不能證明 live placeholder 安全。

處置：採納。這是測試與實作共同漏接，不得用既有綠燈抵銷 Fly 觀測。

## 需要 Claude 明確決策的項目

### G15 逐人同意與撤回

Gemini 判為 P0；市場矩陣則客觀記為「部分」。目前只有購買者聲明，並清楚揭露這不等於逐一身分核驗；尚無每位成年成員的獨立邀請、同意時間、共享範圍與撤回紀錄。

處置：列為商業化／隱私發布阻擋，但不在缺少適用法域與正式法律意見時自行宣稱違法。Claude 必須二選一：實作逐人授權；或在法務與產品明確接受限制後，縮小共同報告暴露的個人原始資料並清楚揭露限制。不能把付款者一次勾選寫成「每位成員都已同意」。

### C inline fallback 的未知時辰字串

Claude 找到 `app/api/generate-report/route.ts` 仍可內插 `${birthData.hour}時` 與完整八字，但 artifacts 無法證明 C 實際可達；目前 `consultationFallbackDecision('C')` 看來固定為 workflow-only。

處置：未證實可達，不升成已觀察 P0。Claude 應加控制流測試證明 C 永不進 inline fallback，或直接套用同一 unknown-time 遮罩，避免 dormant path 日後被打開時復發。

## 沒有採用的泛化判斷

- Gemini 對 Dashboard 刪除引用了第一個 patch 的舊 `!res.ok` 形狀；第二個 patch 已改成 `internalDelete` 並有 JSON body 回歸。因 Gemini沒有據此列缺陷，這段不作為 finding。
- Claude 表示 artifacts 無法獨立證明 E3 byte parity 與 G15 consent helper 全文；本機 E3 freeze/golden 已通過，但這不能取代 immutable preview 與完整檔案審查，因此仍保留在接手驗證清單。

## 結論

Claude：`RELEASE=HOLD`。

Gemini：`RELEASE=HOLD`。

本分支可以作為 Claude 的接力基線，不能合併 main 或部署 production。解除 HOLD 至少要完成：Fly unknown-time、Fly/web placeholder ledger、structured attestation、G15 同意範圍決策、乾淨環境預設 build、immutable preview 96 案，以及修正後的新一輪跨模型反例審查。
