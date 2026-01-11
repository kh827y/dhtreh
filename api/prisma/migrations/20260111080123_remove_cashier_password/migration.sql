-- Remove legacy cashier password fields
ALTER TABLE "Merchant" DROP COLUMN IF EXISTS "cashierPassword9";
ALTER TABLE "Merchant" DROP COLUMN IF EXISTS "cashierPasswordUpdatedAt";
