-- AlterTable
ALTER TABLE "public"."CommunicationTask"
  ADD COLUMN "audienceName" TEXT,
  ADD COLUMN "audienceSnapshot" JSONB,
  ADD COLUMN "media" JSONB,
  ADD COLUMN "timezone" TEXT,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "totalRecipients" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sentCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failedCount" INTEGER NOT NULL DEFAULT 0;

-- Data migration from PushCampaign
INSERT INTO "public"."CommunicationTask" (
  "id",
  "merchantId",
  "channel",
  "templateId",
  "audienceId",
  "audienceName",
  "audienceSnapshot",
  "promotionId",
  "createdById",
  "status",
  "scheduledAt",
  "payload",
  "filters",
  "stats",
  "media",
  "timezone",
  "archivedAt",
  "totalRecipients",
  "sentCount",
  "failedCount",
  "createdAt",
  "updatedAt"
)
SELECT
  pc."id",
  pc."merchantId",
  'PUSH',
  NULL,
  NULL,
  pc."audience",
  jsonb_build_object('legacyAudience', pc."audience"),
  NULL,
  NULL,
  pc."status",
  pc."scheduledAt",
  jsonb_strip_nulls(jsonb_build_object('text', pc."text", 'metadata', pc."metadata")),
  NULL,
  jsonb_strip_nulls(jsonb_build_object('totalRecipients', pc."totalRecipients", 'sent', pc."sent", 'failed', pc."failed")),
  NULL,
  pc."timezone",
  pc."archivedAt",
  COALESCE(pc."totalRecipients", 0),
  COALESCE(pc."sent", 0),
  COALESCE(pc."failed", 0),
  pc."createdAt",
  pc."updatedAt"
FROM "public"."PushCampaign" pc
ON CONFLICT ("id") DO NOTHING;

-- Data migration from TelegramCampaign
INSERT INTO "public"."CommunicationTask" (
  "id",
  "merchantId",
  "channel",
  "templateId",
  "audienceId",
  "audienceName",
  "audienceSnapshot",
  "promotionId",
  "createdById",
  "status",
  "scheduledAt",
  "payload",
  "filters",
  "stats",
  "media",
  "timezone",
  "archivedAt",
  "totalRecipients",
  "sentCount",
  "failedCount",
  "createdAt",
  "updatedAt"
)
SELECT
  tc."id",
  tc."merchantId",
  'TELEGRAM',
  NULL,
  NULL,
  COALESCE(tc."audienceName", tc."audienceId"),
  jsonb_strip_nulls(jsonb_build_object('legacyAudienceId', tc."audienceId", 'audienceName', tc."audienceName")),
  NULL,
  NULL,
  tc."status",
  tc."scheduledAt",
  jsonb_strip_nulls(jsonb_build_object('text', tc."text", 'metadata', tc."metadata")),
  NULL,
  jsonb_strip_nulls(jsonb_build_object('totalRecipients', tc."totalRecipients", 'sent', tc."sent", 'failed', tc."failed")),
  jsonb_strip_nulls(jsonb_build_object('imageUrl', tc."imageUrl")),
  tc."timezone",
  tc."archivedAt",
  COALESCE(tc."totalRecipients", 0),
  COALESCE(tc."sent", 0),
  COALESCE(tc."failed", 0),
  tc."createdAt",
  tc."updatedAt"
FROM "public"."TelegramCampaign" tc
ON CONFLICT ("id") DO NOTHING;

-- DropTable
DROP TABLE IF EXISTS "public"."PushCampaign";
DROP TABLE IF EXISTS "public"."TelegramCampaign";
