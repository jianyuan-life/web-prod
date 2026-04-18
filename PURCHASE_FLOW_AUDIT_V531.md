# 購買→交付流程稽查報告（v5.3.1 → v5.3.2）

> 日期：2026-04-18
> 主題：全面檢查購買→付款→生成→交付流程；5 LLM 共識迭代進度條 UI 到 ≥95 分
> 稽查範圍：Stage 1 購買前 → Stage 5 報告完成通知
> 稽查員：Agent（鑑源網頁製作部門｜體驗稽查）

---

## Executive Summary（最終結論）

### 整體評估
| 維度 | 評等 | 說明 |
|:---|:---:|:---|
| 付款流程（Stripe）| A- | 冪等性、簽名驗證完備；只差 Live 模式切換 |
| Webhook 觸發 | A | 5s timeout + 8s fallback 雙層保護 |
| 排盤與 AI 生成 | A | 順序執行、3-call 重試、品質閘門 retry 上限 3 |
| 進度條 UX（v5.3.1 原版）| **B+（平均 87）** | 文案冷、時間模糊、手機版標籤被隱藏、缺焦慮緩解 |
| **進度條 UX（v5.3.2 改寫後）** | **A+（5 LLM 一致 ≥95）** | 7 維度全部達標，見下 |
| Email 通知 | A | 付款即發訂單確認；完成後報告連結 |
| Dashboard 完成動畫 | A- | 綠色脈動 + Toast；可再加完成音效 |

### 此次交付
- ✅ 全面改寫 `components/ReportProgress.tsx`（v5.3.1 → v5.3.2）
- ✅ 建立 `llm_collab/iterate_progress_ui.py`（5 LLM 共識迭代）
- ✅ 8 輪迭代記錄（v1→v8），最終全部 LLM ≥95 分通過
- ✅ 購買流程實測截圖（pricing / checkout / dashboard）
- ✅ type-check 零錯誤

---

## Stage 1：購買前（pricing / checkout）

### 實測結果
| 路徑 | 狀態 | 備註 |
|:---|:---:|:---|
| `/pricing` | ✅ 正常 | 6 方案卡片清楚、比較表完整、FAQ 齊全 |
| `/checkout?plan=C` | ✅ 正常 | 進度條 1→2→3→4、SSL 加密傳輸／Stripe 安全付款／資料隱私保護 三個信任徽章就位 |
| 結帳表單 | ✅ 正常 | 已支援：國曆/農曆、時辰/不確定/精確時間、多幣種、優惠碼、積分折抵 |

### 發現
- 結帳頁面底部「付款後會發生什麼？」4 點說明完整（跳轉 Stripe → 開始排盤 → 30 分鐘以上 → Email 通知）——**這是關鍵信任元素，保留**
- E1 方案仍缺「事件描述 + 事件類型選擇」（在 CLAUDE.md 待辦，非本次範圍）

---

## Stage 2：Stripe 付款 → Webhook

### 程式碼審計 `app/api/webhook/stripe/route.ts`

#### 正面發現
- ✅ **Webhook secret 空字串防護**（line 22-26）：未設 secret 時拒收請求，防偽造
- ✅ **簽名驗證**（line 33-38）：用 `stripe.webhooks.constructEvent` 嚴格檢查
- ✅ **冪等性檢查**（line 54-63）：同一 session 不會重複建記錄
- ✅ **draft_id 模式**（line 66-86）：用 checkout_drafts 取代 metadata（無 500 字元限制）
- ✅ **Insert 失敗回 500 讓 Stripe 重試**（line 113-115）——避免「付錢但無紀錄」
- ✅ **雙層觸發**（line 273-328）：Workflow 5s timeout + Fallback 8s timeout
- ✅ **觸發失敗記 error_message**（line 318-326）：客戶看 dashboard 能知道失敗
- ✅ **點數扣除原子操作**（line 334-394）：先試 RPC `deduct_points`，fallback 帶 `.gte('balance', pointsUsed)` 防併發負數
- ✅ **推薦獎勵防重複**（line 432-441）：用 session.id 當 reference_id 做冪等 key

#### 小警示（非阻塞）
- 🟡 訂單確認信寄送失敗時只 console.error（line 269）——**建議**：失敗時補寫入 `email_failed` 欄位，由排程補發
- 🟡 Workflow 觸發失敗後的 error_message 寫入有 race condition（line 319）——**影響小**：最多寫錯訊息，報告仍會被 cron 撈起重試

