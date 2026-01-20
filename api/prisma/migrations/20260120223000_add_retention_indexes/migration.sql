-- CreateIndex
CREATE INDEX "AdminAudit_createdAt_idx" ON "public"."AdminAudit"("createdAt");

-- CreateIndex
CREATE INDEX "CommunicationTask_status_createdAt_idx" ON "public"."CommunicationTask"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SyncLog_createdAt_idx" ON "public"."SyncLog"("createdAt");
