#!/bin/bash
# ============================================================
# 3 客戶 C 方案重生（v5.3.0 起承轉合 15 章新 prompt）
# ============================================================
set -e
cd "D:/Users/Desktop/Claude專案/Claude-鑑源/Claude-鑑源網頁製作部門"
set -a; source .env.local; set +a

ADMIN_KEY="${ADMIN_KEY}"
SITE_URL="https://jianyuan.life"

# 3 位客戶的 report ID（最新的 C 方案）
REPORTS=(
  "644b4c09-c545-41e5-ac25-23ba2e45faa0|何宣逸"
  "45ae2b9b-9709-42ae-8d17-c0cf6c10c01f|何宥諄"
  "29bff605-43f2-4b9a-a7fd-1e614dfb4de3|何紀萳"
)

echo "=== 3 客戶 C 方案重生（v5.3.0 起承轉合 15 章）==="
echo

for item in "${REPORTS[@]}"; do
  REPORT_ID="${item%%|*}"
  NAME="${item##*|}"
  echo "[$NAME] $REPORT_ID"

  # 呼叫 admin recalculate API
  RESP=$(curl -s -X POST "$SITE_URL/api/admin/recalculate-report" \
    -H "Content-Type: application/json" \
    -H "x-admin-key: $ADMIN_KEY" \
    -d "{\"reportId\":\"$REPORT_ID\"}" 2>&1)
  echo "  Response: $RESP"
  echo
  sleep 2
done

echo "=== 3 份報告已觸發重新生成，等待 Workflow 執行 (~3-5 分鐘/份) ==="
