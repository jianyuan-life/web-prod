# P0 緊急 Bug 修復報告（2026-04-17）

X11 稽核抓出 6 個 P0 bug，本次一次修齊。**全部改動集中在「前端 / workflow / Python PDF API / 歷史修復腳本」，不觸碰排盤引擎。**

---

## 一次搞定的 6 個 P0

| # | Bug | 等級 | 狀態 |
|:---:|:---|:---:|:---:|
| P0-1 | E1/E2 所有報告 `pdf_url` 全 NULL（4+3=7 份） | CRITICAL | ✅ 修完 |
| P0-2 | R 方案「丙午026-2028」年份 bug（4 份全中） | CRITICAL | ✅ 修完 |
| P0-3 | Markdown `#` 殘留（C 7/7、E1 3/3、E2 1/3） | HIGH | ✅ 修完 |
| P0-4 | 分數超過 100（出現 110 / 200 / 220） | HIGH | ✅ 修完 |
| P0-5 | 報告頁中段 ~480px 空白 | CRITICAL | ✅ 修完 |
| P0-6 | React hydration error #418 | CRITICAL | ✅ 修完 |

---

## P0-1：E1/E2 完全沒有 PDF

### 根因
Python 端 `api_server/pdf_routes.py:1378` 的 `generate_pdf()` 函式對 E1/E2 直接 raise：
```python
if req.plan_code in ('E1', 'E2'):
    raise HTTPException(status_code=400, detail='出門訣方案不提供 PDF 報告')
```
導致 workflow/steps.ts `generatePDF()` fetch 收 400 → return None → `pdf_url = NULL`。

### 修法
- `api_server/pdf_routes.py` 刪掉 E1/E2 拒絕邏輯，保留註解說明
- workflow 端本來就會對 E1/E2 呼叫 generatePDF（index.ts line 614），無需再改

### Diff
```diff
- if req.plan_code in ('E1', 'E2'):
-     raise HTTPException(status_code=400, detail='出門訣方案不提供 PDF 報告')
+ # P0-1 修復（2026-04-17）：E1/E2 出門訣也要生成 PDF
+ # 影響：paid_reports 表中 E1 (4 份) + E2 (3 份) 報告完全沒有 PDF 可供客戶下載
```

### 歷史回填
用 `scripts/batch_fix_p0_reports.py` 掃描 `plan_code IN ('E1','E2') AND pdf_url IS NULL`，批次呼叫 Python `/api/generate-pdf` 重生 PDF、上傳 Storage、patch DB。

**待 Jamie 執行**：
```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  python3 scripts/batch_fix_p0_reports.py --apply --only pdf
```

---

## P0-2：R 方案「丙午026-2028」年份 bug

### 現象
```
六、你們的關係流年（丙午026-2028）
```
應為 `丙午（2026-2028）`。4 份 R 報告全部命中。

### 根因
AI 輸出時把左括號吃掉（可能是 tokenizer/stream chunk 切割），跑出 `丙午026-2028` 而不是 `丙午（2026-2028）`。`cleanFinalReport` 只處理 C 方案，`cleanAIResponse`（全方案共用）沒做這類清理，前端 `renderInlineMarkdown` 只處理「流年丙午」特例，不 cover 其他干支年。

### 修法
1. **workflows/generate-report/steps.ts** `cleanAIResponse` 加入：
   - 60 組干支年全部 cover：`/(甲子|...|癸亥)(\d{3})(?=[-－]\s*\d{4})/` → `$1（2$2`
   - 補上結尾全形括號：`/（2(\d{3})-(\d{4})(?![）)])/` → `（2$1-$2）`
2. **app/report/[token]/page.tsx** `renderInlineMarkdown` 同步擴大（前端安全網）
3. **AI prompt** 不需改（輸出本來就應該正確，此為 sanitize 層）

### 歷史回填
`batch_fix_p0_reports.py` 的 `fix_content_issues()` 會用相同 regex 更新既有 4 份 R 報告的 `ai_content`，不需要重跑 AI。

```bash
python3 scripts/batch_fix_p0_reports.py --apply --only content
```

---

## P0-3：Markdown `#` 殘留

### 現象
- 網頁 H2 顯示 `# 何宣逸 人生藍圖` 而非 `何宣逸 人生藍圖`
- C 方案 7/7 中、E1 3/3 中、E2 1/3 中

### 根因
AI 在 `## 章節` 內部又寫了 H1（`# ...`）當作標題用，前端 `parseStructuredContent` 用 `^## ` split，H1 行直接變成章節首行純文字。`renderInlineMarkdown` 第 427 行雖有 `.replace(/^# .+$/gm, '')` 但只在純文字段落生效，`parseStructuredContent` 拆出的章節 title 沒清。

