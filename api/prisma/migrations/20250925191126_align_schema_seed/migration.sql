/*
  Warnings:

  - A unique constraint covering the columns `[merchantId,externalId]` on the table `Outlet` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Outlet` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "public"."CustomerSegment_merchantId_active_idx";

-- AlterTable
ALTER TABLE "public"."Campaign" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."MerchantSettings" ADD COLUMN     "staffMotivationCustomDays" INTEGER,
ADD COLUMN     "staffMotivationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "staffMotivationExistingCustomerPoints" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "staffMotivationLeaderboardPeriod" TEXT,
ADD COLUMN     "staffMotivationNewCustomerPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "public"."Outlet" ADD COLUMN     "adminEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "description" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DECIMAL(10,7),
ADD COLUMN     "longitude" DECIMAL(10,7),
ADD COLUMN     "manualLocation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "scheduleEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduleJson" JSONB,
ADD COLUMN     "scheduleMode" TEXT NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "timezone" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."ProductStock" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'RUB';

-- AlterTable
ALTER TABLE "public"."StaffOutletAccess" ADD COLUMN     "pinUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."PushCampaign" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TelegramCampaign" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "audienceId" TEXT,
    "audienceName" TEXT,
    "text" TEXT NOT NULL,
    "imageUrl" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushCampaign_merchantId_status_idx" ON "public"."PushCampaign"("merchantId", "status");

-- CreateIndex
CREATE INDEX "PushCampaign_merchantId_scheduledAt_idx" ON "public"."PushCampaign"("merchantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "TelegramCampaign_merchantId_status_idx" ON "public"."TelegramCampaign"("merchantId", "status");

-- CreateIndex
CREATE INDEX "TelegramCampaign_merchantId_scheduledAt_idx" ON "public"."TelegramCampaign"("merchantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Campaign_merchantId_status_idx" ON "public"."Campaign"("merchantId", "status");

-- CreateIndex
CREATE INDEX "Campaign_merchantId_archivedAt_idx" ON "public"."Campaign"("merchantId", "archivedAt");

-- CreateIndex
CREATE INDEX "Outlet_merchantId_status_idx" ON "public"."Outlet"("merchantId", "status");

-- CreateIndex
CREATE INDEX "Outlet_merchantId_hidden_idx" ON "public"."Outlet"("merchantId", "hidden");

-- CreateIndex
CREATE UNIQUE INDEX "Outlet_merchantId_externalId_key" ON "public"."Outlet"("merchantId", "externalId");

-- CreateIndex
CREATE INDEX "ProductStock_productId_idx" ON "public"."ProductStock"("productId");

-- CreateIndex
CREATE INDEX "ProductStock_productId_outletId_idx" ON "public"."ProductStock"("productId", "outletId");

-- AddForeignKey
ALTER TABLE "public"."ProductCategory" ADD CONSTRAINT "ProductCategory_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PushCampaign" ADD CONSTRAINT "PushCampaign_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TelegramCampaign" ADD CONSTRAINT "TelegramCampaign_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerSegment" ADD CONSTRAINT "CustomerSegment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerSegment" ADD CONSTRAINT "CustomerSegment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
