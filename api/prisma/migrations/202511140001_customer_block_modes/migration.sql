-- Add redemptionsBlocked flag to MerchantCustomer to distinguish списания
ALTER TABLE "MerchantCustomer"
ADD COLUMN IF NOT EXISTS "redemptionsBlocked" BOOLEAN NOT NULL DEFAULT false;
