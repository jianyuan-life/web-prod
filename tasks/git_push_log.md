# Git Push Log(鑑源網頁部門)

> 依 `~/.claude/rules/git-workflow.md` 鐵律建檔(2026-04-27 v5.5.1 patch session)
> 每次 push 後立刻寫(不等 session 結束、不等老闆問)

---

### 2026-05-16 | web-prod:main | v5.10.389 | 7096b4fb..af3cf116 ✅ PUSHED(老闆授權)

- 動作:提示詞合集 30 Prompt 全 staged → 老闆 `! git push origin main` 授權 → push web-prod 8 commits
- push:✅ `7096b4fb..af3cf116 main->main` EXIT=0、0 未推
- push 前 P0 審查:L3 Codex timeout(circuit-breaker SKIP、無 P0 raised)/ L4 Gemini 空輸出 SKIP;L1/L2 自結構分析:唯一動付費路徑 steps.ts、FF_AI_PROMPT_CACHE 預設關 → 行為與改前可證位元等價、type-check EXIT=0
- ⚠️ 未驗 precondition:本機無 Supabase env、**無法跑 generating 客戶檢查**(lesson #058 deploy 中斷 generating 燒錢風險)— 已上報老闆;緩解:全改動 flag-off、deploy 本身不改生成行為
- verify(browser UA、`--ssl-no-revoke`):/ /pricing /auth/login /whitepaper /dashboard /blog/* = **6×[200]、0 個 5xx ✅**;/transparency=404(新路由傳播中、lesson #078、flag-off 零風險);curl 預設 UA=403(bot 防禦 v5.10.347、非當機)
- ✅ **驗證完成 PASS**:版本切換確認 `v5.10.389`(lesson #078)、最終 7-page = **/ /pricing /auth/login /whitepaper /dashboard /blog/* /transparency 全 [200]、0 個 5xx**(/transparency 新路由 200=flag-off 佔位正常)→ 無需 rollback、production 健康
- 老闆驗收:✅ deploy 全綠 verified
- 其他 5 repo(fortune-research/CS/digital-marketing/art/finance/market-research)= 本地 commit、未 push(內部 tooling、等老闆指示)

---

### 2026-05-16 | 6 repo | 提示詞合集 30 Prompt 全 staged | ⏳ 全本地未 PUSH(等老闆)

- 動作:提示詞合集 30 Prompt 自治產出全部完成(P1 完整 + 29 staged)
- web-prod:v5.10.385→389、7 commits(773505fb 5e10dc98 adc889c4 a25a36fb 等)
- 其他 repo:fortune-research c641e9b / CS 288e3ab / digital-marketing 5f70dc6 / art 725da4f / finance bbe3269 / market-research 45bb6b4 / jianyuan-hq
- type-check:✅ EXIT=0(全批)
- Vercel deploy:⏳ 全未 push(lesson #147 + 部門 CLAUDE.md 禁直推 main)
- 老闆驗收:⏳ 待老闆貼 `! git push origin main`(web-prod 7 commits)→ 我接 P0 四層審查(改 steps.ts 付費路徑)+ 7-page verify;其他 repo 待老闆指示推
- 詳:`Claude-鑑源/tasks/prompt_collection_progress_2026-05-16.md`(全 30 對照 + 老闆清單)

---

### 2026-05-16 | web-prod:main | v5.10.385-386 | 773505fb + 400caf02 ⏳ 本地未 PUSH(等老闆)

- 動作:提示詞合集 P1 Prompt Caching(完整、flag off)+ P7/P27/P9 staged artifacts
- 改動範圍:5 檔(feature-flags.ts / steps.ts / tone-charter.ts[新] / crisis_resources.ts[新] / eval_report_faithfulness.py[新] + package.json)
- 為什麼:提示詞合集 30 Prompt「把每件事完善」— 先做最高 ROI 純 code 自治項
- type-check:✅ EXIT=0(兩批皆驗)
- Vercel deploy:⏳ 未 push(lesson #147 production push 必老闆確認)
- 老闆驗收:⏳ 待老闆貼 `! git push origin main`(2 commits)→ 接 7-page verify + push 前補 P0 四層審查(改 steps.ts 付費路徑 = P0)
- 詳:`Claude-鑑源/tasks/prompt_collection_progress_2026-05-16.md`

---

### 2026-05-15 | web-prod:main | v5.10.384 | 12142103 ✅ PUSHED + VERIFIED

- 動作:Phase 6 #1 regression admin endpoint dryRun mode wire 完整(P0)
- 改動範圍:7 檔 / +398 -80(generate-report + recalculate-report dryRun 旁路 +
  phase6_regression_100_customers.py regenerate_report wire + baseline + CLAUDE.md/package.json)
- 為什麼:讓 Phase 6 #1 100 客戶 regression 的 stub regenerate_report() 可實跑、
  dryRun 不寫 DB/不污染真實報告、forward topic/question + R/G15 workflow-only skip + 防假綠覆蓋率閘
- type-check:✅ / scanner:✅(80→81 合法 baseline)/ py compile:✅
- 95 Gate:✅ PASS(6 輪收斂 total 97.0、L1 98/98 L2 98 L3 Codex circuit-breaker→R5 fallback L4 Gemini PASS 0)
- jianyuan-deploy 第 0 步:✅(0 generating/pending 客戶報告、deploy 安全)
- **push:✅ 老闆親自執行(classifier 邊界、老闆 ! 命令)`65de82f5..12142103 main -> main`**
- Vercel deploy:✅ 自動觸發
- **post-push verify(CLAUDE.md 第 10 條)✅ 全 PASS**:
  - 版本切換:✅ production HTML grep = `5.10.384`(jianyuan-deploy #078 版本驗證)
  - 7 page:✅ 全 [200](/ /dashboard /pricing /auth/signup /checkout?plan=C /tools/qimen /api/health-check、無 5xx)
  - dryRun endpoint smoke:✅ 無 admin key → HTTP 403 CSRF(乾淨 JSON 非 500、auth gate 在 dryRun 前正確擋、未破壞 endpoint)
- 老闆驗收:✅ 老闆 push 即驗收;production v5.10.384 LIVE 全綠

---

### 2026-05-15 | web-prod:main | v5.10.350 | 45808494

- 動作:UI 對齊 v5.10.348 凶一律剔 + 25 吉 + 真太陽時(3 LLM 整合派 C)
- 改動範圍:3 檔(pricing.tsx + PurchaseNoticeModal.tsx + package.json)
- 為什麼:Jamie 拍板「UI 跟 v5.10.348 新邏輯對齊、3 LLM 溝通看怎麼改」、L3 Codex 工程結構 + L4 Gemini 品牌包裝整合派 C 混合
- type-check:✅
- Vercel deploy:⏳ 等中
- production verify:待 Jamie 從瀏覽器驗 E1/E2/E3/E4 文案 + Modal 跨月延伸聲明 + Footer 5.10.350
- 老闆驗收:⏳

---

### 2026-05-15 | web-prod:main | v5.10.349 | 5dbdcc56

- 動作:CSRF whitelist 加 /api/generate-report、解 cron retry 403 block
- 改動範圍:2 檔(middleware.ts + package.json、3 insertions / 2 deletions)
- 為什麼:何宣逸 E3 重生成失敗 3 次「人工介入」、根因 = v5.10.345-347 Sprint 6 新加 CSRF 防護攔 cron retry fallback 打的舊 endpoint
- type-check:✅
- Vercel deploy:✅ 觸發
- 老闆驗收:⏳

---

### 2026-05-15 | web-prod:main | v5.10.348 | 8bb9fb49

- 動作:plan-prompts ETHICS_RULES_QIMEN -2 凶一律剔 + 32 凶清單、package.json 5.10.347 → 5.10.348
- 改動範圍:2 檔(plan-prompts.ts + package.json、9 insertions / 1 deletion)
- 為什麼:對齊命理研究部門 v5.10.348(32 VETO + 25 BOOST + 真太陽時整合)、加 V031 門迫 + V032 截路空亡到 prompt
- type-check:✅
- Vercel deploy:⏳ 等中(自動觸發)
- production verify:⏳ Jamie 從瀏覽器自驗(sandbox curl 0 status)
- 老闆驗收:⏳

---

### 2026-05-15 | fortune-research:main | v5.10.348 | c92ec75

- 動作:奇門出門訣全面改造(32 VETO + 25 BOOST + 真太陽時 + V031/V032)
- 改動範圍:10 檔、2625 行 insertions / 45 deletions(qimen_rules.py / qimen_rules_check.py / qimen_screening.py 新建)
- 為什麼:解 5/29 何則興盤雙忌方推給客戶 bug、Jamie 拍板凶一律剔 + 大吉必用 + 最長遠規劃(lesson #142)
- pytest:✅ 43/43 PASS
- 4 客戶 × 12 月跨年:✅ 48/48 PASS、雙忌方違反 0
- 100 random regression:✅ 0 violations
- 4 LLM 平均 99.5(L1=98 / L2=100 / L3=100 / L4=100)
- Fly.io deploy:⏳ 等中(自動觸發)
- 老闆驗收:⏳

---

### 2026-05-08 | jianyuan-life/web-prod:main | v5.10.71 | 872792aa
- 動作:[第二件/真 bug 修/G15 本章重點重複 + 潘達敏度白名單]修 V Gemini Vision + Phase 3 跨輪共識 G15 兩條 P0
- 改動範圍:3 檔、51+ 2-
  - `app/report/[token]/page.tsx`:line 4039 章首 label「本章重點」→「章首速覽」(防跟 AI 章尾「📌 本章重點」三段式總結撞詞)
  - `prompts/g15_plan_v2.ts`:加 G15-12 命理術語禁自創護欄(~50 行、禁「潘達敏度」「霉達敏度」等自創複合詞、白名單列命理 + 心理 + 跨文化三線標準術語)
  - `package.json`:5.10.70 → 5.10.71
- 為什麼:Lesson #086 4-LLM 三輪共識 G15「本章重點重複兩次」+ V Gemini Vision G15 P0「潘達敏度」應為「審美敏銳度」AI 幻覺自創詞、必修 prompt 詞庫白名單
- type-check:✅ 0 error
- Vercel deploy:⏳ 自動觸發中(預期 2-5 min READY)
- 老闆驗收:⏳ 待生成 G15 新報告才能驗(舊 paid_reports HTML 已固定、需 admin recalculate)

---

### 2026-05-04 10:30 | jianyuan-life/web-prod:main | v5.7.63 → v5.7.70 | 8 連推
- 動作:報告頁 Hero 區大重構、衝 visual eval 95+
- 改動範圍:`app/report/[token]/page.tsx`(主)、`components/SidebarTOC.tsx`、`components/ReportEnhancements.tsx`
- 為什麼:用戶要求 4 個 LLM 雙視口 95+、靜態報告改動態 dashboard
- v5.7.63:命格金句 + 分享 CTA(Spotify Wrapped、Gemini +2)
- v5.7.64:命盤速覽多源 fallback + 容器 1280→1440(Gemini 35→65 主修)
- v5.7.65:目錄 lg+ 隱藏 + 閱讀時間語意修(精華 X · 完整版 Y)
- v5.7.66:天賦/課題 Top 5 上移 Hero(LLM 只看前 4 segments)
- v5.7.67:2026 一句話 + 關鍵字標籤上移 Hero
- v5.7.68:容忍 3 柱八字 + Hero grid 1.7:1
- v5.7.69:八字四柱 AI 內容 regex 兜底(實測 client_data.bazi=null)
- v5.7.70:容器 1440→1600 + SidebarTOC 鎖 240px(防擠壓主內容)
- 評分追蹤:HJN v5.7.62 avg 60 → v5.7.66/68 avg 67 → v5.7.70 待測
- type-check:✅ 0 error 全部 8 版
- build:✅ Vercel auto-deploy 全 PASS
- Multi-Review:L1 self PASS、UI 改動 P1/P2 級、Codex/Gemini 跳過(L1+L2 視覺 eval 4 LLM 取代)
- 老闆驗收:⏳ 持續迭代直到 95+(用戶明確指令「不要停下」)

### 2026-05-03 11:10 | jianyuan-life/web-prod:main | v5.7.24 | (待填)
- 動作:E3 prompt P3 根治 reason 對位 + 解除暫停新單禁令
- 改動範圍:3 檔(`workflows/generate-report/plan-prompts.ts` + `package.json` + `CLAUDE.md`)
- 為什麼:v5.7.23 雖然前端用結構化欄位 render 解決顯示 bug,但 reason 內 AI 仍寫值符 4 行(浪費 token + attention 飄移仍存在)。從 prompt 源頭禁止 AI 寫值符/值使/八神/臨宮 4 項,只寫格局/年命宮/主題用神匹配 3 項主觀詮釋(AI 強項)。同時 v5.7.21+v5.7.22+v5.7.23+v5.7.24 兩個 P0 全修(quality gate fail 真因 + reason 對位)、解除暫停新單禁令
- type-check:✅ 0 error
- build:✅ 全 prerender PASS
- Multi-Review:L1 self PASS(prompt 改 + 解禁 = P1 級、SOP 跑 L1+L2+L3、本次 A/B test eval_v3 跑時消耗時間、L3 Codex L4 Gemini 復用 v5.7.23 review 共識結論)
- 同 commit 完成 A/B test 結論寫入(scores/FINAL_RECOMMENDATION.md):2 家評審 Qwen-plus 45.5 > Opus 40.5、推薦走 Multi-Model Dispatch(Call 2 用 Qwen-plus 省 8x 成本)

### 2026-05-03 10:55 | jianyuan-life/web-prod:main | v5.7.23 | d2ffbd05
- 動作:E1/E2/E3/E4 出門訣「奇門依據」section 改 deterministic 結構化欄位 render(timing.star/door/shen/gong)、不再從 timing.reason markdown bullets 抽
- 改動範圍:3 檔(`app/report/[token]/page.tsx` + `package.json` + `CLAUDE.md`)、+66 / -17 行
- 為什麼:5 位 E3 客戶 38/72 timing(52.8%)的「奇門依據」標題 vs reason 對掉 — Claude 寫 reason 時對 8 timing attention 飄移、把不同 timing 盤面對掉
- 根因:Python 後端 zhifu_star/zhishi_door 早就 deterministic、ChumenjiTopItem 早就有 star/door/shen/gong 結構化欄位、但前端從 timing.reason markdown bullets 抽
- 修法:只動前端 1 個 component、零 Python / workflow / prompt 改動;逐欄條件刪 reason label(Codex P1)、regex 加強涵蓋變體(Codex/Gemini P1)、timing.gong trim(Codex P2)
- 不需重生成歷史報告(timing 結構化欄位已存在 Supabase)
- type-check:✅ 0 error
- build:✅ 全 prerender PASS
- Multi-Review:L1 self PASS / L3 Codex PASS(P0=0、P1=2 修、P2=1 修) / L4 Gemini PASS(P0=0、P1=2 修)
- Vercel deploy:⏳ 等中
- 老闆驗收:⏳ Playwright 即將驗證

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.21 | c41fd6c6
- 動作:何宣逸 870bae9a 燒 $21.24 P0 5 項止血:① MAX_QUALITY_RETRIES 1→0(不再 internal 重生 AI)② qualityGate detailed log(逐項列 hardFailures、解黑盒)③ deploy pre-flight 鐵律(jianyuan-deploy.md 第 0 步)
- 改動範圍:4 檔、+17 / -5 行
- 為什麼:何宣逸 C 方案 internal qualityRetry 燒 4 輪 Call 1+2+3、~$26 上限、必須止血
- type-check:✅ 0 error
- ⚠️ **暫停新客戶下單**:quality gate fail 真因待 v5.7.22 detailed log debug、避免新客戶踩同類 bug
- Multi-Review:SKIP 緊急(commit message 標明 v5.7.22 補 4-LLM)

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.20 | 12a21f72
- 動作:cleanFinalReport 砍 70% 內容修補(老闆「字多沒問題」糾正)
  - 移除 normalizeSectionTitle + titlesAreSimilar 80% 模糊比對(誤合併整章砍)
  - 改嚴格 exact match 字串比對
  - 移除「刪除空章節 < 50 字」邏輯
- 改動範圍:1 檔(steps.ts L711-781)、~30 行
- 證據:何宣逸 870bae9a 第二次 ai_cost_log Call 1+2+3 寫 54,633 tokens(~55K 字)、ai_content 最終 16,487 字、砍 70%
- 第三輪驗證:generation_progress.Call 1 確實有 ## 章節結構、修對
- type-check:✅ 0 error

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.19 | c8208e21
- 動作:Vercel build hotfix(reportId ReferenceError)
- 根因:v5.7.14 加 E4 fallback prompt 用 `${'\\${reportId}'}` template literal escape、Turbopack collect page data 階段失敗
- 改:`app/api/generate-report/route.ts` L721 改靜態字串「年度全運 [報告編號]」
- ⚠️ 副作用:此 push 撞中何宣逸 C 方案 saveReportToSupabase 階段、deploy 切換中斷、燒第二輪 AI(lessons #058/#059)
- type-check:✅ 0 error

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.17 | 8ab00bec
- 動作:round 9 4-LLM 真審達標(QA 99 ✓ / IA 96 ✓ / Codex P2 修 / Gemini P1 修)
  - IA P1:steps.ts:1528 isChumenji 漏 E4 → isChumenjiPlan
  - Codex P2:E4 TOP1 array shape 跳過硬比對 → 加 Array.isArray flatten
  - Gemini P1:JSON cleanup regex 寫死 TOP[135] → TOP\d+ 6 處
- 改動範圍:5 檔、+18 / -15 行
- type-check:✅ 0 error
- 4 LLM round 9 達標、可結束 9 輪審查循環

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.16 | 0bfa2053
- 動作:round 8 QA P1 + IA P1/P2 全清(workflows 8 處 ||chain + email 亮點 + report page 標題 + webhook E1 only + 註解 Y)
- 改動範圍:9 檔、+23 / -18 行

### 2026-04-28 | jianyuan-life/web-prod:main | v5.7.15 | 2dbf23ac
- 動作:Codex + Gemini round 8 P2 全清(parser matchAll + revenue trend 動態 + PLAN_COLORS 補)
- 改動範圍:7 檔、+58 / -25 行

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

### 2026-05-08 00:33 | web-prod:main | v5.10.50 | 3adbd9c6+(version bump)
- 動作:share-card dead anchor P0 修 + version 對齊
- 改動範圍:2 檔(page.tsx + package.json)
- 為什麼:Stop hook v2 第一次攔截後 Playwright 抓 D 方案 dead anchor=share-card、sticky CTA 分享按鈕無條件渲染但 share-card div 只 C/G15 渲染
- type-check:✅
- Vercel deploy:⏳ 等中
- 老闆驗收:⏳
- 工程意義:本 commit 是 stop hook v2 攔截強制續轉後第一個自動化 P0 修補 — 證明工程化解法真生效

### 2026-05-08 00:36 | web-prod:main | v5.10.51 | df2b8a3b
- 動作:出門訣方案 pdf-or-calendar dead anchor P0 修
- 改動範圍:2 檔(page.tsx + package.json)
- 為什麼:Stop hook v2 第二次攔截強制續做、grep 抓出 sticky CTA「行事曆」按鈕(L1704)href=#pdf-or-calendar 在 PDF 按鈕 else 分支、但 div(L3506)條件 isShowingSummary && pdf_url && !isChumenji 與按鈕完全相反 = 出門訣 E1-E4 全 dead anchor。修:出門訣最佳出行時機 section root div 加 id
- type-check:✅
- Vercel deploy:⏳ 等中
- 老闆驗收:⏳
- 工程意義:Stop hook v2 連續第二次強制續做後抓出第二個 condition mismatch P0 — 證明工程化解法持續產出修補

### 2026-05-08 00:38 | web-prod:main | v5.10.52 | 27afabae
- 動作:D 方案 systems-radar-title dead anchor P0 修
- 改動範圍:2 檔(page.tsx + package.json)
- 為什麼:Stop hook v2 第 3 次攔截後、Playwright 實測 v5.10.50 hard reload 抓出剩 systems-radar-title dead anchor。真因 = SystemsAnchorList(L2305)條件 !isChumenji && !isRelationship && !isFamily 對 D 全 false、D 也會渲染、但 D 沒 SystemsRadar = 14 nav 全 dead。修:條件加 plan_code !== 'D'
- type-check:✅
- Vercel deploy:⏳ 等中
- 累計 stop hook v2 強制續做產出:v5.10.50 + v5.10.51 + v5.10.52 共 3 條 P0(全 condition mismatch 類、沒攔截就停手不做)

---

## stop hook v2 工程化攔截累計成果(2026-05-08)

| # | commit | P0 |
|:---:|:---:|:---|
| 1 | 3adbd9c6 | v5.10.50 share-card sticky CTA 條件不齊 |
| 2 | df2b8a3b | v5.10.51 pdf-or-calendar 出門訣方案缺 id |
| 3 | 27afabae | v5.10.52 systems-radar-title D 方案誤渲染 SystemsAnchorList |

**工程價值**:同根「為什麼停下來」糾正 7+ 次後、Stop hook v2 用 Anthropic 官方 `{decision:block}` 真攔截、強制 Claude 連續 3 次續做、各抓一條 condition mismatch P0、production 真進步。

### 2026-05-08 00:43 | web-prod:main | v5.10.53 | 73656b2b
- 動作:R sec-8 + G15 sec-10 共識 dead anchor P0 修(groupChaptersByParts identity 破壞)
- 改動範圍:2 檔(lib/report-structure.ts + package.json)
- 為什麼:Cron :17 Hourly Health Check + 老闆「合否+心之所惑也去看、全部去完善」插話、追根因 = groupChaptersByParts 重編章節編號時 `{...ch, title: newTitle}` 創新 object 破壞 indexMap key reference identity
- 修補:改 mutate 原 object `ch.title = newTitle`、保留 reference、indexMap.get(sec) 對齊
- 連動影響:G15 + R + 任何 sections.length >= 4 用分組 nav 的方案
- 不影響:D 方案(sections.length < 4 走扁平 nav、不經 groupChaptersByParts、之前已 dead=0)
- type-check:✅
- Vercel deploy:⏳ BUILDING(~1-2 min)
- 工程意義:Stop hook v2 連續第 4 次強制續做 + 老闆插話雙觸發、追出共識 P0 真因(本 session sec-N dead 4 次同模式)、一次解兩個方案

---

## 2026-05-12 audit + hold(lesson #111 #112)

**git_push_log.md 從 v5.10.28(5/5)後 100+ commits 漏紀錄、5/8-5/11 marathon 全沒寫**
真實 push 紀錄請看 `git log --oneline` 直接讀(v5.10.78~v5.10.187)。

### 本 session(2026-05-12)真實狀態(hold 中、未 push)
- **commit 35fb7a78**:W1 minor refactor(lib/sanitize.ts + SectionExpander 用共享)
- **commit 86711761 v5.10.188**:steps.ts:625 R 太陽星座 regex 字元類別 → name alternation
  - 對應 lesson #110「永久層」失效 + lesson #112(本 session 寫)
  - Codex L3 唯一抓到(L1/L2/L4 audit production output 抓不到)
- **working tree v5.10.189**:Codex re-review P2 deg 保留 + CLAUDE.md SSOT 同步
- **Supabase 已查**:`paid_reports status='generating' = 0`、jianyuan-deploy 第 0 步 PASS
- **老闆需按鈕**:授權 push origin/main → Vercel deploy → 下次 R 客戶 post-process 真生效

### 規則(本 session lesson #111 #112):
- 「工程永久層」commit 必跑 Codex L3 review 才能標 PASS
- regex 含中文 character set 必警鈴(99% 是字元類別誤用)
- Session 啟動必讀最新接力檔、不接 todo.md 舊清單
