-- Ensure enums for promotions exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PromotionStatus') THEN
        CREATE TYPE "public"."PromotionStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED', 'ARCHIVED');
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PromotionRewardType') THEN
        CREATE TYPE "public"."PromotionRewardType" AS ENUM ('POINTS', 'DISCOUNT', 'CASHBACK', 'LEVEL_UP', 'CUSTOM');
    END IF;
END
$$;

-- Create loyalty promotions table in snake_case for analytics/joins reuse
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'loyalty_promotions'
    ) THEN
        CREATE TABLE "public"."loyalty_promotions" (
            "id" TEXT NOT NULL,
            "merchantId" TEXT NOT NULL,
            "segmentId" TEXT,
            "targetTierId" TEXT,
            "name" TEXT NOT NULL,
            "description" TEXT,
            "status" "public"."PromotionStatus" NOT NULL DEFAULT 'DRAFT',
            "rewardType" "public"."PromotionRewardType" NOT NULL,
            "rewardValue" INTEGER,
            "rewardMetadata" JSONB,
            "pointsExpireInDays" INTEGER,
            "pushTemplateStartId" TEXT,
            "pushTemplateReminderId" TEXT,
            "pushOnStart" BOOLEAN NOT NULL DEFAULT false,
            "pushReminderEnabled" BOOLEAN NOT NULL DEFAULT false,
            "reminderOffsetHours" INTEGER,
            "autoLaunch" BOOLEAN NOT NULL DEFAULT false,
            "startAt" TIMESTAMP(3),
            "endAt" TIMESTAMP(3),
            "launchedAt" TIMESTAMP(3),
            "archivedAt" TIMESTAMP(3),
            "createdById" TEXT,
            "updatedById" TEXT,
            "metadata" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "loyalty_promotions_pkey" PRIMARY KEY ("id")
        );

        ALTER TABLE "public"."loyalty_promotions"
            ADD CONSTRAINT "loyalty_promotions_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            ADD CONSTRAINT "loyalty_promotions_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "public"."CustomerSegment"("id") ON DELETE SET NULL ON UPDATE CASCADE,
            ADD CONSTRAINT "loyalty_promotions_targetTierId_fkey" FOREIGN KEY ("targetTierId") REFERENCES "public"."LoyaltyTier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
            ADD CONSTRAINT "loyalty_promotions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE,
            ADD CONSTRAINT "loyalty_promotions_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "public"."Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE,
            ADD CONSTRAINT "loyalty_promotions_pushTemplateStartId_fkey" FOREIGN KEY ("pushTemplateStartId") REFERENCES "public"."CommunicationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE,
            ADD CONSTRAINT "loyalty_promotions_pushTemplateReminderId_fkey" FOREIGN KEY ("pushTemplateReminderId") REFERENCES "public"."CommunicationTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

        CREATE INDEX "loyalty_promotions_merchantId_status_idx" ON "public"."loyalty_promotions"("merchantId", "status");
        CREATE INDEX "loyalty_promotions_segmentId_idx" ON "public"."loyalty_promotions"("segmentId");
        CREATE INDEX "loyalty_promotions_merchantId_archivedAt_idx" ON "public"."loyalty_promotions"("merchantId", "archivedAt");
    END IF;
END
$$;

-- Create promotion participants table when missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'PromotionParticipant'
    ) THEN
        CREATE TABLE "public"."PromotionParticipant" (
            "id" TEXT NOT NULL,
            "promotionId" TEXT NOT NULL,
            "merchantId" TEXT NOT NULL,
            "customerId" TEXT NOT NULL,
            "outletId" TEXT,
            "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "firstPurchaseAt" TIMESTAMP(3),
            "lastPurchaseAt" TIMESTAMP(3),
            "purchasesCount" INTEGER NOT NULL DEFAULT 0,
            "totalSpent" INTEGER NOT NULL DEFAULT 0,
            "pointsIssued" INTEGER NOT NULL DEFAULT 0,
            "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
            "status" TEXT NOT NULL DEFAULT 'ACTIVE',
            "metadata" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "PromotionParticipant_pkey" PRIMARY KEY ("id")
        );

        ALTER TABLE "public"."PromotionParticipant"
            ADD CONSTRAINT "PromotionParticipant_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public"."loyalty_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
            ADD CONSTRAINT "PromotionParticipant_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            ADD CONSTRAINT "PromotionParticipant_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            ADD CONSTRAINT "PromotionParticipant_outletId_fkey" FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

        CREATE UNIQUE INDEX "PromotionParticipant_promotionId_customerId_key" ON "public"."PromotionParticipant"("promotionId", "customerId");
        CREATE INDEX "PromotionParticipant_merchantId_status_idx" ON "public"."PromotionParticipant"("merchantId", "status");
    END IF;
END
$$;

-- Create promotion metrics table when missing
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'LoyaltyPromotionMetric'
    ) THEN
        CREATE TABLE "public"."LoyaltyPromotionMetric" (
            "id" TEXT NOT NULL,
            "promotionId" TEXT NOT NULL,
            "merchantId" TEXT NOT NULL,
            "participantsCount" INTEGER NOT NULL DEFAULT 0,
            "revenueGenerated" INTEGER NOT NULL DEFAULT 0,
            "revenueRedeemed" INTEGER NOT NULL DEFAULT 0,
            "pointsIssued" INTEGER NOT NULL DEFAULT 0,
            "pointsRedeemed" INTEGER NOT NULL DEFAULT 0,
            "charts" JSONB,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "LoyaltyPromotionMetric_pkey" PRIMARY KEY ("id")
        );

        ALTER TABLE "public"."LoyaltyPromotionMetric"
            ADD CONSTRAINT "LoyaltyPromotionMetric_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public"."loyalty_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
            ADD CONSTRAINT "LoyaltyPromotionMetric_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

        CREATE UNIQUE INDEX "LoyaltyPromotionMetric_promotionId_key" ON "public"."LoyaltyPromotionMetric"("promotionId");
        CREATE INDEX "LoyaltyPromotionMetric_merchantId_idx" ON "public"."LoyaltyPromotionMetric"("merchantId");
    END IF;
END
$$;

-- Ensure communication tasks reference promotions via FK
ALTER TABLE "public"."CommunicationTask"
    ADD COLUMN IF NOT EXISTS "promotionId" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_schema = 'public'
          AND table_name = 'CommunicationTask'
          AND constraint_name = 'CommunicationTask_promotionId_fkey'
    ) THEN
        ALTER TABLE "public"."CommunicationTask"
            ADD CONSTRAINT "CommunicationTask_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "public"."loyalty_promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;
