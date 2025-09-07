-- AlterTable
ALTER TABLE "public"."Hold" ADD COLUMN     "eligibleTotal" INTEGER,
ADD COLUMN     "total" INTEGER;

-- CreateTable
CREATE TABLE "public"."Receipt" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "receiptNumber" TEXT,
    "total" INTEGER NOT NULL,
    "eligibleTotal" INTEGER NOT NULL,
    "redeemApplied" INTEGER NOT NULL DEFAULT 0,
    "earnApplied" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Receipt_merchantId_createdAt_idx" ON "public"."Receipt"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_merchantId_orderId_key" ON "public"."Receipt"("merchantId", "orderId");

-- AddForeignKey
ALTER TABLE "public"."Receipt" ADD CONSTRAINT "Receipt_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Receipt" ADD CONSTRAINT "Receipt_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
