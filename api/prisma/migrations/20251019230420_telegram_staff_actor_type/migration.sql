/*
  Warnings:

  - You are about to drop the column `miniappPlatforms` on the `CustomerStats` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."TelegramStaffActorType" AS ENUM ('MERCHANT', 'STAFF', 'GROUP');

-- AlterTable
ALTER TABLE "public"."CashierSession" ALTER COLUMN "lastSeenAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."CustomerStats" DROP COLUMN "miniappPlatforms";

-- AlterTable
ALTER TABLE "public"."TelegramStaffInvite" ADD COLUMN     "actorType" "public"."TelegramStaffActorType" NOT NULL DEFAULT 'STAFF',
ADD COLUMN     "staffId" TEXT;

-- AlterTable
ALTER TABLE "public"."TelegramStaffSubscriber" ADD COLUMN     "actorType" "public"."TelegramStaffActorType" NOT NULL DEFAULT 'STAFF',
ADD COLUMN     "staffId" TEXT;

-- CreateIndex
CREATE INDEX "TelegramStaffInvite_merchantId_staffId_createdAt_idx" ON "public"."TelegramStaffInvite"("merchantId", "staffId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramStaffSubscriber_merchantId_staffId_idx" ON "public"."TelegramStaffSubscriber"("merchantId", "staffId");

-- CreateIndex
CREATE INDEX "TelegramStaffSubscriber_merchantId_actorType_idx" ON "public"."TelegramStaffSubscriber"("merchantId", "actorType");

-- AddForeignKey
ALTER TABLE "public"."TelegramStaffInvite" ADD CONSTRAINT "TelegramStaffInvite_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TelegramStaffSubscriber" ADD CONSTRAINT "TelegramStaffSubscriber_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
