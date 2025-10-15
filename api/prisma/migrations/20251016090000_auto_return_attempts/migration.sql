-- CreateTable
CREATE TABLE "public"."AutoReturnAttempt" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "lastPurchaseAt" TIMESTAMP(3) NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "giftPoints" INTEGER NOT NULL DEFAULT 0,
    "giftExpiresAt" TIMESTAMP(3),
    "giftTransactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastError" TEXT,
    "repeatAfterDays" INTEGER,
    "completedAt" TIMESTAMP(3),
    "completionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoReturnAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutoReturnAttempt_merchantId_customerId_attemptNumber_key" ON "public"."AutoReturnAttempt"("merchantId", "customerId", "attemptNumber");

-- CreateIndex
CREATE INDEX "AutoReturnAttempt_merchantId_customerId_idx" ON "public"."AutoReturnAttempt"("merchantId", "customerId");

-- CreateIndex
CREATE INDEX "AutoReturnAttempt_merchantId_status_idx" ON "public"."AutoReturnAttempt"("merchantId", "status");

-- CreateIndex
CREATE INDEX "AutoReturnAttempt_merchantId_invitedAt_idx" ON "public"."AutoReturnAttempt"("merchantId", "invitedAt");

-- AddForeignKey
ALTER TABLE "public"."AutoReturnAttempt" ADD CONSTRAINT "AutoReturnAttempt_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AutoReturnAttempt" ADD CONSTRAINT "AutoReturnAttempt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
