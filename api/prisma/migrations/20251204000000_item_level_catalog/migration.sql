-- AlterTable
ALTER TABLE "public"."ProductCategory" ADD COLUMN     "code" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalProvider" TEXT;

-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalProvider" TEXT,
ADD COLUMN     "unit" TEXT;

-- CreateTable
CREATE TABLE "public"."HoldItem" (
    "id" TEXT NOT NULL,
    "holdId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT,
    "categoryId" TEXT,
    "externalProvider" TEXT,
    "externalId" TEXT,
    "name" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "qty" DECIMAL(14,3) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "amount" INTEGER NOT NULL,
    "earnPoints" INTEGER,
    "redeemAmount" INTEGER,
    "promotionId" TEXT,
    "promotionMultiplier" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HoldItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReceiptItem" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT,
    "categoryId" TEXT,
    "externalProvider" TEXT,
    "externalId" TEXT,
    "name" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "qty" DECIMAL(14,3) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "amount" INTEGER NOT NULL,
    "earnApplied" INTEGER NOT NULL DEFAULT 0,
    "redeemApplied" INTEGER NOT NULL DEFAULT 0,
    "promotionId" TEXT,
    "promotionMultiplier" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TransactionItem" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "receiptItemId" TEXT,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT,
    "categoryId" TEXT,
    "externalProvider" TEXT,
    "externalId" TEXT,
    "name" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "qty" DECIMAL(14,3) NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "amount" INTEGER NOT NULL,
    "earnAmount" INTEGER,
    "redeemAmount" INTEGER,
    "promotionId" TEXT,
    "promotionMultiplier" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductCategoryExternal" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "externalProvider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategoryExternal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductExternalId" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "externalProvider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "barcode" TEXT,
    "sku" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductExternalId_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HoldItem_holdId_idx" ON "public"."HoldItem"("holdId");

-- CreateIndex
CREATE INDEX "HoldItem_merchantId_productId_idx" ON "public"."HoldItem"("merchantId", "productId");

-- CreateIndex
CREATE INDEX "HoldItem_merchantId_externalProvider_externalId_idx" ON "public"."HoldItem"("merchantId", "externalProvider", "externalId");

-- CreateIndex
CREATE INDEX "ReceiptItem_receiptId_idx" ON "public"."ReceiptItem"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptItem_merchantId_productId_idx" ON "public"."ReceiptItem"("merchantId", "productId");

-- CreateIndex
CREATE INDEX "ReceiptItem_merchantId_externalProvider_externalId_idx" ON "public"."ReceiptItem"("merchantId", "externalProvider", "externalId");

-- CreateIndex
CREATE INDEX "TransactionItem_transactionId_idx" ON "public"."TransactionItem"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionItem_merchantId_productId_idx" ON "public"."TransactionItem"("merchantId", "productId");

-- CreateIndex
CREATE INDEX "TransactionItem_merchantId_externalProvider_externalId_idx" ON "public"."TransactionItem"("merchantId", "externalProvider", "externalId");

-- CreateIndex
CREATE INDEX "ProductCategoryExternal_merchantId_categoryId_idx" ON "public"."ProductCategoryExternal"("merchantId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategoryExternal_merchantId_externalProvider_externa_key" ON "public"."ProductCategoryExternal"("merchantId", "externalProvider", "externalId");

-- CreateIndex
CREATE INDEX "ProductExternalId_merchantId_productId_idx" ON "public"."ProductExternalId"("merchantId", "productId");

-- CreateIndex
CREATE INDEX "ProductExternalId_merchantId_barcode_idx" ON "public"."ProductExternalId"("merchantId", "barcode");

-- CreateIndex
CREATE INDEX "ProductExternalId_merchantId_sku_idx" ON "public"."ProductExternalId"("merchantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "ProductExternalId_merchantId_externalProvider_externalId_key" ON "public"."ProductExternalId"("merchantId", "externalProvider", "externalId");

-- CreateIndex
CREATE INDEX "ProductCategory_merchantId_externalProvider_externalId_idx" ON "public"."ProductCategory"("merchantId", "externalProvider", "externalId");

-- CreateIndex
CREATE INDEX "Product_merchantId_externalProvider_externalId_idx" ON "public"."Product"("merchantId", "externalProvider", "externalId");

-- AddForeignKey
ALTER TABLE "public"."HoldItem" ADD CONSTRAINT "HoldItem_holdId_fkey" FOREIGN KEY ("holdId") REFERENCES "public"."Hold"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HoldItem" ADD CONSTRAINT "HoldItem_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HoldItem" ADD CONSTRAINT "HoldItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HoldItem" ADD CONSTRAINT "HoldItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HoldItem" ADD CONSTRAINT "HoldItem_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public"."loyalty_promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptItem" ADD CONSTRAINT "ReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "public"."Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptItem" ADD CONSTRAINT "ReceiptItem_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptItem" ADD CONSTRAINT "ReceiptItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptItem" ADD CONSTRAINT "ReceiptItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ReceiptItem" ADD CONSTRAINT "ReceiptItem_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public"."loyalty_promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransactionItem" ADD CONSTRAINT "TransactionItem_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "public"."Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransactionItem" ADD CONSTRAINT "TransactionItem_receiptItemId_fkey" FOREIGN KEY ("receiptItemId") REFERENCES "public"."ReceiptItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransactionItem" ADD CONSTRAINT "TransactionItem_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransactionItem" ADD CONSTRAINT "TransactionItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransactionItem" ADD CONSTRAINT "TransactionItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TransactionItem" ADD CONSTRAINT "TransactionItem_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public"."loyalty_promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductCategoryExternal" ADD CONSTRAINT "ProductCategoryExternal_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductCategoryExternal" ADD CONSTRAINT "ProductCategoryExternal_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductExternalId" ADD CONSTRAINT "ProductExternalId_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductExternalId" ADD CONSTRAINT "ProductExternalId_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
