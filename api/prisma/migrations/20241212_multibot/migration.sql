-- CreateTable for Telegram Bot management
CREATE TABLE "TelegramBot" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "botUsername" TEXT NOT NULL,
    "botId" TEXT,
    "webhookUrl" TEXT,
    "webhookSecret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "welcomeMessage" TEXT,
    "menuConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable for Subscription Plans
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "interval" TEXT NOT NULL,
    "features" JSONB NOT NULL,
    "maxTransactions" INTEGER,
    "maxCustomers" INTEGER,
    "maxOutlets" INTEGER,
    "webhooksEnabled" BOOLEAN NOT NULL DEFAULT true,
    "customBranding" BOOLEAN NOT NULL DEFAULT false,
    "prioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "apiAccess" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable for Subscriptions
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable for Payment History
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RUB',
    "status" TEXT NOT NULL,
    "paymentMethod" TEXT,
    "invoiceId" TEXT,
    "receiptUrl" TEXT,
    "failureReason" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable for Fraud Detection
CREATE TABLE "FraudCheck" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "transactionId" TEXT,
    "riskScore" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "factors" TEXT[],
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "reviewedBy" TEXT,
    "reviewNotes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FraudCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable for Integration Configs
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "credentials" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSync" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable for Customer Segments
CREATE TABLE "CustomerSegment" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rules" JSONB NOT NULL,
    "customerCount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerSegment_pkey" PRIMARY KEY ("id")
);

-- CreateTable for Marketing Campaigns
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "segmentId" TEXT,
    "content" JSONB NOT NULL,
    "schedule" JSONB,
    "metrics" JSONB,
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramBot_merchantId_key" ON "TelegramBot"("merchantId");
CREATE UNIQUE INDEX "TelegramBot_botToken_key" ON "TelegramBot"("botToken");
CREATE UNIQUE INDEX "TelegramBot_botUsername_key" ON "TelegramBot"("botUsername");
CREATE INDEX "TelegramBot_isActive_idx" ON "TelegramBot"("isActive");

CREATE UNIQUE INDEX "Subscription_merchantId_key" ON "Subscription"("merchantId");
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");
CREATE INDEX "Subscription_planId_idx" ON "Subscription"("planId");

CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

CREATE INDEX "FraudCheck_merchantId_customerId_idx" ON "FraudCheck"("merchantId", "customerId");
CREATE INDEX "FraudCheck_riskLevel_idx" ON "FraudCheck"("riskLevel");
CREATE INDEX "FraudCheck_blocked_idx" ON "FraudCheck"("blocked");
CREATE INDEX "FraudCheck_createdAt_idx" ON "FraudCheck"("createdAt");

CREATE INDEX "Integration_merchantId_type_idx" ON "Integration"("merchantId", "type");
CREATE INDEX "Integration_isActive_idx" ON "Integration"("isActive");

CREATE INDEX "CustomerSegment_merchantId_idx" ON "CustomerSegment"("merchantId");
CREATE INDEX "CustomerSegment_isActive_idx" ON "CustomerSegment"("isActive");

CREATE INDEX "Campaign_merchantId_idx" ON "Campaign"("merchantId");
CREATE INDEX "Campaign_status_idx" ON "Campaign"("status");
CREATE INDEX "Campaign_segmentId_idx" ON "Campaign"("segmentId");

-- AddForeignKey
ALTER TABLE "TelegramBot" ADD CONSTRAINT "TelegramBot_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FraudCheck" ADD CONSTRAINT "FraudCheck_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Integration" ADD CONSTRAINT "Integration_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerSegment" ADD CONSTRAINT "CustomerSegment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "CustomerSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Insert default subscription plans
INSERT INTO "Plan" ("id", "name", "displayName", "price", "currency", "interval", "features", "maxTransactions", "maxCustomers", "maxOutlets", "webhooksEnabled", "customBranding", "prioritySupport", "apiAccess")
VALUES 
  ('plan_free', 'free', 'Бесплатный', 0, 'RUB', 'month', '{"description": "Для малого бизнеса"}', 1000, 100, 1, false, false, false, false),
  ('plan_starter', 'starter', 'Стартовый', 1990, 'RUB', 'month', '{"description": "Для растущего бизнеса"}', 10000, 1000, 3, true, false, false, true),
  ('plan_business', 'business', 'Бизнес', 4990, 'RUB', 'month', '{"description": "Для среднего бизнеса"}', 100000, 10000, 10, true, true, false, true),
  ('plan_enterprise', 'enterprise', 'Корпоративный', 19990, 'RUB', 'month', '{"description": "Для крупного бизнеса"}', NULL, NULL, NULL, true, true, true, true);