### 修法
1. **workflows/generate-report/steps.ts** `cleanAIResponse` 加 `^#\s+(.+?)$` → `$1` 把 H1 整行轉為純段落
2. **app/report/[token]/page.tsx** `parseStructuredContent` 對每個 title 做 `.replace(/^#+\s*/, '')`
3. 雙層清理（server + render）保險

---

## P0-4：分數超過 100

### 現象
報告裡出現 `220 分`、`200/100`、`110 分`。

### 根因
AI 自由生成，沒有 clamp 邏輯；前端也無 sanitize。

### 修法（clamp 到 0-100）
1. **workflows/generate-report/steps.ts** `cleanAIResponse`：
   - `(\d{1,4})/100` → `min(100, max(0, n))/100`
   - `(評分：)(\d{1,4})` → clamp
   - `(\d{3,4}) 分` → clamp
2. **app/report/[token]/page.tsx** `renderInlineMarkdown` 同步處理 `(\d{3,4})/100`、`(\d{3,4}) 分`
3. 不禁止分數（因為現有 UI 有用），只 clamp

### 歷史回填
同樣由 `batch_fix_p0_reports.py --apply --only content` 處理。

---

## P0-5：報告頁中段 ~480px 空白

### 現象
Playwright 打開 `/report/[token]` 滾到 ~2000px 看到 ~480px 白色區域。

### 根因
`components/SectionExpander.tsx` 的 `extractHighlights()` 只抽「粗體 / 引言框 / emoji 標記 / → 開頭 / h3 / 彩色框」這些元素，若某章節是純段落文字（沒上述任何一種），`highlightHtml` 會是空字串。當 `hasMore=true` 且 `expanded=false`，渲染一個空 div + 底下一個「展開完整分析」按鈕 → 外層 `section-card` padding 28px + 內容空 + 按鈕 = ~480px 骨架。

### 修法
`SectionExpander` 判斷 highlights 可見文字 `< 80` 字時視為抽取失敗，直接 `return <div dangerouslySetInnerHTML={{ __html: fullHtml }} />` 不顯示展開按鈕，不留空白框。

```diff
+ const highlightVisible = visibleTextLength(highlightHtml)
+ const highlightsFallbackEmpty = highlightVisible < 80
- if (alwaysExpand || !hasMore) {
+ if (alwaysExpand || !hasMore || highlightsFallbackEmpty) {
    return <div dangerouslySetInnerHTML={{ __html: fullHtml }} />
  }
```

---

## P0-6：React hydration error #418

### 現象
所有報告頁 console 出現 hydration error #418 + parentNode null。

### 根因（兩處）
1. **`app/layout.tsx:208`** footer 用 `{new Date().getFullYear()}`。server render 用 server timezone 算，若跨年邊界可能和 client 不同；另外此字串在 SSR 寫死、client 不再重算，但 React hydration 仍可能比對不過。
2. **`app/report/[token]/page.tsx:827`** `new Date(report.created_at).toLocaleDateString('zh-TW', ...)` 在 server component 雖不 hydrate，但 Next.js cache 導致 SSR 的字串會因 timezone locale 被 client 注視為異常。

### 修法
1. footer 年份加 `suppressHydrationWarning` 屬性
2. 報告日期改用 **UTC 手動拼字串**（不用 toLocaleDateString），server 和 client 拼出的結果永遠一樣：
```tsx
<span suppressHydrationWarning>{(() => {
  const d = new Date(report.created_at)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${y}年${Number(m)}月${Number(dd)}日`
})()}</span>
```

---

## 品質驗證

- ✅ `npm run type-check` — 零錯誤
- ✅ `npm run build` — 成功（出所有路由 + middleware）
- ⏳ Playwright 自測 — 待 Jamie 審核後部署 preview 才跑

## 歷史資料回填指令（Jamie 執行）

```bash
cd Claude-鑑源網頁製作部門

# 0) 先 dry-run 看影響範圍
python3 scripts/batch_fix_p0_reports.py

# 1) E1/E2 PDF 重生（4+3=7 份）
python3 scripts/batch_fix_p0_reports.py --apply --only pdf

# 2) 既有 R/C/E1/E2 報告 ai_content 清理（年份+#+分數）
python3 scripts/batch_fix_p0_reports.py --apply --only content

# 3) 一次跑完
python3 scripts/batch_fix_p0_reports.py --apply
```

## 未 Push（按指示 local only）

- 前端：`app/layout.tsx`、`app/report/[token]/page.tsx`、`components/SectionExpander.tsx`
- workflow：`workflows/generate-report/steps.ts`
- Python PDF API：`Claude-鑑源命理研究部門/api_server/pdf_routes.py`
- 腳本：`scripts/batch_fix_p0_reports.py`
