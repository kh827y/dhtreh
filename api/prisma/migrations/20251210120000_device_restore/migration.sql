DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relkind = 'r' AND c.relname = 'Device'
    ) THEN
        CREATE TABLE "Device" (
            "id" TEXT NOT NULL,
            "merchantId" TEXT NOT NULL,
            "outletId" TEXT NOT NULL,
            "code" TEXT NOT NULL,
            "codeNormalized" TEXT NOT NULL,
            "archivedAt" TIMESTAMP(3),
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
        );
    END IF;
END $$;

-- гарантируем наличие новых колонок в Device, если таблица уже существовала
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "merchantId" TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "outletId" TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "codeNormalized" TEXT;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Device" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS "Device_merchantId_codeNormalized_key" ON "Device"("merchantId", "codeNormalized");
CREATE INDEX IF NOT EXISTS "Device_merchantId_outletId_idx" ON "Device"("merchantId", "outletId");
CREATE INDEX IF NOT EXISTS "Device_outletId_archivedAt_idx" ON "Device"("outletId", "archivedAt");

ALTER TABLE "Hold" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE "EarnLot" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;

CREATE INDEX IF NOT EXISTS "Hold_merchantId_deviceId_idx" ON "Hold"("merchantId", "deviceId");
CREATE INDEX IF NOT EXISTS "Receipt_merchantId_deviceId_idx" ON "Receipt"("merchantId", "deviceId");
CREATE INDEX IF NOT EXISTS "Transaction_merchantId_deviceId_idx" ON "Transaction"("merchantId", "deviceId");
CREATE INDEX IF NOT EXISTS "LedgerEntry_merchantId_deviceId_idx" ON "LedgerEntry"("merchantId", "deviceId");
CREATE INDEX IF NOT EXISTS "EarnLot_merchantId_deviceId_idx" ON "EarnLot"("merchantId", "deviceId");

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Device_merchantId_fkey') THEN
        ALTER TABLE "Device" ADD CONSTRAINT "Device_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Device_outletId_fkey') THEN
        ALTER TABLE "Device" ADD CONSTRAINT "Device_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "Outlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Hold_deviceId_fkey') THEN
        ALTER TABLE "Hold" ADD CONSTRAINT "Hold_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Receipt_deviceId_fkey') THEN
        ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_deviceId_fkey') THEN
        ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LedgerEntry_deviceId_fkey') THEN
        ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'EarnLot_deviceId_fkey') THEN
        ALTER TABLE "EarnLot" ADD CONSTRAINT "EarnLot_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
