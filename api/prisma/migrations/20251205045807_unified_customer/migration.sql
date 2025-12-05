/*
  Warnings:

  - You are about to drop the column `merchantCustomerId` on the `CommunicationTaskRecipient` table. All the data in the column will be lost.
  - You are about to drop the column `merchantCustomerId` on the `CustomerTelegram` table. All the data in the column will be lost.
  - You are about to drop the column `merchantCustomerId` on the `LoyaltyRealtimeEvent` table. All the data in the column will be lost.
  - You are about to drop the `MerchantCustomer` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[merchantId,externalId]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[merchantId,tgId]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[merchantId,phone]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[merchantId,email]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `merchantId` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Customer` table without a default value. This is not possible if the table is not empty.
  - Added the required column `customerId` to the `CustomerTelegram` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "public"."CommunicationTaskRecipient" DROP CONSTRAINT "CommunicationTaskRecipient_merchantCustomerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CustomerTelegram" DROP CONSTRAINT "CustomerTelegram_merchantCustomerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."MerchantCustomer" DROP CONSTRAINT "MerchantCustomer_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."MerchantCustomer" DROP CONSTRAINT "MerchantCustomer_merchantId_fkey";

-- DropIndex
DROP INDEX "public"."CommunicationTaskRecipient_merchantCustomerId_idx";

-- DropIndex
DROP INDEX "public"."CustomerTelegram_merchantCustomerId_key";

-- DropIndex
DROP INDEX "public"."LoyaltyRealtimeEvent_merchantId_merchantCustomerId_delivere_idx";

-- AlterTable
ALTER TABLE "public"."CommunicationTaskRecipient" DROP COLUMN "merchantCustomerId";

-- AlterTable
ALTER TABLE "public"."Customer" ADD COLUMN     "accrualsBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "comment" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "merchantId" TEXT NOT NULL,
ADD COLUMN     "profileBirthDate" TIMESTAMP(3),
ADD COLUMN     "profileCompletedAt" TIMESTAMP(3),
ADD COLUMN     "profileGender" TEXT,
ADD COLUMN     "redemptionsBlocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."CustomerTelegram" DROP COLUMN "merchantCustomerId",
ADD COLUMN     "customerId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."LoyaltyRealtimeEvent" DROP COLUMN "merchantCustomerId";

-- DropTable
DROP TABLE "public"."MerchantCustomer";

-- CreateIndex
CREATE INDEX "Customer_merchantId_idx" ON "public"."Customer"("merchantId");

-- CreateIndex
CREATE INDEX "Customer_tgId_idx" ON "public"."Customer"("tgId");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "public"."Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_merchantId_externalId_key" ON "public"."Customer"("merchantId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_merchantId_tgId_key" ON "public"."Customer"("merchantId", "tgId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_merchantId_phone_key" ON "public"."Customer"("merchantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_merchantId_email_key" ON "public"."Customer"("merchantId", "email");

-- CreateIndex
CREATE INDEX "CustomerTelegram_customerId_idx" ON "public"."CustomerTelegram"("customerId");

-- AddForeignKey
ALTER TABLE "public"."Customer" ADD CONSTRAINT "Customer_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerTelegram" ADD CONSTRAINT "CustomerTelegram_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
