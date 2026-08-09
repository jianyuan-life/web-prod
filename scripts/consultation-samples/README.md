# C／G15 授權樣本重放工具

這個工具只做兩件事：以固定日期向公開的 Fly calculator API 讀取三位已授權樣本的排盤結果，以及把輸入、回應與四個後續報告工作包綁上 SHA-256 後存到 Git repository 以外的私人目錄。

它不會執行 Claude、Gemini 或其他付費模型。`--run-llm`、`--paid` 與 `--generate-report` 都會直接拒絕。四個輸出是三份 C 與一份 G15 的重放工作包，不是已完成、可對外寄送的報告。

固定條件：

- 截止日：2026-08-08
- 目標年度：2026
- 方案：只允許 C、G15
- 人物：何宣逸、何紀萳、何宥諄
- G15：只記錄三位成員，不推定親屬稱謂、性別角色、排行或權力關係
- 網路：只允許 `https://fortune-reports-api.fly.dev/api/calculate`，不附加 API key 或授權標頭

先預覽，不連網也不寫檔：

```powershell
node scripts/consultation-samples/run.mjs --dry-run
```

執行三次只讀 calculator 呼叫並建立私人工作包：

```powershell
node scripts/consultation-samples/run.mjs --execute
```

預設路徑位於目前 Windows 使用者的 `%LOCALAPPDATA%\Jianyuan\private\consultation-samples\2026-08-08-authorized`。若指定 `--output`，路徑仍不得位於本 Git repository 內。Windows 執行時會移除繼承權限，只保留目前帳戶、Administrators 與 SYSTEM；若無法完成 ACL 收斂，工具會在寫入出生資料前停止。

中斷後只重用已完成且 hash 全部一致的結果：

```powershell
node scripts/consultation-samples/run.mjs --execute --resume
```

`--resume` 不會修補、覆寫或重新抓取被竄改的檔案；任何 hash 或引用失配都會停止。獨立檢查：

```powershell
node scripts/consultation-samples/run.mjs --verify <private-directory>
```

終端只輸出模式、日期、件數與路徑，不輸出 calculator 回應內容。私人目錄中的 `manifest.json`、每人的 request/response 與四個 report job 彼此以 SHA-256 綁定；`manifest.sha256` 再綁定整份 manifest。
