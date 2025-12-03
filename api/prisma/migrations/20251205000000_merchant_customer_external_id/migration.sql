-- AlterTable
ALTER TABLE "public"."MerchantCustomer" ADD COLUMN     "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "MerchantCustomer_merchantId_externalId_key" ON "public"."MerchantCustomer"("merchantId", "externalId");
