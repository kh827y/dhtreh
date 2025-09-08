-- AlterTable
ALTER TABLE "public"."Device" ADD COLUMN     "bridgeSecret" TEXT;

-- AlterTable
ALTER TABLE "public"."MerchantSettings" ADD COLUMN     "bridgeSecret" TEXT,
ADD COLUMN     "requireBridgeSig" BOOLEAN NOT NULL DEFAULT false;
