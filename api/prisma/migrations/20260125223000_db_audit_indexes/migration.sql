-- DropIndex
DROP INDEX IF EXISTS "EventOutbox_status_nextRetryAt_idx";

-- CreateIndex
CREATE INDEX "Hold_merchantId_orderId_idx" ON "public"."Hold"("merchantId", "orderId");

-- CreateIndex
CREATE INDEX "Receipt_merchantId_outletId_createdAt_idx" ON "public"."Receipt"("merchantId", "outletId", "createdAt");

-- CreateIndex
CREATE INDEX "Receipt_merchantId_staffId_createdAt_idx" ON "public"."Receipt"("merchantId", "staffId", "createdAt");

-- CreateIndex
CREATE INDEX "Receipt_merchantId_deviceId_createdAt_idx" ON "public"."Receipt"("merchantId", "deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_outletId_createdAt_idx" ON "public"."Transaction"("merchantId", "outletId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_staffId_createdAt_idx" ON "public"."Transaction"("merchantId", "staffId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_deviceId_createdAt_idx" ON "public"."Transaction"("merchantId", "deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "EventOutbox_status_nextRetryAt_createdAt_idx" ON "public"."EventOutbox"("status", "nextRetryAt", "createdAt");

-- CreateIndex
CREATE INDEX "EventOutbox_status_updatedAt_idx" ON "public"."EventOutbox"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "EventOutbox_merchantId_status_createdAt_idx" ON "public"."EventOutbox"("merchantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "SegmentCustomer_customerId_idx" ON "public"."SegmentCustomer"("customerId");

-- CreateIndex
CREATE INDEX "PushDevice_merchantId_isActive_idx" ON "public"."PushDevice"("merchantId", "isActive");

-- CreateIndex
CREATE INDEX "PushDevice_outletId_idx" ON "public"."PushDevice"("outletId");

-- CreateIndex
CREATE INDEX "PushNotification_merchantId_createdAt_idx" ON "public"."PushNotification"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "PushNotification_merchantId_status_createdAt_idx" ON "public"."PushNotification"("merchantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CommunicationTask_status_channel_scheduledAt_createdAt_idx" ON "public"."CommunicationTask"("status", "channel", "scheduledAt", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerConsent_merchantId_channel_status_idx" ON "public"."CustomerConsent"("merchantId", "channel", "status");
