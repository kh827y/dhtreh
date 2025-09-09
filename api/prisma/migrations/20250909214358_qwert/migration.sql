-- CreateEnum
CREATE TYPE "public"."LedgerAccount" AS ENUM ('CUSTOMER_BALANCE', 'MERCHANT_LIABILITY', 'RESERVED');

-- CreateTable
CREATE TABLE "public"."LedgerEntry" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT,
    "debit" "public"."LedgerAccount" NOT NULL,
    "credit" "public"."LedgerAccount" NOT NULL,
    "amount" INTEGER NOT NULL,
    "orderId" TEXT,
    "receiptId" TEXT,
    "outletId" TEXT,
    "deviceId" TEXT,
    "staffId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LedgerEntry_merchantId_createdAt_idx" ON "public"."LedgerEntry"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_merchantId_customerId_createdAt_idx" ON "public"."LedgerEntry"("merchantId", "customerId", "createdAt");
