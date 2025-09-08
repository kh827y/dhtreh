-- CreateTable
CREATE TABLE "public"."IdempotencyKey" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Consent" (
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("merchantId","customerId")
);

-- CreateIndex
CREATE INDEX "IdempotencyKey_merchantId_createdAt_idx" ON "public"."IdempotencyKey"("merchantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_merchantId_key_key" ON "public"."IdempotencyKey"("merchantId", "key");

-- AddForeignKey
ALTER TABLE "public"."Consent" ADD CONSTRAINT "Consent_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Consent" ADD CONSTRAINT "Consent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
