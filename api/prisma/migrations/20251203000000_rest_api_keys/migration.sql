-- Add REST API integration key storage
ALTER TABLE "public"."Integration" ADD COLUMN "apiKeyHash" TEXT;
ALTER TABLE "public"."Integration" ADD COLUMN "apiKeyMask" TEXT;
ALTER TABLE "public"."Integration" ADD COLUMN "apiKeyCreatedAt" TIMESTAMP(3);
ALTER TABLE "public"."Integration" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Integration_merchantId_provider_idx" ON "public"."Integration"("merchantId", "provider");
CREATE INDEX "Integration_apiKeyHash_idx" ON "public"."Integration"("apiKeyHash");
