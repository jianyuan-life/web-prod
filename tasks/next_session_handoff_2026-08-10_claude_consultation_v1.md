# C／G15 consultation v1 Claude 接手完成紀錄（2026-08-10）

## 結論先行

Fly 六個發布阻斷（FLY-C01～C06）全部修完並轉綠，Web 端已接上新端點，跨語言驗章是真的跑過而不是靜態 fixture，D／R／legacy G15 補上窄型失敗閘。乾淨 clone 的預設 `npm run pre-deploy` 通過。

**RELEASE 仍為 HOLD。** 未合併 main、未部署 production、`USE_CONSULTATION_REPORT_V1_C/G15` 未開。剩餘阻斷分兩類：三項需要老闆拍板，四項需要老闆授權才能執行。

## 接手位置

| repo | 分支 | HEAD |
|:--|:--|:--|
| fortune-research | `claude/consultation-v1-calculate-20260809` | `3cb97f5` |
| web-prod | `codex/checkout-tone-fix-20260809` | `e69f2521` |

兩邊 remote 皆 0 未推。web-prod 的 `main` 仍停在接手前的 `7beafb12`，一行未動。

工作樹：
- `D:\Users\Desktop\Claude專案\Claude-鑑源-worktrees\fortune-consultation-v1-20260809`（乾淨，基底 `7255980f` = origin/main）
- `D:\Users\Desktop\Claude專案\Claude-鑑源-worktrees\web-checkout-tone-fix-20260809`
- `D:\Users\Desktop\Claude專案\Claude-鑑源-worktrees\web-clean-clone-20260810`（pre-deploy 驗證用的乾淨 clone）
- `D:\Users\Desktop\Claude專案\Claude-鑑源-worktrees\fortune-baseline-052a285`（byte-equivalence 對照基準，detached）

work-state card：`jianyuan-c-g15-full-ui-20260809`，owner/integrator 已轉為 claude。

## 做了什麼

### 新增 `POST /api/consultation/v1/calculate`

與 legacy `/api/calculate` 完全隔離。只有 C／G15 的 `callPythonCalculateAttested()` 切新路徑；`callPythonCalculate()`、`callChumenjiTop()`、E1–E4、E3 一行未改。

- **FLY-C01** `consultation_v1/request.py`：八個 consultation 欄位全部宣告 + `extra='forbid'`。未知 enum 一律 422，不回落預設。`time_mode` 與 `time_unknown` 矛盾、`target_year != as_of.year`、`exact` 缺 `minute`、出生日晚於 `as_of`，全部擋下。`BirthInput` 新增 `fold`（三個模稜兩可 DST 案例實測 fold 0 對 1 相差正好 3600 秒）。
- **FLY-C02** `calculators/_clock.py`：contextvar 單一時鐘來源，24 個直接讀時鐘的站點全數改走。未綁定即回落真實時鐘，legacy 行為不變。`consultation_v1/context.py` 的 `CalculationContext` 凍結，`birth_timezone`（出生地）與 `reference_timezone`（固定 HKT）分成兩欄。
- **FLY-C03** `consultation_v1/dispatch.py`：明確參數表取代 `co_varnames` 猜測。奇門真的收到 `time_source='birth'`，生物節律收到 `target_date=as_of`。未列表的系統直接報錯，不猜。
- **FLY-C04** `consultation_v1/adapter.py`：西占 `chart_ruler` 的 `name`／`planet_name` 只在 strict 專用副本上架橋，shared producer 與 interpreter 一行未改。
- **FLY-C05** `consultation_v1/ledger.py`：success／held／failed 三態。例外進 failed 並整筆 fail closed，不再包成 score 0 的「計算異常」analysis。
- **FLY-C06** `consultation_v1/attestation.py` + `middleware.py`：純 ASGI middleware，簽真正送出的 bytes。13 個 header 名稱與 12 欄簽章順序逐字對齊 web verifier，framing 數 UTF-8 bytes 而非字元數。