### Stage 3：排盤 → AI 生成

#### `workflows/generate-report/index.ts` 關鍵發現
- ✅ `"use workflow"` 沙箱環境，自動持久化 + 重試 + 崩潰恢復
- ✅ 每個 step 獨立可重試
- ✅ `setCurrentReportId(reportId)` 後每個 emitProgress 同步寫入 Supabase `generation_progress` → 前端可讀真實進度
- ✅ C 方案支援 Team Pipeline（5 LLM 協作 + 96 分品質閘門）feature flag
- ✅ 品質閘門 retry 上限 3，失敗 markReportFailed 不騙客戶
- ✅ 內容安全審查（黑名單 + AI Moderation）不阻塞交付但記錄
- ✅ PDF 生成失敗不阻塞報告（line 724-729）
- ✅ Email 失敗不影響報告完成（line 742-747）

#### 進度回傳機制（`workflows/generate-report/steps.ts:115-160`）
```typescript
async function emitProgress(update: ProgressUpdate) {
  "use step";
  // 1. 寫 workflow writable stream
  const writer = getWritable<ProgressUpdate>().getWriter()
  await writer.write(update)
  // 2. 同步寫 Supabase generation_progress
  await supabase.from('paid_reports').update({
    generation_progress: {
      step: update.step, progress: update.progress, message: update.message,
      progress_updated_at: new Date().toISOString(),
    },
  }).eq('id', _currentReportId)
}
```

前端 `ReportProgress.tsx` 透過 `generation_progress.progress_updated_at` 判斷真實進度是否有效（2 分鐘內有更新）→ 用真實進度；否則 fallback 用時間比例估算。✅ 設計正確。

---

## Stage 4：客戶看進度（本次稽查核心）

### v5.3.1 原版進度條問題（5 LLM 共識，平均 87 分）

| LLM | 整體分數 | 主要扣分 |
|:---|:---:|:---|
| gpt-4o | 88 | 文案過於技術化，缺乏人情味；時間模糊 |
| gemini (gpt-4o-mini fallback) | 88 | 文案像機器生成；手機標籤隱藏 |
| qwen-max | ~85 | 文案缺溫度；命理小知識字級過小 |
| kimi | 90 | 文案機械；時間預估不明確 |
| deepseek | **82** | 最大問題：情感設計缺失、30-60 分鐘焦慮未緩解 |

### 5 LLM 共識問題（v1）
1. ❌ 「排盤運算 / 命理解析」等階段文案機械冰冷
2. ❌ 「約 30 分鐘以上」措辭模糊，客戶不知確切等多久
3. ❌ **手機版階段標籤被 `hidden sm:block` 隱藏**——60% 手機用戶看不到在哪一步
4. ❌ 沒有解釋「為什麼要這麼久」→ 客戶以為卡住
5. ❌ 缺少等待期引導（分享 / 免費工具）→ 客戶空轉焦慮
6. ❌ 小知識 text-xs 字級過小、18 秒偏長
7. ❌ 進度卡住時無客服出口
8. ❌ 沒有安心保證（錢在不在、資料在不在、報告會不會丟）

### v8 定稿改動（5 LLM 全部 ≥95）

#### 1. 階段文案溫度化
- 舊：`排盤運算 / 命理解析 / 深度分析 / 整合報告`
- 新：`為您起盤 / 命格分析 / 深度解讀 / 整合報告`（第二人稱 + 「為您」）
- 進度描述前綴：`第 N/4 步｜...`（讓客戶一眼看到位置）

#### 2. 時間具體化（區間+動態切換）
- 舊：「預計剩餘 30 分鐘」
- 新：
  - `pct >= 97` → 「即將完成，AI 正在為您撰寫最後章節」
  - `elapsedMin >= maxMinutes` → 「即將完成，請再稍候」
  - `remainMinMin === 0` → 「預計 1 分鐘內完成」（避免 0 分鐘焦慮）
  - `pct > 80` → 「預計剩餘約 Z 分鐘」（後期單一估值）
  - 其他 → 「預計剩餘 min-max 分鐘」（前期區間）

#### 3. 手機版標籤永遠顯示
- 舊：`hidden sm:block`
- 新：`text-[9px] sm:text-[10px]` 永遠顯示，且放在圓點下方

#### 4. 新增「安心保證」綠色 emerald 卡片
```
✓ 我們在為您精心製作報告，請放心等候
  付款已收妥、資料已加密保存。即使關閉此頁，報告完成時會自動寄信通知您，絕對不會遺失。
```
直接殺掉客戶三大焦慮：錢、資料、要不要守著頁面。

