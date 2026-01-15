-- Add device binding to cashier sessions
ALTER TABLE "public"."CashierSession" ADD COLUMN "deviceSessionId" TEXT;

-- Add per-device PIN retry tracking
ALTER TABLE "public"."CashierDeviceSession" ADD COLUMN "pinFailedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."CashierDeviceSession" ADD COLUMN "pinFailedAt" TIMESTAMP(3);
ALTER TABLE "public"."CashierDeviceSession" ADD COLUMN "pinLockedUntil" TIMESTAMP(3);

-- Index and FK for device binding
CREATE INDEX "CashierSession_deviceSessionId_idx" ON "public"."CashierSession"("deviceSessionId");
ALTER TABLE "public"."CashierSession" ADD CONSTRAINT "CashierSession_deviceSessionId_fkey" FOREIGN KEY ("deviceSessionId") REFERENCES "public"."CashierDeviceSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
