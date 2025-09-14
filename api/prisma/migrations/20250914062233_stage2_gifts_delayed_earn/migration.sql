-- AlterTable
ALTER TABLE "public"."EarnLot" ADD COLUMN     "maturesAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "public"."MerchantSettings" ADD COLUMN     "earnDelayDays" INTEGER;

-- CreateTable
CREATE TABLE "public"."Gift" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "costPoints" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "perCustomerLimit" INTEGER,
    "inventory" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GiftRedemption" (
    "id" TEXT NOT NULL,
    "giftId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REDEEMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "GiftRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gift_merchantId_active_idx" ON "public"."Gift"("merchantId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "GiftRedemption_code_key" ON "public"."GiftRedemption"("code");

-- CreateIndex
CREATE INDEX "GiftRedemption_merchantId_customerId_createdAt_idx" ON "public"."GiftRedemption"("merchantId", "customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."Gift" ADD CONSTRAINT "Gift_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GiftRedemption" ADD CONSTRAINT "GiftRedemption_giftId_fkey" FOREIGN KEY ("giftId") REFERENCES "public"."Gift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GiftRedemption" ADD CONSTRAINT "GiftRedemption_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GiftRedemption" ADD CONSTRAINT "GiftRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