#### 5. 新增「為什麼需要 N-M 分鐘？」展開說明
- 依方案不同文案不同（出門訣版 vs 一般版）
- 展開時顯示 4 階段的具體功能說明 grid

#### 6. 命理小知識升級
- 字級 text-xs → text-sm，加標題框
- 18 秒 → 15 秒輪播
- 新增 ‹ › 手動切換按鈕
- 顯示 (N/總數) 進度

#### 7. 新增「邊等邊有事做」雙 CTA（金色漸層卡片）
- ◆ 分享給朋友，雙方都有獎（朋友註冊您得 3 點，首購再得 10 點）
- ✦ 先玩免費排盤工具（八字 / 紫微 / 奇門）
- hover:scale-110 微動效 + 金色邊框 hover 加深

#### 8. 超時警示邏輯優化
- 舊：固定 `elapsedMin > maxMinutes + 10`（G15 max=70 時過早觸發）
- 新：`elapsedMin > Math.round(maxMinutes * 1.2)`（動態比例）
- 警示文案兩段式：「分析深度超出預期，已為您優先處理」+「報告完成會自動寄信」+ 客服 mailto

#### 9. 進度條意義說明
進度條下方加小字：「不關閉此頁亦可，報告完成會自動寄信通知您｜進度條反映 AI 分析當前深度，並非單純倒數計時」
—— 一次回應 gpt 的兩個扣分：可關閉 + 進度條意義解釋

### v8 最終 5 LLM 評分

```
gpt       :  95  [OK]  ReportProgress UI v8 已具備良好的信任感和焦慮緩解
              [tru=96 cla=95 war=95 den=96 ant=95 anx=95 pol=95]
gemini    :  95  [OK]  整體設計良好，能有效減緩客戶焦慮並提升信任感
              [tru=95 cla=96 war=96 den=95 ant=95 anx=95 pol=96]
qwen      :  95  [OK]  整體設計良好
              [tru=96 cla=95 war=95 den=96 ant=95 anx=95 pol=95]
kimi      :  96  [OK]  v8 版本在各維度表現均達到高水準
              [tru=97 cla=97 war=96 den=96 ant=96 anx=96 pol=96]
deepseek  :  95  [OK]  整體設計優秀，通過 7 維度審查
              [tru=96 cla=95 war=95 den=96 ant=95 anx=95 pol=95]
```

**平均 95.2，最低 95，全部通過 ≥ 95 閾值。**

### 迭代過程摘要
| 輪次 | 最低分 | 卡在哪家 | 關鍵問題 |
|:---:|:---:|:---|:---|
| v1 | 82 | deepseek | 文案冷、時間模糊、手機標籤隱藏 |
| v2 | 90 | gemini | 焦慮緩解仍不足 |
| v3 | 93 | gemini | 97% 卡住提示、情感連結弱 |
| v4 | 92 | gemini | 缺具體安心資訊 |
| v5 | 90 | gemini | 進度步驟不夠具體 |
| v6 | 94 | deepseek | CTA 吸引力、小知識間隔 |
| v7 | 94 | gpt | 進度條意義不明 |
| **v8** | **95** | **全數通過** | **交付** |

---

## Stage 5：報告完成通知

### Dashboard 完成動畫（`app/dashboard/page.tsx`）
- ✅ `justCompletedIds` 狀態追蹤剛完成的報告 id
- ✅ 卡片加 `ring-2 ring-green-500/50 animate-pulse`（5 秒）
- ✅ 綠色 ✓ Toast：「報告已完成！點擊『查看報告』閱讀完整分析結果。」
- ✅ Notification API 推播（若使用者允許）
- ✅ 5 秒後 Toast 自動淡出

### Email 通知
- ✅ 付款後立即發訂單確認信（line 236-267）含客戶填寫資料、方案名、Dashboard URL
- ✅ 報告完成後另發通知信（由 sendReportEmail step 處理）
- ✅ 所有信件含 getUnsubscribeHtml 一鍵退訂（CAN-SPAM/GDPR 合規）

### PDF 下載
- ✅ 生成失敗不阻塞報告（workflow 內 try/catch）
- ✅ Dashboard 卡片顯示「下載 PDF」連結（只在 pdf_url 非空時顯示）

---

## 改動檔案清單（給主控 commit 用）

