-- CreateEnum
CREATE TYPE "public"."StaffMotivationAction" AS ENUM ('PURCHASE', 'REFUND');

-- AlterTable
ALTER TABLE "public"."MerchantSettings"
  ALTER COLUMN "staffMotivationNewCustomerPoints" SET DEFAULT 30,
  ALTER COLUMN "staffMotivationExistingCustomerPoints" SET DEFAULT 10;

UPDATE "public"."MerchantSettings"
SET
  "staffMotivationNewCustomerPoints" = 30,
  "staffMotivationExistingCustomerPoints" = 10
WHERE COALESCE("staffMotivationEnabled", false) = false
  AND COALESCE("staffMotivationNewCustomerPoints", 0) = 0
  AND COALESCE("staffMotivationExistingCustomerPoints", 0) = 0;

-- CreateTable
CREATE TABLE "public"."StaffMotivationEntry" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "outletId" TEXT,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "receiptId" TEXT,
    "action" "public"."StaffMotivationAction" NOT NULL,
    "points" INTEGER NOT NULL,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "share" DOUBLE PRECISION,
    "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffMotivationEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffMotivationEntry_merchantId_eventAt_idx"
  ON "public"."StaffMotivationEntry"("merchantId", "eventAt");

CREATE INDEX "StaffMotivationEntry_merchantId_staffId_eventAt_idx"
  ON "public"."StaffMotivationEntry"("merchantId", "staffId", "eventAt");

CREATE INDEX "StaffMotivationEntry_merchantId_orderId_idx"
  ON "public"."StaffMotivationEntry"("merchantId", "orderId");

CREATE INDEX "StaffMotivationEntry_merchantId_outletId_eventAt_idx"
  ON "public"."StaffMotivationEntry"("merchantId", "outletId", "eventAt");

-- AddForeignKey
ALTER TABLE "public"."StaffMotivationEntry"
  ADD CONSTRAINT "StaffMotivationEntry_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."StaffMotivationEntry"
  ADD CONSTRAINT "StaffMotivationEntry_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."StaffMotivationEntry"
  ADD CONSTRAINT "StaffMotivationEntry_outletId_fkey"
  FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."StaffMotivationEntry"
  ADD CONSTRAINT "StaffMotivationEntry_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
