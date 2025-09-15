/*
  Warnings:

  - A unique constraint covering the columns `[voucherId,customerId,orderId]` on the table `VoucherUsage` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "VoucherUsage_voucherId_customerId_orderId_key" ON "public"."VoucherUsage"("voucherId", "customerId", "orderId");
