-- AlterTable
ALTER TABLE "public"."MerchantSettings" ADD COLUMN     "earnCooldownSec" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "earnDailyCap" INTEGER,
ADD COLUMN     "redeemCooldownSec" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "redeemDailyCap" INTEGER,
ADD COLUMN     "webhookKeyId" TEXT;
