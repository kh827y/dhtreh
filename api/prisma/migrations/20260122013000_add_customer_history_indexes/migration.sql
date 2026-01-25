-- CreateIndex
CREATE INDEX "Customer_merchantId_createdAt_idx" ON "public"."Customer"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_customerId_createdAt_idx" ON "public"."Transaction"("merchantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Receipt_merchantId_customerId_createdAt_idx" ON "public"."Receipt"("merchantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "PromoCodeUsage_merchantId_customerId_orderId_idx" ON "public"."PromoCodeUsage"("merchantId", "customerId", "orderId");

-- CreateIndex
CREATE INDEX "Review_merchantId_customerId_createdAt_idx" ON "public"."Review"("merchantId", "customerId", "createdAt");
