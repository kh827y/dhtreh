-- CreateIndex
CREATE INDEX "Transaction_merchantId_orderId_idx" ON "public"."Transaction"("merchantId", "orderId");

-- CreateIndex
CREATE INDEX "Receipt_merchantId_receiptNumber_idx" ON "public"."Receipt"("merchantId", "receiptNumber");

-- CreateIndex
CREATE INDEX "Review_merchantId_orderId_idx" ON "public"."Review"("merchantId", "orderId");