### 反例驗收抓到 5 個我自己漏的 P0

這段是給下一位看的重點：**自評全綠之後，fresh-context 的 Codex 與 Gemini 各花幾分鐘就找出測不到的東西。**

1. **吠陀寶石建議跨行程不決定**。`_recommend_gemstones` 用 `set` 迭代，順序跟 `PYTHONHASHSEED` 走，下游只取前幾筆。同一張命盤重新生成會拿到不同建議。影響 C／D／R／G15。Fly 唯讀驗算那句「3/3 bytes 一致」看不到它 —— 打的是同一個熱行程。
2. **未知時辰污染身強弱與用神**。`bazi.py:832` 算身強弱時無條件納入時干，而時干要到同一函式後段才被遮成「?」。實測翻轉：1971-02-03 01:00，帶假時柱「中和／用神金」，三柱「身強／用神水」。
3. **遮了 UI 沒遮數字**。第一輪修完後時柱從表格藏起來，十神力量統計卻照樣把假時柱加進總分。我原本的測試寫成 `A not in text or B not in text`，OR 讓它空過。
4. **古典占星漏 hold**。`chinese_classical.py:2379` 自建四柱且無三柱模式。
5. **吠陀逆轉王者瑜伽 + 西洋上帝之指**兩處雜湊序不決定。這兩個是在擴充 byte-equivalence 語料時才現形的 —— 先前只掃一個案例就說「全穩定」，那句話當時是錯的。

Codex 一項未採納並附證據：他說 `client_data['bazi']` 含時柱，實測顯示是「庚午 壬午 辛亥 未知」，不成立；但他指的那一類洩漏確實存在，位置在生肖運勢與 bazi_interp，已逐一挖出修掉。

### 證據

| 項目 | 結果 |
|:--|:--|
| Fly 契約測試 | 86/86（起手 63 RED） |
| Fly 部署收據測試 | 19/19 |
| fortune 全套 | 826 passed / 3 failed / 1 skipped |
| web 全套 | 791 passed / 0 failed / 2 skipped |
| web type-check | PASS |
| web raw-fetch | baseline 80，未新增 |
| **乾淨 clone 預設 pre-deploy** | **PASS**（type-check + raw-client + 預設 build 三關） |
| E3 freeze | 31/31 |
| E3 golden | 10/10 |
| 跨語言驗章 | 8/8，9 種竄改全 fail closed |
| determinism sweep | 6 案例 × 4 seed × 102 surface 全穩定 |
| legacy 對帳 | 25 案例 × 4 seed = 1,900 surface：1,809 相同 / 91 不同 |

那 3 個 fortune 失敗是既存的 `test_chumenji::TestWeekScan` 日期寫死測試，接手前的 baseline 就是同樣這 3 個，與本批無關。

91 個差異全部落在吠陀（89）與西洋（2），就是刻意的決定性修復。**不要把這句寫成「legacy 零變更」** —— 正確說法是「除已列明的決定性修復外，該語料未觀察到差異」。

### 可重跑的工具

```powershell
# 決定性巡檢:同一棵樹跨多個 PYTHONHASHSEED 分行程比對
py -3.12 api_server/tests/determinism_sweep.py

# calculator 指紋
py -3.12 api_server/tools/calculator_manifest.py

# 部署收據
py -3.12 api_server/tools/deployment_receipt.py build --app fortune-reports-api `
    --image-digest sha256:<64hex> --git-sha <40hex> --out <receipt.json>
