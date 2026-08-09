# E3 月度精選不可變基準

本目錄保存 E3 月度精選的歷史 golden corpus；它不是候選分支可以自行更新後再自行放行的依據。
正式 release 結論只能由 `scripts/e3-freeze-release-audit.mjs` 產生，不能把單獨執行
`e3-freeze-audit.mjs` 的結果當成完整通過。

## 正式入口

準備兩個都指向同一個 `origin/main` commit、且執行前乾淨的 worktree：

- `base-source-root`：只讀 Git 與 protected source，不啟動 Next.js。
- `base-runtime-root`：以同一 commit 執行 production `next build`／`next start`。
- `candidate-root`：已 commit 且乾淨的候選 worktree。

```powershell
node D:\path\to\trusted-verifier\scripts\e3-freeze-release-audit.mjs `
  --base-source-root="D:\path\to\clean-base-source" `
  --base-runtime-root="D:\path\to\clean-base-runtime" `
  --candidate-root="D:\path\to\clean-candidate" `
  --evidence-dir="D:\path\to\task-evidence" `
  --trusted-base-commit="<由 GitHub protected main 固定的 SHA>" `
  --trusted-verifier-root="D:\path\to\trusted-verifier" `
  --trusted-verifier-manifest="D:\path\to\trusted-verifier\trusted-verifier-manifest.json" `
  --trusted-verifier-manifest-sha256="<審查前預先登錄的 64 位 SHA-256>"
```

runner 會在同一個隨機 release session 內完成：

1. 從兩個乾淨的 `origin/main` worktree 錄製完整 80 案基準。
2. 在記憶體保留 JSON 與所有 PNG bytes 的 corpus SHA-256。
3. 立即對乾淨候選執行完整 80 案 verify。
4. verify 前後重算 corpus hash，偵測 record／verify 間的 golden 竄改。
5. 真正執行 pinned generation／checkout／route／email／telemetry 契約測試，以及 base、candidate
   各一輪不繞過 CSP 的 production smoke；只在對應 gate 成功後放行 shared 差異。
6. 保存 hash-bound `comparison-receipt.json`、`release-receipt.json` 與 finalization receipt，搬入
   durable evidence 後再重算候選 corpus。

候選工作樹髒污、base 不乾淨、base commit 不同、runner／audit／core hash 不完整、corpus 被改、
receipt 消失或 hash 不符，任何一項都會 fail closed。
verifier bundle 必須位於 candidate repo 外，包含 runner／audit／core／fixture／preload／pinned tests 的精確
hash manifest；manifest digest 必須在執行前由外部審查收據預先登錄，不能由本次 candidate 臨時自簽；
base 與 candidate runtime 各自在 detached worktree 依 lockfile 執行 `npm ci`，不借用現有 ignored `node_modules`。

## 覆蓋範圍

repo 內的 `baseline.json` v3 與 80 組 PNG 只保留作歷史診斷，不由候選更新。正式 release runner
會在本次 owned session 另建 v5 baseline 與 80 組 PNG，完整覆蓋：

- 五個 E3 表面與十個狀態。
- 390／768／1024／1440 四種 viewport。
- light／dark 雙主題。
- DOM、文字、ARIA、關鍵 computed styles、render tree、字型、telemetry 與 checkout payload。
- `prefers-reduced-motion: reduce`／`no-preference`，以及互動元件的 base／hover／keyboard focus 樣式與完整 shell contract。
- 固定畫面的 PNG SHA-256，以及由 PNG bytes 重算的感知指紋。
- production `next build`／`next start` 的 Node、Playwright package tree、Chrome／Edge executable bytes、
  Next、OS、字型與工具 provenance。

任何 `e3-semantic` source 改動在瀏覽器前直接 HOLD。共享首頁、定價、checkout、dashboard、report、
layout、route chrome、生成、郵件與樣式檔都必須具有明確 coverage mapping；少一個 required gate 就 HOLD。
UI shared surface 除了完整 80 案語意與互動相同外，每張 PNG bytes 也必須逐位元完全相同才能 release。
感知比較只保留作診斷，不能放行任何字緣或像素差異；大範圍色偏、區塊、長細線、週期畫面、
無效 PNG、指紋與 PNG 不綁定同樣全部 HOLD。

`--public-only` 與 `--case` 只供定位問題，不能形成 release 通過結論。E3 相對 base 未變也不自動等於
production 已更新；仍須以部署 SHA 和實際瀏覽器證據確認線上版本。
