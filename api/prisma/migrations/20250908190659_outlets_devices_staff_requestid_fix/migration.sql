-- CreateEnum
CREATE TYPE "public"."DeviceType" AS ENUM ('SMART', 'PC_POS', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "public"."StaffRole" AS ENUM ('ADMIN', 'MANAGER', 'CASHIER');

-- AlterTable
ALTER TABLE "public"."Hold" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "outletId" TEXT,
ADD COLUMN     "staffId" TEXT;

-- AlterTable
ALTER TABLE "public"."Receipt" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "outletId" TEXT,
ADD COLUMN     "staffId" TEXT;

-- AlterTable
ALTER TABLE "public"."Transaction" ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "outletId" TEXT,
ADD COLUMN     "staffId" TEXT;

-- CreateTable
CREATE TABLE "public"."Outlet" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Device" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "outletId" TEXT,
    "type" "public"."DeviceType" NOT NULL,
    "label" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Staff" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "login" TEXT,
    "email" TEXT,
    "role" "public"."StaffRole" NOT NULL DEFAULT 'CASHIER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "hash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Outlet_merchantId_idx" ON "public"."Outlet"("merchantId");

-- CreateIndex
CREATE INDEX "Device_merchantId_idx" ON "public"."Device"("merchantId");

-- CreateIndex
CREATE INDEX "Device_merchantId_outletId_idx" ON "public"."Device"("merchantId", "outletId");

-- CreateIndex
CREATE INDEX "Staff_merchantId_idx" ON "public"."Staff"("merchantId");

-- CreateIndex
CREATE UNIQUE INDEX "Staff_merchantId_login_key" ON "public"."Staff"("merchantId", "login");

-- CreateIndex
CREATE INDEX "Hold_merchantId_outletId_idx" ON "public"."Hold"("merchantId", "outletId");

-- CreateIndex
CREATE INDEX "Hold_merchantId_deviceId_idx" ON "public"."Hold"("merchantId", "deviceId");

-- CreateIndex
CREATE INDEX "Hold_merchantId_staffId_idx" ON "public"."Hold"("merchantId", "staffId");

-- CreateIndex
CREATE INDEX "Receipt_merchantId_outletId_idx" ON "public"."Receipt"("merchantId", "outletId");

-- CreateIndex
CREATE INDEX "Receipt_merchantId_deviceId_idx" ON "public"."Receipt"("merchantId", "deviceId");

-- CreateIndex
CREATE INDEX "Receipt_merchantId_staffId_idx" ON "public"."Receipt"("merchantId", "staffId");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_outletId_idx" ON "public"."Transaction"("merchantId", "outletId");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_deviceId_idx" ON "public"."Transaction"("merchantId", "deviceId");

-- CreateIndex
CREATE INDEX "Transaction_merchantId_staffId_idx" ON "public"."Transaction"("merchantId", "staffId");

-- AddForeignKey
ALTER TABLE "public"."Hold" ADD CONSTRAINT "Hold_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Hold" ADD CONSTRAINT "Hold_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Hold" ADD CONSTRAINT "Hold_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Receipt" ADD CONSTRAINT "Receipt_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Receipt" ADD CONSTRAINT "Receipt_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Receipt" ADD CONSTRAINT "Receipt_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "public"."Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Outlet" ADD CONSTRAINT "Outlet_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Device" ADD CONSTRAINT "Device_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Staff" ADD CONSTRAINT "Staff_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
