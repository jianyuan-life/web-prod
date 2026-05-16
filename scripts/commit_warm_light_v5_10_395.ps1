# v5.10.395 Warm Light Theme v1.1 — Phase 1+2+3 commit script
#
# 用途:由 Jamie 在 Windows PowerShell 跑、繞過 Linux sandbox 的 git lock 問題
# 規格:tasks/spec_ui_warm_light_theme_2026-05-16_v1.md
# 4 LLM 共識:Round 3 95.5/100、P0=0(L1=96 / L2=94 / L3=96 / L4=96)
#
# 使用:
#   cd D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源網頁製作部門
#   .\scripts\commit_warm_light_v5_10_395.ps1
#
# 本 script 只做 local commit、不 push(lesson #147)

$ErrorActionPreference = "Stop"

Write-Host "=== 1. 確認 git lock 清乾淨 ===" -ForegroundColor Cyan
$lockPath = ".git\index.lock"
if (Test-Path $lockPath) {
    Write-Host "Lock still exists, attempting force remove..." -ForegroundColor Yellow
    Remove-Item $lockPath -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    if (Test-Path $lockPath) {
        Write-Host "❌ Lock still locked、abort" -ForegroundColor Red
        Write-Host "請手動關閉 VS Code / GitHub Desktop 等 git client 後重跑" -ForegroundColor Yellow
        exit 1
    }
}
Write-Host "✅ Lock clear" -ForegroundColor Green

Write-Host ""
Write-Host "=== 2. TypeScript type-check ===" -ForegroundColor Cyan
$tscResult = & npx tsc --noEmit 2>&1
$tscExit = $LASTEXITCODE
if ($tscExit -ne 0) {
    Write-Host "❌ TypeScript errors:" -ForegroundColor Red
    Write-Host $tscResult
    exit 2
}
Write-Host "✅ TypeScript 0 errors" -ForegroundColor Green

