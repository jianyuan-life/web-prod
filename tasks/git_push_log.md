# Git Push Log(鑑源網頁部門)

> 依 `~/.claude/rules/git-workflow.md` 鐵律建檔(2026-04-27 v5.5.1 patch session)
> 每次 push 後立刻寫(不等 session 結束、不等老闆問)

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
