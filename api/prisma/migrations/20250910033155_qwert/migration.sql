-- CreateTable
CREATE TABLE "public"."AdminAudit" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "merchantId" TEXT,
    "action" TEXT,
    "payload" JSONB,

    CONSTRAINT "AdminAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminAudit_merchantId_createdAt_idx" ON "public"."AdminAudit"("merchantId", "createdAt");
