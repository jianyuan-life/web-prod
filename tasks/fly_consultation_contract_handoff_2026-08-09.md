# Fly C／G15 consultation contract：Claude 接手規格（2026-08-09）

## 判定

目前 C／G15 structured v1 **不得發布**。Web 已建立比 legacy 更嚴格的 request、facts 與 HMAC verifier，但 Fly production 尚未真正消費這些欄位，也沒有 attestation producer。若直接開 flag，最好的結果是 Web fail closed；若繞過 gate，則可能把錯誤或不可重播的排盤標成已驗證資料。

本文件整合三份 fresh-context 唯讀審計：request contract、15 系統 `as_of`／determinism、attestation／release identity。沒有修改 Fly、沒有 deploy、沒有讀取 secret value，也沒有使用真人資料。

審計基準：

- Web：`codex/checkout-tone-fix-20260809@6ee3ac9b9b6388eff9f5473cf3962c57c25edeb5`
- fortune-research 本機 `origin/main`：`7255980f3e33b6dddabe09d3ac491b3447486f1d`
- Fly live image label 指向：`4f83f1523f13cacb35ae18e00795fee14263d27a`
- 本機 fortune-research 有其他代理／使用者的 dirty files；Claude 必須另建乾淨 worktree，不可在該工作樹直接 build 或提交。

## 六個發布阻斷

| ID | 嚴重度 | OBSERVED | 後果 |
|---|---|---|---|
| FLY-C01 | P0 | `BirthRequest(extra='ignore')` 靜默丟掉八個 consultation 欄位 | 未知時辰、精確時間、流派、DST fold 會被改成預設值 |
| FLY-C02 | P0 | `as_of` 在 production Python source 0 命中；13/15 系統仍讀 process clock，9/15 不接 `target_year` | 同一已付款報告跨日／月／年重生成可能變盤 |
| FLY-C03 | P0 | `SYSTEM_PAIRS` 雖宣告奇門 `time_source='birth'`，dispatcher 沒有傳入 | C／G15 奇門會落回生成當下時間 |
| FLY-C04 | P0 | 西占 producer 輸出 `chart_ruler.name`，interpreter 讀 `planet_name` | 合法案例可變成 HTTP 200 的「計算異常」placeholder |
| FLY-C05 | P0 | 個別 calculator exception 被轉為 analysis slot，endpoint 仍以 `len(analyses)` 回 `systems_count=15` | 槽位數被誤當成功數，沒有可逆 failure ledger |
| FLY-C06 | P0 | Fly 回應缺 13/13 attestation headers；release identity 依賴 runtime 無法可靠自證的 release/digest | Web structured caller必然 fail closed；補假 header 也不能建立可信 provenance |

## Request 欄位逐項核對

Web 在 `lib/consultation/calculator-request.ts` 與 `workflows/generate-report/consultation-v1.ts` 送出完整 consultation payload；Fly `api_server/api_server.py:115-143` 沒有宣告下列八欄，並以 `extra='ignore'` 靜默吞掉：

| 欄位 | Fly 現況 | 實質影響 | 要求 |
|---|---|---|---|
| `calendar_type` | 丟棄 | 現行 C/G15 Web 已只允許國曆，暫無數值影響 | strict endpoint 限定 `solar`，其他值 422 |
| `lunar_leap` | 丟棄 | 現行 Web 已拒絕農曆／閏月 | strict endpoint 限定 `false`，不可 silent ignore |
| `time_unknown` | 丟棄，`BirthInput` 落回 `false` | 虛構 12:00 時柱會被當真；時辰依賴系統仍產生完整 facts | 未知時辰僅保留不依賴時間的結果，其餘回結構化 `held` |
| `time_mode` | 丟棄，落回 `shichen` | `exact` 無法啟用八字真太陽時；精度標記錯誤 | 明確驗證 `unknown/shichen/exact` 與 hour/minute 的一致性 |
| `as_of` | 丟棄 | Web 宣告的報告基準日並非 Fly 實際計算基準日 | strict request 必填；建立 immutable calculation context |
| `bazi_school` | 丟棄，落回 `china_mainland` | 非預設子初／子正換日流派會被靜默改盤 | 明確 enum 並原樣傳給八字 |
| `ayanamsa_type` | 丟棄，落回 `lahiri` | Raman／KP 等輸入會被靜默改回 Lahiri | 明確 enum 並原樣傳給吠陀占星 |
| `fold` | 丟棄，`birth_utc` 實際使用 fold 0 | DST ambiguous time 的 fold 1 重播可差一小時 | strict 驗證並帶入 `replace(..., fold=fold)` |

