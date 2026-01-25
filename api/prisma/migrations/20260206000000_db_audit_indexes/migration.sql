-- CreateIndex
CREATE INDEX "idx_product_category_merchant_deleted" ON "ProductCategory"("merchantId", "deletedAt");

-- CreateIndex
CREATE INDEX "idx_product_merchant_deleted" ON "Product"("merchantId", "deletedAt");

-- CreateIndex
CREATE INDEX "idx_product_merchant_barcode_deleted" ON "Product"("merchantId", "barcode", "deletedAt");

-- CreateIndex
CREATE INDEX "idx_product_merchant_code_deleted" ON "Product"("merchantId", "code", "deletedAt");

-- CreateIndex
CREATE INDEX "idx_device_merchant_outlet_archived" ON "Device"("merchantId", "outletId", "archivedAt");

-- CreateIndex
CREATE INDEX "idx_staff_outlet_access_merchant_staff" ON "StaffOutletAccess"("merchantId", "staffId");

-- CreateIndex
CREATE INDEX "idx_comm_task_status_archived_scheduled" ON "CommunicationTask"("status", "archivedAt", "scheduledAt");

-- CreateIndex
CREATE INDEX "idx_comm_task_status_archived_started" ON "CommunicationTask"("status", "archivedAt", "startedAt");

-- CreateIndex
CREATE INDEX "idx_comm_task_status_archived_failed" ON "CommunicationTask"("status", "archivedAt", "failedAt");

-- CreateIndex
CREATE INDEX "idx_sync_log_merchant_provider_direction_status_created" ON "SyncLog"("merchantId", "provider", "direction", "status", "createdAt");

-- CreateIndex
CREATE INDEX "idx_data_import_job_status_started" ON "DataImportJob"("status", "startedAt");
