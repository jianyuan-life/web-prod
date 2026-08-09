# Fly.io 唯讀驗算（2026-08-09）

## 結論

`fortune-reports-api.fly.dev` 目前「會回應」，但還不符合 C／G15 structured v1 可上線條件。本次 live 驗算找到三個硬性 blocker：

1. `/api/calculate` 回應的 **13 個 attestation headers 全數缺少**，release ID 與 calculator code SHA-256 也未回傳。
2. `time_unknown=true` 被 production API 忽略；未知時辰與明確 12:00 的回應逐 byte 相同，並且仍產生完整時柱。
3. API 可以在單一系統「計算異常」時仍回傳 HTTP 200、`systems_count=15`，且不回傳 `partial_failures` / `failed_systems`。

因此，本次不得將「health=ok」、「15 個槽位」或「同輸入穩定」等同於排盤完整正確，也不得開啟 production structured C／G15 flag。

## 授權與邊界

- 使用者授權：Fly.io **唯讀檢查與虛構案例驗算**。
- 本次執行：`status` / `config show` / `releases` / `image show` / `secrets list` / public HTTPS health 與計算請求。
- 本次未執行：deploy、secrets set/unset、scale、restart、machine update、production 資料寫入。
- 沒有使用真實生日。所有姓名與生日均明示為 synthetic。

## OBSERVED：Fly 實際狀態

| 項目 | 實際觀察 |
|---|---|
| App | `fortune-reports-api` |
| Public host | `https://fortune-reports-api.fly.dev` |
| Primary region | `sin` |
| Machine | version `114`，`started` |
| Release 114 | `complete`，2026-06-12T08:59:12Z |
| Image digest | `sha256:2c5fa8e52e4dceea43fc463da954473ef48b70a9dbc4cdf45c4b1322d0ca18d0` |
| Image source label | repo `jianyuan-life/fortune-research`，Git SHA `4f83f1523f13cacb35ae18e00795fee14263d27a` |
| HTTP config | internal port 8080，force HTTPS，auto start/stop，1 shared CPU，1 GB RAM |

Fly image 標籤指向的 Git SHA 實際存在，並被 `origin/main` 包含。所以以下 production 程式碼判讀來自該 commit，不是來自目前有未提交變更的本機工作樹。

### Fly secret 名稱／狀態（未讀取值）

| 名稱 | 狀態 |
|---|---|
| `DEEPSEEK_API_KEY` | Deployed |
| `NEXT_PUBLIC_SITE_URL` | Deployed |
| `SUPABASE_URL` | Deployed |
| `SUPABASE_SERVICE_ROLE_KEY` | Deployed |
| `RESEND_API_KEY` | Deployed |

`fly secrets list` 搜尋範圍內未出現 `CALCULATOR_ATTESTATION_SECRET`、`CALCULATOR_ATTESTATION_KEY_ID`、`CALCULATOR_ATTESTATION_CODE_SHA256` 或 `CALCULATOR_BUNDLE_VERSION`。此為名稱缺席觀察，本次沒有讀取或輸出任何 secret value。

## OBSERVED：live HTTP 驗算

### 1. Health

`GET /health` 回傳：

- HTTP `200`
- `status: "ok"`
- `version: "5.4.0"`
- `systems: 15`

這只證明服務存活且 health payload 宣稱 15 系統，不證明 15 套都成功。

### 2. Synthetic 精確時間案例

輸入：`SYNTHETIC-EXACT-1990-06-15T10:30+08:00`，姓名「虛構案例甲」，台北虛構座標，target year 2026。

| 檢查 | 結果 |
|---|---|
| HTTP | 200 |
| `systems_count` | 15 |
| `analyses.length` | 15 |
| 唯一 system 名 | 15 |
| 缺少／多出 system | 0 / 0 |
| 系統順序 | 與 web `EXPECTED_CALCULATOR_SYSTEMS` 15 套完全一致 |
| Partial failure | **西洋占星**：`detail="計算異常：'planet_name'"`，`sub_summary="計算異常"`，score 0 |
| Top-level failure ledger | `partial_failures` 不存在；`failed_systems` 不存在 |
| Raw response SHA-256 | `dca2aa3b207002510368056b86087097739bfe2a8e84551f979eee8980def9ec` |