另外，`target_year` 雖由 API 接收，dispatcher 只傳給部分 calculator。Web `calculator-facts.ts` 目前會把 request envelope 的 `asOfDate` 記成 facts 基準日，但 Fly 沒有使用該日期；修復前這只是「Web 送過的宣告」，不是「計算器已消費的事實」。

## 15 系統時間契約矩陣

| 系統 | 接收 `target_year` | C 現行仍讀 runtime clock | 關鍵位置 |
|---|---:|---:|---|
| 八字四柱 | 否 | 是 | `bazi.py:923-967` |
| 紫微斗數 | 否 | 是 | `ziwei_doushu.py:1639-1658` |
| 西洋占星 | 否 | 是，同日也可能漂移 | `western_astrology.py:2206-2213,2392-2405` |
| 吠陀占星 | 否 | 是 | `vedic_astrology.py:511-545,1450-1471` |
| 生肖運勢 | 是 | 是，今日運／農曆月 | `chinese_zodiac.py:1468-1478,1588-1602` |
| 數字能量學 | 是 | 是，流日 | `numerology.py:1434-1437,1485-1504` |
| 姓名學 | 否 | 是 | `name_numerology.py:1832-1839` |
| 古典占星 | 是 | 是，流月／流日 | `chinese_classical.py:2310-2346` |
| 易經 | 否 | 否 | `i_ching.py:1812-1882` |
| 風水 | 是 | 是，五黃月 | `fengshui.py:1537-1543` |
| 人類圖 | 否 | 是 | `human_design.py:2511-2520` |
| 奇門遁甲 | 是 | 是，且 dispatcher 漏傳 birth time source | `qimen_dunjia.py:3028-3057,3099-3105` |
| 塔羅牌 | 是 | 否（C 有傳 target year） | `tarot.py:1750-1799` |
| 生物節律 | 否 | 是，dispatcher 未傳 `target_date` | `biorhythm.py:610-647` |
| 九星氣學 | 否 | 是 | `nine_star_qi.py:150-176` |

統計：6/15 接收 `target_year`；9/15 忽略；13/15 在 C 現行路徑仍受 process clock 影響；只有易經、塔羅在現行輸入下具 calculation-level 可重播性。

直接重現已證明：即使送 `target_year=2040`，八字輸出仍包含 `流年：2026丙午` 與 `【2026年流年深度分析】`。因此 response attestation 只能證明「服務回了這些 bytes」，不能把錯誤的時間語意變正確。

## 西洋占星 schema crash

虛構輸入 `1990-06-15 10:30 Asia/Taipei` 可在目前 source 重現 `KeyError: 'planet_name'`：

- producer `western_astrology.py:2319-2326` 產生 `chart_ruler` keys：`planet, name, sign, house, dignity, meaning`
- interpreter `all_interpreters.py:532,666` 卻讀 `planet_name`；666 行在尊貴狀態成立時直接索引並崩潰
- 僅在記憶體補 `chart_ruler['planet_name'] = chart_ruler['name']` 後，同一 interpreter 可完成並得到正常 analysis

正確修法應先把 `name` 定為 producer/consumer canonical schema，再同時修正兩個 consumer call site；不可只在 exception handler 補空值。回歸必須走真 producer → interpreter，而不是手刻一份兩邊都同意的 fixture。

## 目標架構：與 E3 完全隔離

不要直接改寫 shared legacy `/api/calculate` 的語意。建議新增版本化 endpoint：

```text
POST /api/consultation/v1/calculate
```

只有 C／G15 的 `callPythonCalculateAttested()` 切到新路徑；`callPythonCalculate()`、`callChumenjiTop()`、E1–E4／E3 繼續使用原路徑與原 bytes。

這是協同 contract migration，不是只新增 Fly route：Web 的 fetch URL、attestation canonical path、verifier期望值與跨語言 fixture都必須一起改成新路徑。現有 test 55 fixture 的 `path=/api/calculate` 不能原樣沿用；要保留舊 fixture作 v1 regression，另由 Python producer生成新 endpoint fixture，證明雙方對相同 path bytes達成一致。

### 1. Strict request

- `extra='forbid'`
- 必填 `as_of`、`target_year`，並驗證 `target_year == as_of.year`
- 明確宣告及驗證全部八個 consultation 欄位
- unknown／shichen／exact、minute、longitude、timezone、fold 的組合不一致時 422
- 不得將錯字、未知 enum 或 legacy 欄位靜默改成預設值

### 2. Immutable `CalculationContext`

至少包含：

