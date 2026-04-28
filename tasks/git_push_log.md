# Git Push Log(鑑源網頁部門)

> 依 `~/.claude/rules/git-workflow.md` 鐵律建檔(2026-04-27 v5.5.1 patch session)
> 每次 push 後立刻寫(不等 session 結束、不等老闆問)

---

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.14 | 84afcf7d
- 動作:IA round 7 8 P0 全清:① 補 E3/E4 fallback prompt(防 fallback 到 C「人生藍圖」、$89/$279 客戶拿錯內容)② getEmailCta E3/E4 補 ③ 7 處 ['E1','E2','E3','E4'] / inline planNames + 廢棄 Y / cron/followup-email / ReportClientButtons / pdf-download / jamie/accounting 全清
- 改動範圍:9 檔、+87 / -31 行
- type-check:✅ 0 error
- 老闆驗收:⏳

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.13 | 41ea65f8
- 動作:QA round 7 P0 全清(5 處 ['E1','E2'] 漏改 + 後台 6 方案 hardcode 吃 E3/E4 營收)+ 主動全 grep 同類 pattern(根治越修分數越低)
- 改動範圍:12 檔、+49 / -20 行
- production code 已 0 inline PLAN_NAMES dict 殘留
- type-check:✅ 0 error

---

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.12 | aaeeeeef
- 動作:Codex + Gemini round 6 抓 P0(@vercel/og 不支援 woff2)+ E2 字數閘門寬容
- 改動範圍:5 檔、+20 / -12 行
- 為什麼:share-card v5.7.1 註解已警告 fail 0 byte、Codex+Gemini 一致再抓、修 og-font 改 ttf endpoint
- type-check:✅ 0 error

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.11 | f9165a5b
- 動作:round 6 真審 P0/P1 全修(QA 91 + IA 71 → 預期都 ≥ 95)
  - generate-report parser 加 TOP1+TOP3+TOP5 三家兼容(QA P0、漏修 markers leak)
  - dashboard inline PLAN_NAMES 改 import + isChumenjiPlan helper
  - report opengraph + page 4 處 ['E1','E2'] 改 isChumenjiPlan(E3/E4 客戶面文案修對)
  - share-card 改 import lib/og-font + lib/plan-names(DRY 集中)
  - checkout L371/L387 + webhook L252 inline dict 全改 import
  - generate-report inline planNames 砍、改 import + 補 E3/E4
  - E1 fallback prompt TOP5_JSON → TOP3_JSON 對齊主流程
- 改動範圍:12 檔、+49 / -77 行
- type-check:✅ 0 error

---

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.10 | 9c2c978b
- 動作:round 5 IA 抓出 3 P0(19 處 PLAN_NAMES 散落 / 4 個 OG 缺中文字體 / E2 fallback TOP5 vs TOP1 衝突)+ 4 P1 全修
- 改動範圍:33 檔、+122 / -99 行(2 個新檔:lib/plan-names.ts + lib/og-font.ts)
- 為什麼:抽常數集中管理、消除技術債(未來加方案只改一處)+ 修 OG 中文 □ 框框 + 修 E2 fallback prompt 對齊 v2.0
- type-check:✅ 0 error
- 4 LLM round 5: QA 97/100 ✓ / Codex PASS ✓ / IA 78 → 預期 round 6 ≥ 95 / Gemini 重跑中
- Vercel deploy:⏳ 等中
- 老闆驗收:⏳

---

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.9 | c68472f0
- 動作:round 4 真審 P0/P1/P2 全修(QA 88→預期 95+ / IA 72→預期 95+ / Codex P2 修)— 首頁 $39 殘留 + 後台 3 處「月盤出門訣」+ pricing OG 4→8 方案 + generate-report E2 legacy prompt 對齊 v2.0 + steps 註解全額退款 + PLAN_NAMES_PTS 補 E3/E4 + ctaRefund → ctaSupport
- 改動範圍:16 檔、+70 / -61 行
- 為什麼:Jamie「九十五分才能停」、round 4 IA 抓到 2 P0 + Codex 抓到 1 P2 真 bug、必修才能上 95
- type-check:✅ 0 error
- 4 LLM round 5 審查:⏳ 啟動中
- Vercel deploy:⏳ 等中
- 老闆驗收:⏳

---

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.8 | 6d5fd19d
- 動作:退費邏輯全清(不支援退款 + 4 大保證) + 8 方案命名統一(IA 抓 11 處 JSX 殘留全修) + sed 註解誤改復原 + 舊價 $89/$99 → $59/$29 + 「6 種方案 → 8 種方案」+「$39 起 → $29 起」
- 改動範圍:78 檔、~+/-300 行(廣度 sed sweep:app/components/workflows/lib + i18n 雙語 + SubscribeCTA + blog 對比表 + AggregateOffer)
- 為什麼:① Jamie P0 糾正「沒有退費這項目、所有頁面檢查清楚」(R3-R4 加 7 天無條件退費翻盤違規) ② 「所有人九十五分才能停」(IA Agent 第 3 輪抓出 11 處 JSX 文本沒被 sed 掃到、L4 Gemini 待 round 4)
- type-check:✅ 零錯誤
- 4 LLM 審查:L1 QA=95.5 PASS / L2 IA=86.7(本 commit 修 11 處 JSX 後待 round 4)/ L3 Codex=PASS(P3 only)/ L4 Gemini=待 round 4
- Vercel deploy:⏳ 等中
- 老闆驗收:⏳

---

### 2026-04-27 ~18:30 | jianyuan-life/web-prod:main | v5.5.1 | 52d73502
- 動作:promptfoo yaml 同步 7 修 + assertion #1 限縮(矩陣允「—」)
- 改動範圍:1 檔(promptfoo_c_plan.yaml)、+101 / -27 行
- 為什麼:讓 promptfoo eval 真實驗證 v5.5.1 7 修(原 yaml 是 v5.5.0 inline prompt、沒同步到 c_plan_v2.ts 的 7 修)
- type-check:✅(只改 yaml、不影響 ts)
- promptfoo:✅ 11/11 = 100%(fresh cache、真實重生成)
- Vercel deploy:⏳ 等中
- 老闆驗收:⏳

### 2026-04-27 ~18:15 | jianyuan-life/web-prod:main | v5.5.1 | 3e953d41
- 動作:整合 5 路 review 7 必修(L3 Codex + L4 Gemini + Promptfoo + Regression + a183a54b 重生實際)
- 改動範圍:4 檔(prompts/c_plan_v2.ts / package.json / package-lock.json / 部門 CLAUDE.md)、+204 / -57 行
- 為什麼:跨家共識 4 必修(雙軌真分流 / 評分互斥 / 矩陣允缺值)+ Codex 補抓 2(quote bank / 「—」限縮)+ Promptfoo 補抓 1(bridge)+ Gemini P2 1(TOP 3→5 同步)
- type-check:✅ 零錯誤
- promptfoo eval(初版 yaml):63.6%(7/11)— 因 yaml 沒同步 7 修
- Vercel deploy:⏳ 等中
- 老闆驗收:⏳
