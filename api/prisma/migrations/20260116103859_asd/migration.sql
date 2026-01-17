/*
  Warnings:

  - You are about to drop the column `expiresAt` on the `Referral` table. All the data in the column will be lost.
  - You are about to drop the column `expiryDays` on the `ReferralProgram` table. All the data in the column will be lost.
  - You are about to drop the column `validUntil` on the `ReferralProgram` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."Referral" DROP COLUMN "expiresAt";

-- AlterTable
ALTER TABLE "public"."ReferralProgram" DROP COLUMN "expiryDays",
DROP COLUMN "validUntil";
