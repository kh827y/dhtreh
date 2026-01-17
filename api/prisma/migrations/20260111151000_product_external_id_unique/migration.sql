-- Add unique constraint for product external ID per merchant
CREATE UNIQUE INDEX "Product_merchantId_externalId_key" ON "public"."Product"("merchantId", "externalId");
