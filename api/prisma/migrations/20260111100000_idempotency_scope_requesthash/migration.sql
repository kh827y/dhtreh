-- AlterTable
ALTER TABLE "IdempotencyKey" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'general';
ALTER TABLE "IdempotencyKey" ADD COLUMN     "requestHash" TEXT;
ALTER TABLE "IdempotencyKey" ALTER COLUMN "response" DROP NOT NULL;

-- DropIndex
DROP INDEX "IdempotencyKey_merchantId_key_key";

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_merchantId_scope_key_key" ON "IdempotencyKey"("merchantId", "scope", "key");
