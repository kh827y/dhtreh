/*
  Warnings:

  - You are about to drop the `LoyaltyPromotion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SmsNotification` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[transactionId]` on the table `Review` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."CommunicationTask" DROP CONSTRAINT "CommunicationTask_promotionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."LoyaltyPromotion" DROP CONSTRAINT "LoyaltyPromotion_createdById_fkey";

-- DropForeignKey
ALTER TABLE "public"."LoyaltyPromotion" DROP CONSTRAINT "LoyaltyPromotion_merchantId_fkey";

-- DropForeignKey
ALTER TABLE "public"."LoyaltyPromotion" DROP CONSTRAINT "LoyaltyPromotion_pushTemplateReminderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."LoyaltyPromotion" DROP CONSTRAINT "LoyaltyPromotion_pushTemplateStartId_fkey";

-- DropForeignKey
ALTER TABLE "public"."LoyaltyPromotion" DROP CONSTRAINT "LoyaltyPromotion_segmentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."LoyaltyPromotion" DROP CONSTRAINT "LoyaltyPromotion_targetTierId_fkey";

-- DropForeignKey
ALTER TABLE "public"."LoyaltyPromotion" DROP CONSTRAINT "LoyaltyPromotion_updatedById_fkey";

-- DropForeignKey
ALTER TABLE "public"."LoyaltyPromotionMetric" DROP CONSTRAINT "LoyaltyPromotionMetric_promotionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PromotionParticipant" DROP CONSTRAINT "PromotionParticipant_promotionId_fkey";

-- AlterTable
ALTER TABLE "public"."loyalty_promotions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "public"."LoyaltyPromotion";

-- DropTable
DROP TABLE "public"."SmsNotification";

-- CreateIndex
CREATE UNIQUE INDEX "Review_transactionId_key" ON "public"."Review"("transactionId");

-- AddForeignKey
ALTER TABLE "public"."CommunicationTask" ADD CONSTRAINT "CommunicationTask_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public"."loyalty_promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PromotionParticipant" ADD CONSTRAINT "PromotionParticipant_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public"."loyalty_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LoyaltyPromotionMetric" ADD CONSTRAINT "LoyaltyPromotionMetric_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public"."loyalty_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
