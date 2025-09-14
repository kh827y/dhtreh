-- CreateTable
CREATE TABLE "public"."CustomerStats" (
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOrderAt" TIMESTAMP(3),
    "visits" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "avgCheck" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rfmR" INTEGER,
    "rfmF" INTEGER,
    "rfmM" INTEGER,
    "rfmScore" INTEGER,
    "rfmClass" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerStats_pkey" PRIMARY KEY ("merchantId","customerId")
);

-- CreateTable
CREATE TABLE "public"."MerchantKpiDaily" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "revenue" INTEGER NOT NULL DEFAULT 0,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "averageCheck" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newCustomers" INTEGER NOT NULL DEFAULT 0,
    "activeCustomers" INTEGER NOT NULL DEFAULT 0,
    "pointsIssued" INTEGER NOT NULL DEFAULT 0,
    "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MerchantKpiDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerStats_merchantId_updatedAt_idx" ON "public"."CustomerStats"("merchantId", "updatedAt");

-- CreateIndex
CREATE INDEX "MerchantKpiDaily_merchantId_date_idx" ON "public"."MerchantKpiDaily"("merchantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantKpiDaily_merchantId_date_key" ON "public"."MerchantKpiDaily"("merchantId", "date");

-- AddForeignKey
ALTER TABLE "public"."CustomerStats" ADD CONSTRAINT "CustomerStats_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerStats" ADD CONSTRAINT "CustomerStats_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MerchantKpiDaily" ADD CONSTRAINT "MerchantKpiDaily_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
