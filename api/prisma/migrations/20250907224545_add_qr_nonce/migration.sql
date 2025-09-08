-- CreateTable
CREATE TABLE "public"."QrNonce" (
    "jti" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "merchantId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrNonce_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "QrNonce_merchantId_usedAt_idx" ON "public"."QrNonce"("merchantId", "usedAt");