重要：「15 個 system 名唯一」這一項通過，但「15 套都成功」不通過。Fly 把異常 placeholder 也計入 `systems_count=15`。

### 3. Synthetic 同輸入穩定性

輸入：`SYNTHETIC-STABILITY-1988-08-08T08:08+08:00`，姓名「虛構案例三次」，香港虛構案例。

- 連續 3 次 HTTP 皆為 200。
- 3 次 raw response SHA-256 皆為 `e32eca0c59e7b12007d1d1fccdd56a24aeca12d78d6699b0b6571a889b556000`。
- 3 次均未命中「計算異常」 placeholder。

本案例的同輸入穩定性為 **3/3 通過**；這不能推導每個日期的學理正確性。

### 4. Synthetic 未知時辰

同一個虛構人物與同一出生日，比較：

- A：`hour=12, minute=0, time_unknown=false, time_mode="exact"`
- B：`hour=12, minute=0, time_unknown=true, time_mode="unknown"`

實際結果：

- A／B 的 raw response SHA-256 完全相同：`f7cd0f0c64855dcc566a81fa324764fbf2ffe77164a5352069c1484c3bcd5798`。
- 15 個 per-system hash 全數相同。
- B 仍回傳 `client_data.birth_date="1990年06月15日 12:00"`。
- B 仍回傳完整四柱 `庚午 壬午 辛亥 甲午`。
- B 回應中沒有 `time_unknown`、「時辰不確定」、「時柱未知」或「時辰未知」標記。

未知時辰路徑為 **FAIL**。

### 5. Structured v1 attestation

Web 目前 `lib/consultation/calculator-attestation.ts` 要求 13 個 headers：

`Version`、`Algorithm`、`Key-Id`、`Issued-At`、`Nonce`、`Method`、`Path`、`Release-Id`、`Calculator-Code-SHA256`、`Request-SHA256`、`Response-SHA256`、`Status`、`Signature`。

實際以 `X-Jianyuan-Attestation-Nonce` 發送 `/api/calculate` 後：

- attestation headers present：**0 / 13**
- `X-Jianyuan-Attestation-Release-Id`：缺少
- `X-Jianyuan-Calculator-Code-SHA256`：缺少
- signature，request hash，response hash：全部缺少

Attestation 路徑為 **FAIL**。

## OBSERVED：production commit 代碼對照

以 Fly image label 的 `4f83f152...` 直接讀取 Git object：

- `api_server/api_server.py:115-123`：`BirthRequest` 使用 `model_config = {'extra': 'ignore'}`，但沒有 `time_unknown` / `time_mode` 欄位。
- `api_server/api_server.py:305-318`：`_to_birth_input()` 沒有把 `time_unknown` / `time_mode` 傳給 `BirthInput`。
- `api_server/api_server.py:559-581`：`/api/calculate` 只回傳 `client_data`、`analyses`、`systems_count`。
- `api_server/calculators/report_generator.py:119-137`：個別系統例外會被包成 score 0 的「計算異常」 analysis，然後繼續回傳整體結果。
- 在該 production commit 的 `api_server/**` 內搜尋 `attestation|X-Jianyuan|CALCULATOR_ATTESTATION|RELEASE_ID|CODE_SHA`：**0 命中**。

Live 行為與 production commit 代碼相互印證。

## INFERRED

