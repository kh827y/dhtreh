-- Drop indexes on legacy external fields
DROP INDEX IF EXISTS "HoldItem_merchantId_externalProvider_externalId_idx";
DROP INDEX IF EXISTS "ReceiptItem_merchantId_externalProvider_externalId_idx";
DROP INDEX IF EXISTS "TransactionItem_merchantId_externalProvider_externalId_idx";

-- Drop unused fields from items
ALTER TABLE "HoldItem"
  DROP COLUMN IF EXISTS "externalProvider",
  DROP COLUMN IF EXISTS "sku",
  DROP COLUMN IF EXISTS "barcode";

ALTER TABLE "ReceiptItem"
  DROP COLUMN IF EXISTS "externalProvider",
  DROP COLUMN IF EXISTS "sku",
  DROP COLUMN IF EXISTS "barcode";

ALTER TABLE "TransactionItem"
  DROP COLUMN IF EXISTS "externalProvider",
  DROP COLUMN IF EXISTS "sku",
  DROP COLUMN IF EXISTS "barcode";
