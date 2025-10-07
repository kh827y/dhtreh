-- CreateTable
CREATE TABLE "public"."CustomerTelegram" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "tgId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerTelegram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTelegram_customerId_key" ON "public"."CustomerTelegram"("customerId");

-- CreateIndex
CREATE INDEX "CustomerTelegram_merchantId_idx" ON "public"."CustomerTelegram"("merchantId");

-- CreateIndex
CREATE INDEX "CustomerTelegram_tgId_idx" ON "public"."CustomerTelegram"("tgId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTelegram_merchantId_tgId_key" ON "public"."CustomerTelegram"("merchantId", "tgId");

-- AddForeignKey
ALTER TABLE "public"."CustomerTelegram" ADD CONSTRAINT "CustomerTelegram_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerTelegram" ADD CONSTRAINT "CustomerTelegram_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