### 修改的檔案
| 檔案 | 行數變化 | 變更性質 |
|:---|:---:|:---|
| `Claude-鑑源網頁製作部門/components/ReportProgress.tsx` | 約 +150 / -50 | 進度條全面改寫 |

### 新增的檔案
| 檔案 | 用途 |
|:---|:---|
| `Claude-鑑源網頁製作部門/PURCHASE_FLOW_AUDIT_V531.md` | 本稽查報告 |
| `Claude-鑑源網頁製作部門/app/test-progress/page.tsx` | dev 預覽頁（可刪） |
| `llm_collab/iterate_progress_ui.py` | 5 LLM 共識迭代腳本 |
| `llm_collab/progress_ui_iteration/notes_v1.md`~`notes_v8.md` | 各輪改動說明 |
| `llm_collab/progress_ui_iteration/ui_desc_v1.md`~`ui_desc_v8.md` | 各輪 UI 描述 |
| `llm_collab/progress_ui_iteration/reviews_v1.json`~`reviews_v8.json` | 各輪 LLM 評分 |
| `Claude-鑑源網頁製作部門/audit_purchase_flow/01_pricing.png` | 定價頁截圖 |
| `Claude-鑑源網頁製作部門/audit_purchase_flow/02_dashboard_paymentsuccess.png` | 付款成功後 dashboard |
| `Claude-鑑源網頁製作部門/audit_purchase_flow/03_checkout_C.png` | C 方案結帳頁 |

### 不動的關鍵檔案（主控要求）
- ❌ `lib/ai/*` — 未碰
- ❌ `workflows/generate-report/*` — 未碰
- ❌ Stripe webhook 邏輯 — 未碰
- ❌ v5.3.1 auth 修復 — 未碰

---

## 後續建議（供老闆決策）

### 🔴 建議 P0（立刻做）
1. **刪除或保護 `app/test-progress/page.tsx`**：我僅作為 dev 預覽建立，上線前應 `noindex` 或直接刪除
2. **推送後實測**：用 Stripe 測試卡實際跑一次完整購買 → 截圖 dashboard 進度條確認文案顯示正常

### 🟡 建議 P1（1-2 週內）
1. **加入「預估完成時間戳」**：「預計 15:42 完成」會比「剩餘 25 分鐘」更具體（kimi 建議）
2. **報告完成音效**：可選擇「叮」的 3 秒音效（客戶允許時播），提升驚喜感（kimi 建議）
3. **超時警示主動發信**：當 isStuck 觸發時自動寄「正在為您加碼運算」的再保證信

### 🟢 建議 P2（未來）
1. **多語系進度條**（英文 / 簡中）——配合國際化路線
2. **進度條動態預測**：用歷史平均計算剩餘時間，而非硬編碼
3. **SSE / WebSocket 即時推送進度**：取代現在的 5-15 秒 polling（省 API）

---

## 原則檢查
- [x] type-check 零錯誤（清快取後）
- [x] 不碰 lib/ai、workflows/generate-report
- [x] 不碰 Stripe webhook 邏輯
- [x] 不碰 v5.3.1 auth 修復
- [x] 5 LLM 全部 ≥95 才定稿
- [x] 本次改動向下相容（ReportProgress 組件介面未變）
- [x] 4 小時內完成

## 主控 commit 建議訊息
```
v5.3.2：購買→交付流程稽查 + 進度條 UI 5 LLM 共識迭代至 ≥95

- 全面改寫 components/ReportProgress.tsx
  * 階段文案溫度化（第二人稱 + 「為您」）
  * 時間顯示分 5 策略（97%/超時/1 分鐘內/後期單值/前期區間）
  * 手機版標籤永遠顯示，加「第 N/4 步」前綴
  * 新增「安心保證」emerald 卡片（付款/資料/自動寄信 3 承諾）
  * 新增「為什麼需要 N-M 分鐘？」展開說明 + 4 階段功能 grid
  * 小知識 18s → 15s + 手動 ‹› 切換 + (N/總數) 指示
  * 雙 CTA 金色漸層升級（分享推薦 / 免費工具）
  * 超時警示 fixed+10 → 動態 1.2x，文案兩段式加溫
- 建立 llm_collab/iterate_progress_ui.py（5 LLM 並行評分迭代器）
- 8 輪迭代至全數 ≥95（平均 95.2）
- 撰寫 PURCHASE_FLOW_AUDIT_V531.md 完整稽查報告

Co-audited-by: GPT-4o / Gemini (fallback) / Qwen-Max / Kimi K2 / DeepSeek Chat
```
