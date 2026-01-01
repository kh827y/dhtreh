ALTER TABLE "MerchantSettings" ALTER COLUMN "qrTtlSec" SET DEFAULT 300;
UPDATE "MerchantSettings" SET "qrTtlSec" = 300 WHERE "qrTtlSec" = 120;
