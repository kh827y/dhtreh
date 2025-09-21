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
CREATE TABLE "public"."StaffOutletAccess" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "outletId" TEXT NOT NULL,
    "pinCode" TEXT,
    "lastTxnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffOutletAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffOutletAccess_merchantId_outletId_idx" ON "public"."StaffOutletAccess"("merchantId", "outletId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffOutletAccess_merchantId_staffId_outletId_key" ON "public"."StaffOutletAccess"("merchantId", "staffId", "outletId");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_cashierLogin_key" ON "public"."Merchant"("cashierLogin");

-- AddForeignKey
ALTER TABLE "public"."StaffOutletAccess" ADD CONSTRAINT "StaffOutletAccess_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffOutletAccess" ADD CONSTRAINT "StaffOutletAccess_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StaffOutletAccess" ADD CONSTRAINT "StaffOutletAccess_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
