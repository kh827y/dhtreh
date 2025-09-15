-- CreateTable
CREATE TABLE "public"."SyncLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "merchantId" TEXT,
    "integrationId" TEXT,
    "provider" TEXT,
    "direction" TEXT NOT NULL,
    "endpoint" TEXT,
    "status" TEXT,
    "request" JSONB,
    "response" JSONB,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SyncLog_merchantId_createdAt_idx" ON "public"."SyncLog"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncLog_integrationId_createdAt_idx" ON "public"."SyncLog"("integrationId", "createdAt");
