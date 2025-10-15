-- AlterTable
ALTER TABLE "public"."AutoReturnAttempt" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "public"."BirthdayGreeting" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sendDate" TIMESTAMP(3) NOT NULL,
    "birthdayDate" TIMESTAMP(3) NOT NULL,
    "message" TEXT NOT NULL,
    "giftPoints" INTEGER NOT NULL DEFAULT 0,
    "giftExpiresAt" TIMESTAMP(3),
    "giftTransactionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BirthdayGreeting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BirthdayGreeting_merchantId_sendDate_idx" ON "public"."BirthdayGreeting"("merchantId", "sendDate");

-- CreateIndex
CREATE INDEX "BirthdayGreeting_merchantId_status_idx" ON "public"."BirthdayGreeting"("merchantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BirthdayGreeting_merchantId_customerId_birthdayDate_key" ON "public"."BirthdayGreeting"("merchantId", "customerId", "birthdayDate");

-- AddForeignKey
ALTER TABLE "public"."BirthdayGreeting" ADD CONSTRAINT "BirthdayGreeting_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BirthdayGreeting" ADD CONSTRAINT "BirthdayGreeting_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
