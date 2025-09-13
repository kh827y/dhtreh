/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `CustomerConsent` table. All the data in the column will be lost.
  - You are about to drop the column `address` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `apiKey` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `description` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `email` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `phone` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `webhookUrl` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `website` on the `Merchant` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `MerchantStats` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `MerchantStats` table. All the data in the column will be lost.
  - You are about to drop the column `externalId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `PushDevice` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ReferralProgram` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `ReviewResponse` table. All the data in the column will be lost.
  - You are about to drop the column `addedAt` on the `SegmentCustomer` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[customerId,merchantId]` on the table `PersonalReferralCode` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[token]` on the table `PushDevice` will be added. If there are existing duplicate values, this will fail.
  - Made the column `grantedAt` on table `CustomerConsent` required. This step will fail if there are existing NULL values in that column.
  - Made the column `subscriptionId` on table `Payment` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `merchantId` to the `PersonalReferralCode` table without a default value. This is not possible if the table is not empty.
  - Made the column `amount` on table `VoucherUsage` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "public"."Campaign" DROP CONSTRAINT "Campaign_targetSegmentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CustomerConsent" DROP CONSTRAINT "CustomerConsent_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CustomerConsent" DROP CONSTRAINT "CustomerConsent_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."EmailNotification" DROP CONSTRAINT "EmailNotification_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."EmailNotification" DROP CONSTRAINT "EmailNotification_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."MerchantStats" DROP CONSTRAINT "MerchantStats_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."OtpCode" DROP CONSTRAINT "OtpCode_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_subscriptionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PersonalReferralCode" DROP CONSTRAINT "PersonalReferralCode_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PersonalReferralCode" DROP CONSTRAINT "PersonalReferralCode_programId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PushDevice" DROP CONSTRAINT "PushDevice_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PushNotification" DROP CONSTRAINT "PushNotification_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PushNotification" DROP CONSTRAINT "PushNotification_deviceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PushNotification" DROP CONSTRAINT "PushNotification_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ReviewResponse" DROP CONSTRAINT "ReviewResponse_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SmsNotification" DROP CONSTRAINT "SmsNotification_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."SmsNotification" DROP CONSTRAINT "SmsNotification_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."VoucherUsage" DROP CONSTRAINT "VoucherUsage_codeId_fkey";

-- DropIndex
DROP INDEX "public"."Merchant_apiKey_key";

-- DropIndex
DROP INDEX "public"."PersonalReferralCode_customerId_programId_key";

-- AlterTable
ALTER TABLE "public"."CampaignUsage" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "merchantId" TEXT;

-- AlterTable
ALTER TABLE "public"."Customer" DROP COLUMN "updatedAt";

-- AlterTable
ALTER TABLE "public"."CustomerConsent" DROP COLUMN "updatedAt",
ALTER COLUMN "grantedAt" SET NOT NULL,
ALTER COLUMN "grantedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."CustomerSegment" ALTER COLUMN "type" SET DEFAULT 'DYNAMIC';

-- AlterTable
ALTER TABLE "public"."EmailNotification" ADD COLUMN     "sentAt" TIMESTAMP(3),
ADD COLUMN     "variables" JSONB,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "public"."Merchant" DROP COLUMN "address",
DROP COLUMN "apiKey",
DROP COLUMN "category",
DROP COLUMN "description",
DROP COLUMN "email",
DROP COLUMN "metadata",
DROP COLUMN "phone",
DROP COLUMN "updatedAt",
DROP COLUMN "webhookUrl",
DROP COLUMN "website",
ADD COLUMN     "telegramBotEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "telegramBotToken" TEXT,
ADD COLUMN     "telegramWebhookSecret" TEXT,
ALTER COLUMN "rating" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."MerchantStats" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ADD COLUMN     "emailSent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."OtpCode" ALTER COLUMN "type" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."Payment" DROP COLUMN "externalId",
DROP COLUMN "updatedAt",
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "invoiceId" TEXT,
ADD COLUMN     "receiptUrl" TEXT,
ALTER COLUMN "merchantId" DROP NOT NULL,
ALTER COLUMN "subscriptionId" SET NOT NULL,
ALTER COLUMN "provider" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."PersonalReferralCode" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "merchantId" TEXT NOT NULL,
ALTER COLUMN "programId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."PushDevice" DROP COLUMN "updatedAt",
ADD COLUMN     "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "merchantId" DROP NOT NULL,
ALTER COLUMN "deviceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."PushNotification" ADD COLUMN     "deviceToken" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ALTER COLUMN "type" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "public"."Referral" ALTER COLUMN "expiresAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."ReferralProgram" DROP COLUMN "updatedAt",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "validUntil" TIMESTAMP(3),
ALTER COLUMN "maxReferrals" DROP NOT NULL,
ALTER COLUMN "maxReferrals" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."Review" ADD COLUMN     "moderatedBy" TEXT,
ADD COLUMN     "rewardPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."ReviewResponse" DROP COLUMN "updatedAt",
ALTER COLUMN "merchantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."SegmentCustomer" DROP COLUMN "addedAt",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."SmsNotification" ADD COLUMN     "provider" TEXT,
ADD COLUMN     "sentAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'PENDING',
ALTER COLUMN "cost" SET DEFAULT 0,
ALTER COLUMN "parts" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "public"."Voucher" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxUses" INTEGER,
ADD COLUMN     "minPurchase" INTEGER,
ADD COLUMN     "usedCount" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "validFrom" DROP NOT NULL,
ALTER COLUMN "validFrom" DROP DEFAULT,
ALTER COLUMN "minPurchaseAmount" DROP NOT NULL,
ALTER COLUMN "minPurchaseAmount" DROP DEFAULT,
ALTER COLUMN "maxUsesPerCustomer" DROP NOT NULL,
ALTER COLUMN "maxUsesPerCustomer" DROP DEFAULT,
ALTER COLUMN "maxTotalUses" DROP NOT NULL,
ALTER COLUMN "maxTotalUses" DROP DEFAULT;

-- AlterTable
ALTER TABLE "public"."VoucherCode" ADD COLUMN     "maxUses" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "usedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "validFrom" TIMESTAMP(3),
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."VoucherUsage" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "orderId" TEXT,
ALTER COLUMN "codeId" DROP NOT NULL,
ALTER COLUMN "amount" SET NOT NULL;

-- CreateIndex
CREATE INDEX "AdminAudit_merchantId_createdAt_idx" ON "public"."AdminAudit"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "CampaignUsage_campaignId_idx" ON "public"."CampaignUsage"("campaignId");

-- CreateIndex
CREATE INDEX "CampaignUsage_customerId_idx" ON "public"."CampaignUsage"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_email_key" ON "public"."Customer"("email");

-- CreateIndex
CREATE INDEX "OtpCode_phone_idx" ON "public"."OtpCode"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalReferralCode_customerId_merchantId_key" ON "public"."PersonalReferralCode"("customerId", "merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_token_key" ON "public"."PushDevice"("token");

-- CreateIndex
CREATE INDEX "PushDevice_customerId_idx" ON "public"."PushDevice"("customerId");

-- AddForeignKey
ALTER TABLE "public"."CampaignUsage" ADD CONSTRAINT "CampaignUsage_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PersonalReferralCode" ADD CONSTRAINT "PersonalReferralCode_programId_fkey" FOREIGN KEY ("programId") REFERENCES "public"."ReferralProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."VoucherUsage" ADD CONSTRAINT "VoucherUsage_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "public"."VoucherCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
