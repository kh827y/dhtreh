-- AlterTable
ALTER TABLE "public"."MerchantSettings" ADD COLUMN     "rulesJson" JSONB;

-- AlterTable
ALTER TABLE "public"."Staff" ADD COLUMN     "apiKeyHash" TEXT;

-- CreateIndex
CREATE INDEX "Staff_merchantId_apiKeyHash_idx" ON "public"."Staff"("merchantId", "apiKeyHash");