py -3.12 api_server/tools/deployment_receipt.py verify --receipt <receipt.json>
```

## 剩餘阻斷

### 需要老闆拍板（三項，不得由代理單方決定）

1. **吠陀 Lagnesha**。Gemini 指出 `_recommend_gemstones` 的 `if lord in bad_lords: continue` 會把第 1 宮主在它同時管 6/8/12 宮時整個刪掉，而 Jyotish 認為 Lagna Lord 是生命石、不受凶宮 dosha 影響。若成立，牡羊／天蠍／金牛／天秤四個上升會缺最重要的一顆寶石。**這是既有行為、非本批引入**，且屬命理規則翻盤，依專案規則需 4 證齊全 + 老闆拍板。目前原樣保留，只記錄。
2. **未知時辰 held 6 套卻收全額 89 美元**。應在結帳前告知或提供降級方案，而不是背景砍掉再在報告裡解釋。商業決策。
3. **fail-closed 對部分交付**。目前任一 calculator 例外就整筆 500。Gemini 主張對已付款客戶應改 graceful degradation，但這與交接契約「partial failure 立即停止」直接衝突，屬先前已拍板事項，不由代理翻案。

### 需要老闆授權才能執行（四項）

- Vercel immutable preview 部署（96 案 desktop／tablet／mobile × light／dark／reduced-motion／400% zoom 矩陣尚未做）
- C／G15 synthetic E2E（需 preview 環境）
- 合併 main
- 開啟 `USE_CONSULTATION_REPORT_V1_C/G15`

### 仍未完成、不得宣稱

- G15 目前只有購買者單次聲明，缺逐位成年成員獨立同意與撤回紀錄。商業化／隱私阻擋。
- 25 維商業／UI benchmark 中「未見」與「部分」不可冒充滿分。
- Fly 仍只有唯讀與虛擬案例授權，未修改、未部署、未重啟、未寫 secret。
- HMAC 通過不等於命理學理正確；15 個槽位不等於 15 套成功；收據一致不等於命盤對。

## 建議的下一步順序

1. 老闆對上述三項拍板。
2. 取得 preview 授權 → 開 immutable preview 只開 C／G15 flags → 跑 96 案矩陣與 synthetic E2E。
3. 修 preview 找到的 findings → 再跑一輪 fresh-context 反例驗收。
4. 全部清零後向老闆確認，才動 main 與 production；先 C，再獨立開 G15。

---

# 補記：第三席反例審查（2026-08-10，本文件上半寫完之後）

上半部說「兩輪反例驗收」時，第三席還沒跑。跑完之後結論要改：**又抓到兩個整合層 P0，都會讓 C／G15 v1 一上線完全無法成案。**

## 三家審查怎麼跑的

`team_call --to claude` 從 Claude 根呼叫會被遞迴防護擋下（`provider cycle detected: claude,claude`）。這就是先前 work-state card 上「Claude team-call circuit open」的真正機制 —— 是設計上的封鎖，不是暫時故障。第三席改用唯讀 sub-agent 補。下一位要跑三家審查時不用再試 team_call 那條路。

## P0-A　strict endpoint 拒絕每一個真實請求

`lib/consultation/calculator-request.ts:111-113`：只要有座標就一定寫 `timezone_offset`，沒有任何路徑能省略。strict model 是 `extra='forbid'` 且沒宣告它。

後果鏈：422 → 被正常簽章 → 通過 verifier → `steps.ts` 的 `!response.ok` 丟 `RetryableError` → `maxRetries=3` 跑完 → `markReportFailed`。**客戶付了錢的報告直接失敗，不是降級。**

另一半：`bazi_school` / `ayanamsa_type` / `fold` 在 TS 端是條件式寫入，checkout 沒收集到就不送，而 strict model 三個都必填 → 同樣 422。

**為什麼測不到**：跨語言 fixture 的 request 是 `generate_attestation_fixture.py` 裡手寫的 `SYNTHETIC_PAYLOAD`，不是 `buildCalculatorRequestPayload()` 的實際輸出。strict model 從頭到尾沒看過真正會送過來的東西。test 89 只驗 HMAC framing，不驗 schema。

**修法**：`timezone_offset` 改為宣告而非忽略 —— IANA 時區仍是權威，但固定偏移若與該出生時刻的實際偏移矛盾（容差 1 分鐘）就 422，不替它挑贏家。TS 端三個欄位改為 consultationMode 一律明確送出。新增 `__tests__/91`，釘住 builder 輸出欄位集合與 strict model 宣告一致，兩邊任一漂移都紅。

## P0-B　held 回應被真實消費端整包拒絕

真的 Python held 回應（HTTP 200、6 套 held）餵進真的 `normalizeCalculatorFacts`，被**四條**獨立死因擋掉（審查報告列三條，第四條是實測時再挖到的）：

1. `hasSubstantiveAnalysis` 要求 `detail` ≥200 字 → held slot 是 `empty_shell`
2. payload 指紋只扣 `system`，6 個 held slot 逐 byte 相同 → `duplicate_payload`
3. `hasCalculatorClientContract` 要求 4 組干支，「未知」只湊得出 3 組
4. `five_elements_simple` 硬性要求總和 8（四柱 8 字），三柱只有 6

任一條都足以讓 `time_unknown=true` 的 C／G15 永遠生不出報告。

**修法**：新增 `isHeldCalculatorSlot()` 明確辨識 held 形狀；指紋比對與 substance 檢查都略過 held；client contract 在 `bazi` 帶「未知」時接受三柱與總和 6。反向守門：三柱但沒有「未知」標記仍要擋（時柱憑空消失是另一回事）、偽裝成 held 卻帶正文與分數的 slot 不得走豁免。`__tests__/92` 用 Python 嚴格端點實際產出的 held fixture，不是手寫的。

## P1-3　我自己寫的驗證工具在誇大能力

`determinism_sweep.py` 的 docstring 宣稱抓兩件事，實際只抓一件：它打的是 legacy 端點、完全沒碰嚴格端點，而且所有 worker 都凍在同一個日期，所以「讀行程時鐘而非 `as_of`」那條判準永遠不可能紅。

已改成兩個各自紅得起來的探針：probe 1 凍日期、變 seed；probe 2 固定 seed 與 `as_of`，把凍結日期拉到 2026-08-09 / 2027-02-28 / 2029-12-31。端點改打嚴格端點。6 案例 × 120 surface，兩個探針皆 stable。

## P1-4　康熙筆畫表漏在指紋外（我在收到報告前已自行抓到）

manifest 第一版只收 `.py` 與 `.txt`，三個 calculator 實際載入的資料檔全在外：`calculators/data/kangxi_strokes.json`（1.2M，決定每個客戶的姓名學）、`event_logic_db.json`、`hip_main.dat`（51M 星表）。換掉筆畫表 → 所有姓名學結果變 → hash 一個字不動。已修，檔數 59 → 62。

## 更新後的證據

| 項目 | 結果 |
|:--|:--|
| Fly 契約測試 | 92/92 |
| Fly 部署收據測試 | 25/25 |
| fortune 全套 | 838 passed / 3 failed / 1 skipped |
| web 全套 | 807 passed / 0 failed / 2 skipped |
| web type-check | PASS |
| 乾淨 clone 預設 pre-deploy | PASS |
| determinism sweep（兩探針） | 6 案例 × 120 surface 全 stable |

## 給下一位的一句話

**三席審查總共抓到 7 個「自評全綠」時測不到的 P0。** 每一次宣稱通過之後，都還有人能在幾分鐘內找到真缺陷。最貴的一條是 fixture 用手寫 payload 而非真實 builder 輸出 —— 測了半天，測的是想像中的呼叫端。接手後若要標 verified，請先確認你的測試餵的是**真的生產者輸出**，不是你自己寫的樣本。

## 仍未處理

- 第三席報告的 **4 個 P2 未逐條處置**（完整報告：`team-out` receipt，2026-08-09T16:31 那份 Gemini 的與 sub-agent 那份）
- 上半部列的三項拍板與四項授權，全部原封不動
