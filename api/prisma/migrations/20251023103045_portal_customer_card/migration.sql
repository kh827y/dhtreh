-- Extend merchant customer profile with comment and accrual blocking flag
ALTER TABLE "MerchantCustomer"
    ADD COLUMN "comment" TEXT,
    ADD COLUMN "accrualsBlocked" BOOLEAN NOT NULL DEFAULT false;

