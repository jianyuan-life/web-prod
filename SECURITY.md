# 鑒源 JianYuan — 安全防線總覽(v5.10.328、2026-05-14)

> 本檔總結鑑源 web 平台的所有安全 / 效能 / 監控防線、便於 audit + onboarding。
> 詳細實作見 `lib/security/`、`middleware.ts`、`next.config.ts`、`instrumentation.ts`。

---

## 1. Bot 防禦(Anti-Bot / Anti-Scraping)

| 防線 | 實作 | 狀態 |
|:---|:---|:---|
| UA classifier(攔 21 家 AI 訓練爬蟲) | `lib/security/bot-detect.ts` + middleware STAGE 1 | ✅ |
| 攻擊型 scanner regex(sqlmap/nuclei/headless) | 同上 | ✅ |
| robots.txt 禁 21 家 AI bot | `app/robots.ts` | ✅ |
| Crawl-Delay 5 秒節流 | 同上 | ✅ |
| Vercel Bot Filter(dashboard 設定) | manual | ⚠️ 待 dashboard 開 |
| Cloudflare Turnstile CAPTCHA | `lib/security/turnstile.ts` | 🟡 stub mode、待 key |

## 2. Rate Limiting / Anti-DDoS

| 防線 | 實作 | 狀態 |
|:---|:---|:---|
| 全站 per-IP 240/min hard-cap | `middleware.ts` STAGE 2 | ✅ |
| Per-route per-IP 細粒度限速(2-120/min) | `middleware.ts` STAGE 5 | ✅ |
| /api/free-* 每日 30 次 | `middleware.ts` | ✅ |
| 推薦碼 brute-force 鎖(5 次失敗 1 小時) | `middleware.ts` | ✅ |
| 後台 admin auth 暴力鎖(5 次 30 分鐘) | `lib/admin-rate-limit.ts` | ✅ |
| Stripe webhook 12 個 IP 白名單(繞 limit) | `lib/security/ip-blocklist.ts` | ✅ |
| 已知惡意 IP 黑名單 prefix 比對 | 同上 | ✅(空清單、有事件再加) |
| Sliding window 演算法(替代 fixed window) | `lib/security/sliding-window.ts` | ✅ helper available |
| Upstash Redis 跨區同步 | `lib/security/sliding-window.ts` 註解 | ❌ 待 env |

## 3. 安全標頭

| Header | 值 | 狀態 |
|:---|:---|:---|
| Strict-Transport-Security | max-age=63072000; includeSubDomains; preload | ✅ |
| X-Frame-Options | DENY | ✅ |
| X-Content-Type-Options | nosniff | ✅ |
| Referrer-Policy | strict-origin-when-cross-origin | ✅ |
| Permissions-Policy | 13 項 ban list | ✅ |
| Cross-Origin-Opener-Policy | same-origin | ✅ |
| Cross-Origin-Resource-Policy | same-site | ✅ |
| Content-Security-Policy | strict + report-uri | ✅(含 unsafe-inline、Sprint 5 改 nonce) |
| Reporting-Endpoints | csp-endpoint=/api/csp-report | ✅ |
| X-Robots-Tag(私密路徑) | noindex, nofollow, ... | ✅ |

## 4. 監控 / Observability

| 工具 | 用途 | 狀態 |
|:---|:---|:---|
| Vercel Analytics | page view + traffic source | ✅ wired |
| Vercel Speed Insights | Core Web Vitals RUM | ✅ wired |
| 客製 web-vitals 上報 | LCP/INP/CLS/FCP/TTFB/FID raw data | ✅ `/api/web-vitals` |
| CSP violation 報告 | 監測 inline / 第三方 domain 衝擊 | ✅ `/api/csp-report` |
| 健康檢查 endpoint | UptimeRobot / Pingdom | ✅ `/api/health-check` |
| Admin self-audit | 安全狀態總表 | ✅ `/api/admin/security-status` |
| Next.js 16 instrumentation hook | error capture + Sentry/OTel hook | ✅ `instrumentation.ts`(stub) |
| Sentry | error tracking | 🟡 stub、待 DSN |
| OpenTelemetry | distributed tracing | 🟡 stub、待 OTLP endpoint |

## 5. 認證 / Authorization

| 機制 | 實作 | 狀態 |
|:---|:---|:---|
| Supabase auth(註冊 / 登入 / SSO) | `lib/auth.ts` | ✅ |
| timing-safe ADMIN_KEY 比對 | `lib/admin-rate-limit.ts` | ✅ |
| 暴力破解鎖 30 分鐘 | 同上 | ✅ |
| /report/[token] 公開 token URL | `app/report/[token]/page.tsx` | ⚠️ Sprint 5 改 cookie + JWT |
| 報告分享簽名 URL | 待 Sprint 5 | ❌ |

## 6. 第三方整合保護

| 整合 | 防護 |
|:---|:---|
| Stripe webhook | webhook signature 驗證 + IP 白名單(12 個 + signature 雙保險) |
| Resend email | API key in env、不 client-side 暴露 |
| Anthropic API | server-side only、API key in env |
| Supabase | RLS policy + service role key only server side |
| Cloudflare | 待整合(Turnstile CAPTCHA stub 已準備) |

## 7. Sprint 5 待做(L4 Gemini grounding 2026-05-14 verify 93/100)

優先序(高 → 低):
1. **Subresource Integrity (SRI)** for Stripe / Turnstile inline scripts(OWASP 2025 A03、預估 30 min)
2. **Speculative Rules API**(LCP 改善 200-500ms、預估 1h)
3. **Server Taint API(`experimental.taint`)**(防敏感變數誤導出 client、預估 1h)
4. **Edge Config 動態 IP blacklist**(秒級同步 vs hardcode、預估 2h)
5. **INP 優化 React Compiler**(預估 INP 改善 50-100ms、預估 4h)
6. **Upstash Redis sliding window**(跨區同步、需 Vercel Marketplace 設定、預估 4h)
7. **Sentry 啟用**(npm install + DSN env、待老闆 / 自註冊 sentry.io、預估 30 min 設定 + 1h 整合)
8. **CSP nonce-based**(移 unsafe-inline、6h)
9. **Cookie auth /report/[token]**(改 short-lived signed JWT、8h)

## 8. 漏洞通報

見 `/.well-known/security.txt`(RFC 9116):
- 聯絡:support@jianyuan.life
- 回覆 SLA:72 小時
- Safe harbor:善意研究人員

---

**最後更新**:2026-05-14(v5.10.328 Sprint 4 完成)
**負責人**:Claude(基於 Multi-LLM dispatch + L4 Gemini grounding 93/100)
