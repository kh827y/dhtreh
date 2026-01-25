-- CreateIndex
CREATE INDEX "Transaction_merchantId_type_createdAt_idx" ON "public"."Transaction"("merchantId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "DataImportJob_status_type_createdAt_idx" ON "public"."DataImportJob"("status", "type", "createdAt");
