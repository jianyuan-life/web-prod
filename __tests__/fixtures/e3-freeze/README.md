# E3 月度精選不可變基準

這個目錄不是可由候選分支自行更新的 golden snapshot。`baseline.json` 只接受從明確的
`origin/main` commit、兩個錄製前皆乾淨且指向同一 commit 的 detached worktree 產生：

- `source-root`：只用來讀取 Git 狀態與 protected source；錄製期間不得啟動 Next.js。
- `runtime-root`：以同一 commit 啟動 Next.js；與 source 分離，避免 Next 自動改寫
  `next-env.d.ts` 後污染「來源乾淨」證據。
- `base-ref`：固定只能是 `origin/main`。`HEAD`、候選 branch、髒工作樹或 commit 不一致皆
  fail closed。

錄製範例：

```powershell
node scripts/e3-freeze-audit.mjs --record `
  --source-root="D:\path\to\clean-source-worktree" `
  --runtime-root="D:\path\to\clean-runtime-worktree" `
  --base-ref=origin/main
```

工具會先完成 80 組畫面／互動、來源 manifest、provenance 與 screenshot hash 檢查，再以
staging bundle 交易式替換舊基準。任何檢查失敗，既有 `baseline.json` 與 `screenshots/`
保持不變。

`baseline.json` v2 必含：

- `provenance.git` 與 `provenance.runtimeGit`：base ref、完整 commit、HEAD、錄製前 clean。
- `provenance.tool/node/browser/fonts/os`：稽核腳本與 core hash、Node、Chromium、字體指紋、OS。
- `protectedSurfaceManifest`：區分 `e3-semantic` 與 `shared`。共享首頁、pricing、dashboard、
  layout、Navbar、middleware、CookieConsent、全域／報告／checkout CSS、checkout route/API/hook
  及方案 SSOT 都在凍結範圍。
- `protectedSourceSha256`：以 `sha256-lf/v1` 正規化 CRLF/LF，避免 Windows 換行假差異。
- 80 個 snapshots：DOM、文字、ARIA、關鍵 computed styles、payload 與 PNG hash。

候選驗證：

```powershell
node scripts/e3-freeze-audit.mjs
```

任何 `e3-semantic` source 改動會在瀏覽器前直接 HOLD。`shared` source 只有在完整 80 案的
DOM、文字、ARIA、computed styles、render tree、逐案字型、穩定像素、互動與 checkout payload
全部相同時才能放行；任一差異皆 HOLD。候選分支絕對不能重錄 baseline。

`--public-only` 與 `--case` 只供定位問題，不能寫入 canonical baseline，也不能形成完整通過
結論。canonical baseline 永遠必須精確包含 80 案。

基準以 Next dev 執行，為了讓 webpack 開發 runtime 可 hydration，provenance 明確標示
`browser.cspMode=bypassed-dev-parity`。因此這一關只證明 E3 行為與畫面相對 base 未變，**不證明**
production CSP 可用；正式交付還必須另跑 production build／`next start`，在不繞過 CSP 的瀏覽器
完成 hydration 與零 runtime error smoke test。

這份基準證明的是 Git `origin/main` 的 E3 狀態，不自行等同 production。要宣稱 production
等價，仍需另以實際部署 SHA／同 bytes receipt 核對；缺少該證據時必須標示 UNVERIFIED。
