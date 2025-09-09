-- CreateTable
CREATE TABLE "public"."EarnLot" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "consumedPoints" INTEGER NOT NULL DEFAULT 0,
    "earnedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "orderId" TEXT,
    "receiptId" TEXT,
    "outletId" TEXT,
    "deviceId" TEXT,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarnLot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EarnLot_merchantId_customerId_earnedAt_idx" ON "public"."EarnLot"("merchantId", "customerId", "earnedAt");

-- CreateIndex
CREATE INDEX "EarnLot_merchantId_expiresAt_idx" ON "public"."EarnLot"("merchantId", "expiresAt");