```text
as_of_date
reference_datetime = as_of 12:00 Asia/Hong_Kong
target_year
birth_timezone
reference_timezone = Asia/Hong_Kong
time_unknown
time_mode
fold
bazi_school
ayanamsa_type
```

`birth_timezone` 是 request中的出生地 IANA timezone；`reference_timezone` 是報告基準日採用的固定 HKT語意，兩者不可混為一欄。所有「目前／今日／當年」計算只能從 context 取得。metadata 的真實產生時間可另存，但不可參與命理結果。dispatcher 使用明確 adapter，不再用 `co_varnames` 猜 calculator 支援哪些參數。

奇門 C/G15 必須傳 `time_source='birth'`；生物節律必須傳 `target_date=as_of_date`。未知時辰不可再用中午 placeholder 生成時柱、Ascendant、Lagna、人類圖閘門等結論；可計算部分與 held 部分要有機器可判定的狀態。

西占 `name/planet_name` 修復不得直接改變 E3使用的 legacy pipeline。先在 strict endpoint專用 adapter／interpreter schema converter統一成 canonical `name`，並以真 producer → strict interpreter測試。若日後要修 shared producer/consumer，必須先證明所有 E3 payload與 golden output byte-equivalent，再取得凍結邊界允許；不能以「E3通常不使用西占」當作零影響證明。

### 3. Strict success ledger

回應至少包含：

```json
{
  "analysis_context": {
    "mode": "consultation_v1",
    "as_of": "YYYY-MM-DD",
    "target_year": 2026,
    "birth_timezone": "Asia/Taipei",
    "reference_timezone": "Asia/Hong_Kong"
  },
  "successful_systems": [],
  "held_systems": [],
  "failed_systems": []
}
```

Web 必須逐欄核對 `analysis_context`：`birth_timezone` 等於 request timezone；`reference_timezone` 固定為 `Asia/Hong_Kong`；`as_of/target_year` 等於 envelope。任何 exception placeholder、重複／缺少系統、未知 status 或 failure ledger 不一致都 fail closed；`systems_count` 只可描述槽位，不能再冒充成功數。

`held` 不是空殼錯誤，也不是假的分析正文。strict response中每個 held slot必須是明確 schema，例如：

```json
{
  "system": "西洋占星",
  "status": "held",
  "reason": "birth_time_unknown",
  "detail": null,
  "score": null
}
```

Web strict validator要先驗 `status/reason`，只有 `status='success'` 才執行 substantive-content gate；held只允許在 request確為 unknown time且 system位於受影響 allowlist時出現，並且不得進 facts、Prompt或結論。完整性條件改為 `successful + held = 15`、`failed = 0`、system names唯一且剛好覆蓋 expected set。legacy normalizer維持原行為。

## Attestation 精確實作

使用純 ASGI middleware，不要在 route 中重新 `json.dumps()`，也不要使用會改變 streaming／body 行為的 `BaseHTTPMiddleware`。

- 僅攔截 `POST /api/consultation/v1/calculate`
- nonce 缺席時：strict endpoint 直接拒絕；legacy endpoint完全不經此 middleware
- 對實際 raw request bytes與即將送出的 final response bytes做 SHA-256
- nonce 必須唯一且符合 `[A-Za-z0-9_-]{22,128}`
- 200、422與應用層錯誤，只要 attestation設定有效都簽實際 status/body
- 設定缺失時回固定 503，且不得執行 calculator
- 移除下游偽造／重複的 attestation headers，再各加入一次

Web 現行 12 個 HMAC 欄位順序不可更動：

```text
version, algorithm, key_id, issued_at, nonce, method, path,
release_id, calculator_code_sha256, request_hash, response_hash, status_code
```

每欄 framing：

```text
<field>=<UTF-8 byte length>:<value>\n
```

Python 對現有 TS fixture 的 request hash、response hash、HMAC 已可重算完全一致；但現在的 test 55 只驗靜態 fixture，尚未執行 Python producer。新 endpoint會改變 signed `path` 值，因此必須新增 Python producer → Node `verifyCalculatorResponseAttestation()` 的真跨語言測試，並同步更新 Web path contract；不可拿舊 `/api/calculate` fixture假裝已驗新路徑。

## Release identity 不得自我證明

目前 Web 要求的 `CALCULATOR_BUNDLE_VERSION` 同時含 app、Fly release number、image digest、Git SHA。Fly runtime 官方只明示提供 `FLY_IMAGE_REF` 與 Machine configuration version，沒有可靠的 runtime image digest／release number；把部署後取得的 digest 再寫進相同 image 也會形成自我參照循環。

所以必須升級 signed release identity schema，不能把任意數字繼續塞進現行 `release=<number>`並稱為 Fly release。建議明確改成：

