/*
  Warnings:

  - A unique constraint covering the columns `[qrJti]` on the table `Hold` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."Hold" ADD COLUMN     "qrJti" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Hold_qrJti_key" ON "public"."Hold"("qrJti");
