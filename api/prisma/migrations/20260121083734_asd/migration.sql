-- CreateIndex
CREATE INDEX "CommunicationTask_merchantId_createdAt_idx" ON "public"."CommunicationTask"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationTaskRecipient_taskId_createdAt_idx" ON "public"."CommunicationTaskRecipient"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "PromotionParticipant_merchantId_customerId_joinedAt_idx" ON "public"."PromotionParticipant"("merchantId", "customerId", "joinedAt");

-- CreateIndex
CREATE INDEX "loyalty_promotions_merchantId_status_createdAt_idx" ON "public"."loyalty_promotions"("merchantId", "status", "createdAt");
