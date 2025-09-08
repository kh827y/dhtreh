-- AlterTable
ALTER TABLE "public"."MerchantSettings" ADD COLUMN     "qrTtlSec" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "webhookSecret" TEXT,
ADD COLUMN     "webhookUrl" TEXT;

-- CreateTable
CREATE TABLE "public"."EventOutbox" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retries" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventOutbox_status_nextRetryAt_idx" ON "public"."EventOutbox"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "EventOutbox_merchantId_createdAt_idx" ON "public"."EventOutbox"("merchantId", "createdAt");
