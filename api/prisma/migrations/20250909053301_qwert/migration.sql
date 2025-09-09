-- AlterTable
ALTER TABLE "public"."MerchantSettings" ADD COLUMN     "bridgeSecretNext" TEXT,
ADD COLUMN     "useWebhookNext" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "webhookKeyIdNext" TEXT,
ADD COLUMN     "webhookSecretNext" TEXT;