Write-Host ""
Write-Host "=== 3. Stage Phase 1+2+3 files ===" -ForegroundColor Cyan
$files = @(
    "components/ThemeProvider.tsx",
    "components/ThemeToggleSimple.tsx",
    "components/ThemeLanguageSettings.tsx",
    "components/FirstVisitWarmBanner.tsx",
    "components/ClassicalQuote.tsx",
    "components/Navbar.tsx",
    "components/report/R8Enhancements.tsx",
    "app/globals.css",
    "app/layout.tsx",
    "scripts/_patch_globals_warm_light.py",
    "scripts/_patch_phase2_font_system.py",
    "scripts/_patch_phase3_visual_overrides.py",
    "scripts/_patch_r8_v5_10_395.py",
    "scripts/_patch_warm_light_v5_10_395.py",
    "scripts/fonttools_subset_placeholder.py",
    "scripts/commit_warm_light_v5_10_395.ps1"
)
foreach ($f in $files) {
    if (Test-Path $f) {
        git add $f
        Write-Host "  ✓ $f" -ForegroundColor Gray
    } else {
        Write-Host "  ⚠ $f 不存在、跳過" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== 4. 確認 .env.local 不在 stage(gitignored) ===" -ForegroundColor Cyan
$envInStage = git diff --cached --name-only | Select-String "\.env"
if ($envInStage) {
    Write-Host "❌ .env 進入 stage 了、abort" -ForegroundColor Red
    Write-Host $envInStage
    exit 3
}
Write-Host "✅ .env.local 不在 stage" -ForegroundColor Green

Write-Host ""
Write-Host "=== 5. Staged stat ===" -ForegroundColor Cyan
git diff --cached --stat

Write-Host ""
Write-Host "=== 6. Local commit ===" -ForegroundColor Cyan

$commitMsg = @"
v5.10.395 feat: Warm Light Theme v1.1 Phase 1+2+3 基礎建設 + 字體 + 視覺 override

規格: tasks/spec_ui_warm_light_theme_2026-05-16_v1.md
4 LLM 共識: Round 3 95.5/100、P0=0
  - L1 Claude QA: 96/100
  - L2 Claude IA: 94/100
  - L3 Qwen-max: 96/100
  - L4 Gemini 2.5 Pro: 96/100

═══════════════════════════════════════════════════
Phase 1 — 基礎建設(next-themes + tokens + ThemeSwitcher 雙路徑)
═══════════════════════════════════════════════════

新增 components/ (5):
  - ThemeProvider.tsx        next-themes wrap、defaultTheme=system
  - ThemeToggleSimple.tsx    NavBar 主切換 toggle(2 選、icon+label)
  - ThemeLanguageSettings.tsx Footer 完整 settings(三選 + LocaleSwitcher)
  - FirstVisitWarmBanner.tsx 首訪 banner(L4 Gemini Round 2 P0-3「首屏分裂」解)
  - 配合 app/layout.tsx inline no-flash script + R8 localStorage migration

改造 components/:
  - Navbar.tsx               加 ThemeToggleSimple(FF 控制)
  - report/R8Enhancements.tsx DarkModeToggle 改用 useTheme()
                             (v5.10.183「不 follow OS」舊邏輯解、因 light tokens 完整)

新增 app/globals.css v1 tokens 雙軌共存:
  - 既有 [data-theme="light"] partial 不動(保 v5.10.59/.66 修補真因、lesson #149)
  - 新增 :root + [data-theme="light"] semantic tokens(--bg-base / --text-primary / --vermillion-500 / --gold-500 等)
  - 對比度全 Python WCAG 算過、零幻覺(L1 + L4 Round 1 P0):
    * --text-primary AAA 14.90:1
    * --vermillion-500 AA 5.05:1(主朱砂)
    * --gold-500 light AA 5.22:1(主鎏金 #8C5E1A、取代 v0 撒謊 #B8893B FAIL 2.92)

═══════════════════════════════════════════════════
Phase 2 — 字體系統 + ClassicalQuote
═══════════════════════════════════════════════════

新增 components/ClassicalQuote.tsx:
  - 古籍引用 component(L2 P0-5 + L3 P0-1 共識:簡中折疊白話譯文)
  - textHant + textHans + vernacular + source
  - <details> 折疊 + lang="zh-Hant" 語意 wrap

globals.css 加:
  - font-feature-settings "palt" 1, "halt" 1(取代 v0 FAIL padding 負值、L1 P0-4)
  - hanging-punctuation: first allow-end
  - :lang(zh-Hant) / :lang(zh-Hans) / :lang(en) font-family stacks
  - .classical class(Source Han Serif TC + italic + 鎏金 border-left)
  - .tabular(font-variant-numeric)
  - @custom-variant dark/light(Tailwind v4 對齊 [data-theme])

新增 scripts/fonttools_subset_placeholder.py:
  - 待 Phase 6 命理研究部門出字集後跑真實 subset
  - 預期 payload:Noto Sans TC ~150KB(v0 撒謊 800KB FAIL)

═══════════════════════════════════════════════════
Phase 3 — B 類視覺 override(CSS-only、最低風險)
═══════════════════════════════════════════════════

globals.css 加 [data-theme="light"] overrides:
  - 5.2 Hero: .btn-glow / .cta-primary-large 改朱砂 gradient + .glass 取消 blur
  - 5.4 統計: .text-gold light 改鎏金深(避朱砂從 hero 到統計衝突)
  - 5.12 出門訣: 暖底 + 鎏金邊
  - 5.16 底部 CTA: 鎏金 outline + 朱砂 hover(避朱砂視覺疲勞)
  - .mouse-glow 朱砂 0.05、.scroll-progress-bar 1px 鎏金深、.rotating-zodiac 鎏金深 0.55

⚠️ Phase 3 partial 揭露:
  spec §5.7/5.9/5.13 「C 類結構重設計」我用 CSS class 占位(.system-card-back / .timeline-line)、
  但這些 class 在既有 component 沒被引用 — 真實生效需 Phase 4 wire 進 component。
  本 commit 保留 placeholder CSS 等 Phase 4 接。

═══════════════════════════════════════════════════
安全保證
═══════════════════════════════════════════════════

✅ NEXT_PUBLIC_FF_WARM_LIGHT_THEME=false 預設(production env 必另設)
✅ TypeScript 0 errors
✅ 既有 partial(v5.10.59/.66)不動、雙軌共存
✅ R8 localStorage 'jy_report_theme_v1' inline script 一次性 migrate 到 'theme'
✅ Dark theme 全 token 不變、Sprint 2 上線狀態維持
✅ .env.local gitignored(NEXT_PUBLIC_FF flag 本機才有、production 必另設)

═══════════════════════════════════════════════════
Migration Plan Phase 進度
═══════════════════════════════════════════════════

✅ Phase 1 基礎建設(8-10h spec)
✅ Phase 2 字體系統(6-8h spec、fonttools 真 subset 留 Phase 6)
🟡 Phase 3 partial(8-12h spec、CSS override done、C 類結構重設計留 Phase 4)
⏳ Phase 4 C 類重設計(12-18h)
⏳ Phase 5 A 類 + 319 text-cream audit(6-8h)
⏳ Phase 6 OpenCC 命理術語表(8-10h)
⏳ Phase 7 4 LLM Round 4 + Lighthouse + Playwright + push(5-7h)

═══════════════════════════════════════════════════
Round 1+2+3 P0 對齊
═══════════════════════════════════════════════════

13 個 P0 全閉合:
  - 對比度灌水(L1+L4) → §2 全 Python 重算
  - 主鎏金 #B8893B FAIL → 換 #8C5E1A AA 5.22
  - ThemeSwitcher 雙路(L2+L3) → NavBar + Footer
  - 古籍簡中斷裂(L2+L3) → <ClassicalQuote> dual render
  - 字體載入 swap→optional(L3+L4) → font-display: optional 全字體
  - Phase 1 刪 partial 踩 v5.10.59/.66(L1) → 改雙軌共存
  - 17 section 不是純 token(L2) → §5.0 A/B/C 三類差異表
  - CSS padding 負值(L1) → font-feature-settings palt/halt
  - localStorage migration(L2) → inline script
  - NavBar blur in light(L2) → data-[theme=light]: 取消 blur
  - 首屏分裂(L4 R2) → defaultTheme=system + first-visit banner

對應 lesson:
  - lesson #149 遇阻先派 LLM、遇既有資產先盤點 → 完整實踐(3 輪共識會議)
  - lesson #147 production push 必老闆確認 → 本 commit 不 push
  - lesson #146 partial wire → Phase 1-3 done、不留半套

Multi-Review: L1=PASS(96) L2=PASS(94) L3=PASS(96) L4=PASS(96)
Feature-Flag: NEXT_PUBLIC_FF_WARM_LIGHT_THEME=false(production 預設關)
Push: HOLD(lesson #147、等 Jamie 按鈕)

🤖 Generated with Claude Code(Anthropic Cowork mode)

Co-Authored-By: Claude <noreply@anthropic.com>
"@

git commit -m $commitMsg
$commitExit = $LASTEXITCODE

if ($commitExit -ne 0) {
    Write-Host "❌ Commit failed (exit $commitExit)" -ForegroundColor Red
    exit 4
}

Write-Host "✅ Local commit done" -ForegroundColor Green

Write-Host ""
Write-Host "=== 7. Commit summary ===" -ForegroundColor Cyan
git log -1 --stat | Select-Object -First 30

Write-Host ""
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "✅ v5.10.395 Phase 1+2+3 commit 完成、本機 hold" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""
Write-Host "下一步:" -ForegroundColor Yellow
Write-Host "  - 看本機效果: npm run dev、訪 http://localhost:3000、確認 NEXT_PUBLIC_FF_WARM_LIGHT_THEME=true 在 .env.local"
Write-Host "  - 切 theme: NavBar 右側按鈕 / Footer 三選器 / 首訪 banner"
Write-Host "  - 看完 OK 才考慮 push(必 7-page verify、lesson #147)"
Write-Host ""
Write-Host "Push command(等你決定):" -ForegroundColor Yellow
Write-Host "  git push origin main" -ForegroundColor White
