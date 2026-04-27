# point_transactions.type 欄位 audit(v5.4.10、2026-04-27)

## 結論
**不需 migration**。`type` 欄位是 `TEXT NOT NULL`、**無 CHECK constraint**、無 ENUM。
任何字串都可 insert、包括新增的 `admin_deduct`。

## 證據
`supabase/migrations/create_referral_system.sql` line 44-54:
```sql
CREATE TABLE IF NOT EXISTS point_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type TEXT NOT NULL, -- earn_referral / earn_welcome / use_checkout / expire / admin_adjust
  amount INTEGER NOT NULL,
  ...
);
```
`type TEXT NOT NULL` — 純文字欄位、無 CHECK / 無 ENUM。

## 修正紀錄(v5.4.8 commit 8205134)
原 v5.4.8 grant-points API 加 try/except fallback:
```typescript
if (txErr.message.includes('check') || txErr.message.includes('enum') || txErr.message.includes('constraint')) {
  // fallback 用 admin_grant + description '[扣點]' 前綴
  ...
}
```
這段 fallback **永遠不會 trigger**(因為 schema 無 constraint)、屬 dead code。

## 行動(v5.4.10)
- ✅ 確認 schema 無 constraint(本文件)
- ✅ 簡化 v5.4.8 的 fallback(下個 commit 移除 dead code)
- ✅ 列出當前實際使用的 type 值供未來參考

## 當前實際使用的 type 值(grep 全 repo)
| type 值 | 來源 | 用途 |
|:---|:---|:---|
| `earn_referral` | webhook/stripe + admin_dashboard_rpc | 推薦獎勵 |
| `earn_welcome` | referral/register | 註冊送點 |
| `use_checkout` | checkout 折抵 | 結帳扣點 |
| `expire` | cron/expire-points | 過期 |
| `admin_grant` | admin/grant-points(本 v5.4.8 加) | 管理員手動發 |
| `admin_deduct` | admin/grant-points(本 v5.4.8 加) | 管理員手動扣 |
| `admin_adjust` | (註解保留、未實際用) | 早期管理員調整 |
| `transfer_in` / `transfer_out` | points/transfer | 積分贈與 |

## 未來建議(P3 backlog)
若要強化資料完整性、可加 CHECK constraint:
```sql
ALTER TABLE point_transactions
  ADD CONSTRAINT point_transactions_type_check
  CHECK (type IN (
    'earn_referral', 'earn_welcome', 'use_checkout', 'expire',
    'admin_grant', 'admin_deduct', 'admin_adjust',
    'transfer_in', 'transfer_out'
  ));
```
但加了之後改 type 必同步 migration、營運靈活度降低、暫不加。