```text
calculator-bundle/v2|app=<app>|digest=sha256:<image>|git=<40hex>|manifest=sha256:<64hex>
```

Web 的 regex、runtime config parser、fixture與部署 receipt schema必須同版更新。Fly platform release number若仍要保存，只能是部署 orchestrator在外部 receipt記錄的 metadata；除非另有平台 API證據，不進 runtime自簽 identity，也不改稱 manifest序號。

部署流程：

1. 在乾淨且 pin Git SHA 的 build context 生成 deterministic calculator manifest。
2. 把 Git SHA與 manifest hash嵌入 image；secret 絕不可進 build arg/image layer。
3. build/push 一次後，由外部 deploy orchestrator取得 immutable image digest。
4. 建立外部 deployment receipt，綁 `app + image digest + git SHA + calculator manifest hash`。
5. Fly runtime 至少核對 image內嵌 Git/manifest；digest由部署 receipt 與平台外部查詢核對，不得宣稱服務自己證明。
6. Web preview 使用同一 receipt中的 public identity；HMAC secret另由 Fly/Vercel secret store注入。

官方依據：

- <https://fly.io/docs/machines/runtime-environment/>
- <https://fly.io/docs/reference/configuration/>
- <https://fly.io/docs/apps/secrets/>

fortune-research 現有 Dockerfile 為 `COPY . .`，而本機工作樹是 dirty；正式 image 不得由該工作樹建立。`requirements.txt` 使用範圍版本而非完整 lock，Git SHA本身也不足以證明依賴重現性。

## Claude 必做回歸矩陣

### Fly

- strict model逐欄接收與 `extra='forbid'`
- unknown time與明確 12:00不得同結果；held facts不可進結論
- exact/shichen真太陽時邊界
- `bazi_school` 子時換日錨點
- Lahiri/Raman/KP Ayanamsa差異
- DST ambiguous fixture：fold 0/1 UTC相差 3600 秒
- 同 `as_of`、不同 mocked process clock：15 套 canonical response hash相同
- 改 `as_of` 後只允許時間相依部分按規格改變
- 奇門必走 dispatcher並證明 `time_source='birth'`
- 西占真 producer → interpreter regression
- 任一 calculator exception都進 `failed_systems`，不得 HTTP 200 偽成功
- E3實際 legacy payload、endpoint與 golden output改前／改後 byte-equivalent；strict西占修復不得滲入其 pipeline

### 跨語言／Web

- Python產生 fixture，Node真 verifier驗過
- 真 FastAPI TestClient raw bytes由 Node再次驗章
- request/response/status/nonce任何一 byte tamper都拒絕
- 422有有效 attestation且 Web 不重試；408/425/429/5xx依白名單重試
- response `analysis_context` 缺少、birth timezone／reference timezone混用或與 request不同立即停止
- unknown-time held slot先走 status schema；不得被 substantive gate誤判，也不得進 facts／Prompt
- E3 freeze `31/31`、golden `10/10`、serializer與 endpoint snapshot全部維持

### Preview／發布

- Fly canary先證明 legacy/E3 bytes不變，再驗 strict endpoint
- Vercel immutable preview僅開 C/G15 flags
- C、G15 synthetic E2E；不使用真人資料
- desktop/tablet/mobile、light/dark、reduced motion、400% zoom矩陣
- production/main 明確確認後才合併與部署；先 C、再獨立開 G15

## Claude 接手順序

1. 先 claim shared card `jianyuan-c-g15-full-ui-20260809`，確認 integration owner 已轉移。
2. 從遠端 Web 分支最新 commit 開始，不與其他代理共用 branch寫檔。
3. 在 fortune-research另建乾淨 worktree，以 RED tests先重現 FLY-C01～C06。
4. 先修 request/context/Western/strict ledger，再做 attestation與 deployment receipt；不要用 HMAC遮蓋錯誤的計算語意。
5. 跑上述 Fly、跨語言、Web、E3與 preview矩陣。
6. fresh-context Claude／Codex／Gemini找反例，逐項處理後才解除 HOLD。
7. 只有在 main/production授權與當前目標再次核對後，才可 deploy。

## 不得宣稱

- HMAC通過不等於命理學理正確。
- 15 個槽位不等於 15 套成功。
- 同輸入連跑三次相同不等於跨日／跨年可重播。
- request含 `as_of` 不等於 Fly已使用 `as_of`。
- image label／Git SHA不等於完整 runtime artifact attestation。
- 在命理來源 corpus、流派拍板與全部 anchor cases完成前，不得宣稱「所有排盤都符合權威、100%不會錯」。
