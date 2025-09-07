/*
  Warnings:

  - A unique constraint covering the columns `[customerId,merchantId,type]` on the table `Wallet` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `merchantId` to the `Hold` table without a default value. This is not possible if the table is not empty.
  - Added the required column `merchantId` to the `Transaction` table without a default value. This is not possible if the table is not empty.
  - Added the required column `merchantId` to the `Wallet` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."wallet_owner_type_idx";

-- AlterTable
ALTER TABLE "public"."Hold" ADD COLUMN     "merchantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "merchantId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Wallet" ADD COLUMN     "merchantId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "public"."Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MerchantSettings" (
    "merchantId" TEXT NOT NULL,
    "earnBps" INTEGER NOT NULL DEFAULT 500,
    "redeemLimitBps" INTEGER NOT NULL DEFAULT 5000,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantSettings_pkey" PRIMARY KEY ("merchantId")
);

-- CreateIndex
CREATE INDEX "Hold_merchantId_status_idx" ON "public"."Hold"("merchantId", "status");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_createdAt_idx" ON "public"."Transaction"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_customerId_merchantId_type_key" ON "public"."Wallet"("customerId", "merchantId", "type");

-- AddForeignKey
ALTER TABLE "public"."MerchantSettings" ADD CONSTRAINT "MerchantSettings_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Wallet" ADD CONSTRAINT "Wallet_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Hold" ADD CONSTRAINT "Hold_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
