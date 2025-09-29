/*
  Warnings:

  - A unique constraint covering the columns `[cashierLogin]` on the table `Merchant` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Merchant" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "cashierLogin" TEXT,
ADD COLUMN     "cashierPassword9" TEXT;

-- AlterTable
ALTER TABLE "public"."Staff" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "canAccessPortal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "comment" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "isOwner" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "pinCode" TEXT,
ADD COLUMN     "position" TEXT;

-- CreateTable

-- CreateIndex

-- CreateIndex

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_cashierLogin_key" ON "public"."Merchant"("cashierLogin");

-- AddForeignKey

-- AddForeignKey

-- AddForeignKey
