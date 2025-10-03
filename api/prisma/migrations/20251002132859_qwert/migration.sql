/*
  Warnings:

  - You are about to drop the `LoyaltyPromotion` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `SmsNotification` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[transactionId]` on the table `Review` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'CommunicationTask'
      AND constraint_name = 'CommunicationTask_promotionId_fkey'
  ) THEN
    ALTER TABLE "public"."CommunicationTask" DROP CONSTRAINT "CommunicationTask_promotionId_fkey";
  END IF;
END $$;

DROP TABLE IF EXISTS "public"."LoyaltyPromotion" CASCADE;
DROP TABLE IF EXISTS "public"."SmsNotification" CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Review'
      AND column_name = 'transactionId'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "Review_transactionId_key" ON "public"."Review"("transactionId");
  END IF;
END $$;
