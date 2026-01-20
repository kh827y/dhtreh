-- CreateIndex
CREATE INDEX "CommunicationTask_status_scheduledAt_idx" ON "public"."CommunicationTask"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "Hold_status_expiresAt_idx" ON "public"."Hold"("status", "expiresAt");
