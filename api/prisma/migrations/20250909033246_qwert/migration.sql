-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "public"."IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_customerId_type_createdAt_idx" ON "public"."Transaction"("merchantId", "customerId", "type", "createdAt");