1. 目前 web `callPythonCalculateAttested()` 必會在第一個缺少的 attestation header 處 fail closed，因此 structured C／G15 不可能在現有 Fly 回應上完成。
2. 未知時辰失效的直接機制是 Pydantic `extra='ignore'` 丟掉了未宣告欄位，而 `_to_birth_input()` 也沒有傳入時間精度語意。
3. `systems_count=15` 是槽位數，不是成功數；它會把 exception placeholder 也計數。
4. Fly 的 image digest 與 Git SHA label 提供了部署來源線索，但不能取代請求級 nonce／body hash／HMAC attestation。

## UNVERIFIED

- 本次沒有宣稱 15 套命理內容均符合各派權威。HTTP schema、唯一名稱與穩定 hash 無法證明學理正確。
- 未驗算所有出生年月日、時區、DST、閣秒、曆法邊界與所有流派。
- 未使用何宣逸、何紀萳、何宥諴的真實生日；本次僅使用明示 synthetic 資料。
- 未執行付款、Supabase 寫入、真報告產生或 email；這些不屬於 Fly 唯讀授權。
- 未驗證 C 50k／G15 100k 客戶可見報告已 live；現有 attestation blocker 反而證明不可如此宣稱。

## 交給 Claude 的最小修復與回歸清單

1. 在 `fortune-research` 獨立 branch/worktree 實作與 web 完全相同的 13-header HMAC-SHA256 attestation；不得硬編 secret。
2. `BirthRequest` 明確宣告並驗證 `time_unknown` / `time_mode`，`_to_birth_input()` 必須原樣傳入；未知時辰不得產生假的 12:00 時柱。
3. Structured 請求發生任一個系統異常時 fail closed，或至少回傳可機器判定的 `partial_failures` / `failed_systems`；不得以 200 + 15 個 placeholder 槽位冒充完整。
   Web 現有 `legacy-calculator-safety.ts` 也要補上 `detail` / `sub_summary` 的「計算異常」偵測；本次 live placeholder 沒有 `error` 欄位，`success` 也不是 `false`，只檢查這兩欄會漏接。
4. 建立 `1990-06-15 10:30 Asia/Taipei` 的西洋占星 regression，先重現並修正 `'planet_name'` 介面錯誤。
5. 回歸必須同時包含：已知時辰、未知時辰、15 唯一且無 placeholder、nonce mismatch、body tamper、過期 issued-at、wrong key/release/code hash。
6. 修復 Fly 後再設定 Vercel 與 Fly 兩端對應的 receipt/secret，用 preview 做 C／G15 虛構案例 E2E；E3 依凍結契約回歸，最後才能開 production flag。

## 可重跑命令（唯讀）

```powershell
flyctl auth whoami
flyctl status -a fortune-reports-api
flyctl config show -a fortune-reports-api
flyctl releases -a fortune-reports-api --json
flyctl image show -a fortune-reports-api --json
flyctl secrets list -a fortune-reports-api

node -e "fetch('https://fortune-reports-api.fly.dev/health').then(async r=>console.log(r.status,await r.json()))"

$repo = 'D:\Users\Desktop\Claude專案\Claude-鑑源\Claude-鑑源命理研究部門'
$sha = '4f83f1523f13cacb35ae18e00795fee14263d27a'
git -C $repo show -s --format='%H %cd %s' --date=iso-strict $sha
git -C $repo grep -n -E "attestation|X-Jianyuan|CALCULATOR_ATTESTATION|RELEASE_ID|CODE_SHA" $sha -- api_server
git -C $repo grep -n -E "class BirthRequest|extra.*ignore|time_unknown|time_mode|def _to_birth_input|def calculate|systems_count|個別系統失敗" $sha -- api_server/api_server.py api_server/calculators/report_generator.py
```

Live 計算重跑時，請以上述 synthetic payload POST 到 `https://fortune-reports-api.fly.dev/api/calculate`，同時每次產生新的 24-byte base64url nonce 放入 `X-Jianyuan-Attestation-Nonce`；只輸出 status、system 名、error placeholder、response SHA-256 與 attestation header presence，不要將完整 65KB 回應或任何 secret 印到終端。
