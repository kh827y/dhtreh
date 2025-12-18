-- CreateTable
CREATE TABLE "public"."CashierActivationCode" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenHint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "usedByDeviceSessionId" TEXT,
    "metadata" JSONB,

    CONSTRAINT "CashierActivationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CashierDeviceSession" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "activationCodeId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,

    CONSTRAINT "CashierDeviceSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashierActivationCode_tokenHash_key" ON "public"."CashierActivationCode"("tokenHash");

-- CreateIndex
CREATE INDEX "CashierActivationCode_merchantId_createdAt_idx" ON "public"."CashierActivationCode"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "CashierActivationCode_merchantId_expiresAt_idx" ON "public"."CashierActivationCode"("merchantId", "expiresAt");

-- CreateIndex
CREATE INDEX "CashierActivationCode_merchantId_usedAt_idx" ON "public"."CashierActivationCode"("merchantId", "usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CashierDeviceSession_tokenHash_key" ON "public"."CashierDeviceSession"("tokenHash");

-- CreateIndex
CREATE INDEX "CashierDeviceSession_merchantId_createdAt_idx" ON "public"."CashierDeviceSession"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "CashierDeviceSession_merchantId_expiresAt_idx" ON "public"."CashierDeviceSession"("merchantId", "expiresAt");

-- AddForeignKey
ALTER TABLE "public"."CashierActivationCode" ADD CONSTRAINT "CashierActivationCode_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashierDeviceSession" ADD CONSTRAINT "CashierDeviceSession_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CashierDeviceSession" ADD CONSTRAINT "CashierDeviceSession_activationCodeId_fkey" FOREIGN KEY ("activationCodeId") REFERENCES "public"."CashierActivationCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

