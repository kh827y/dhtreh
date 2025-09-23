-- Create MerchantAntifraudSettings table
CREATE TABLE "MerchantAntifraudSettings" (
  "merchantId" TEXT NOT NULL,
  "dailyAccrualLimit" INTEGER,
  "monthlyAccrualLimit" INTEGER,
  "maxPointsPerEarn" INTEGER,
  "notifyEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notifyOutletAdmins" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MerchantAntifraudSettings_pkey" PRIMARY KEY ("merchantId"),
  CONSTRAINT "MerchantAntifraudSettings_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create AntifraudAlert table
CREATE TABLE "AntifraudAlert" (
  "id" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "customerId" TEXT,
  "kind" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'info',
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  CONSTRAINT "AntifraudAlert_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AntifraudAlert_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AntifraudAlert_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AntifraudAlert_merchantId_createdAt_idx" ON "AntifraudAlert" ("merchantId", "createdAt");
CREATE INDEX "AntifraudAlert_customerId_createdAt_idx" ON "AntifraudAlert" ("customerId", "createdAt");

-- Extend transactions with comment and metadata
ALTER TABLE "Transaction" ADD COLUMN "comment" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "metadata" JSONB;
