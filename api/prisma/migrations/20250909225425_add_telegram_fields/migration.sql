-- AlterTable
ALTER TABLE "public"."MerchantSettings" ADD COLUMN     "miniappBaseUrl" TEXT,
ADD COLUMN     "telegramBotToken" TEXT,
ADD COLUMN     "telegramBotUsername" TEXT,
ADD COLUMN     "telegramStartParamRequired" BOOLEAN NOT NULL DEFAULT false;
