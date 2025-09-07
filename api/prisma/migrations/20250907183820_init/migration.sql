-- CreateEnum
CREATE TYPE "public"."WalletType" AS ENUM ('POINTS');

-- CreateEnum
CREATE TYPE "public"."HoldMode" AS ENUM ('REDEEM', 'EARN');

-- CreateEnum
CREATE TYPE "public"."HoldStatus" AS ENUM ('PENDING', 'COMMITTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "public"."TxnType" AS ENUM ('EARN', 'REDEEM', 'REFUND', 'ADJUST');

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "tgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Wallet" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "public"."WalletType" NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Hold" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "mode" "public"."HoldMode" NOT NULL,
    "redeemAmount" INTEGER NOT NULL DEFAULT 0,
    "earnPoints" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."HoldStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT,
    "receiptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Transaction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "public"."TxnType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "public"."Customer"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_tgId_key" ON "public"."Customer"("tgId");

-- CreateIndex
CREATE INDEX "wallet_owner_type_idx" ON "public"."Wallet"("customerId", "type");

-- CreateIndex
CREATE INDEX "Hold_customerId_status_idx" ON "public"."Hold"("customerId", "status");

-- CreateIndex
CREATE INDEX "Transaction_customerId_createdAt_idx" ON "public"."Transaction"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."Wallet" ADD CONSTRAINT "Wallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Hold" ADD CONSTRAINT "Hold_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transaction" ADD CONSTRAINT "Transaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
