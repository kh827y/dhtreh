-- CustomerSegment: system flags for default audiences
ALTER TABLE "public"."CustomerSegment"
  ADD COLUMN "systemKey" TEXT,
  ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "CustomerSegment_merchantId_systemKey_key"
  ON "public"."CustomerSegment"("merchantId", "systemKey")
  WHERE "systemKey" IS NOT NULL;

CREATE INDEX "CustomerSegment_systemKey_idx"
  ON "public"."CustomerSegment"("systemKey");

CREATE INDEX "CustomerSegment_merchantId_isSystem_idx"
  ON "public"."CustomerSegment"("merchantId", "isSystem");

-- CommunicationAsset: binary storage for campaign media
CREATE TABLE "public"."CommunicationAsset" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "channel" "public"."CommunicationChannel" NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'MEDIA',
    "fileName" TEXT,
    "mimeType" TEXT,
    "byteSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunicationAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommunicationAsset_merchantId_channel_idx"
  ON "public"."CommunicationAsset"("merchantId", "channel");

ALTER TABLE "public"."CommunicationAsset"
  ADD CONSTRAINT "CommunicationAsset_merchantId_fkey"
  FOREIGN KEY ("merchantId") REFERENCES "public"."Merchant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed default hidden audience "Все клиенты" for each merchant
INSERT INTO "public"."CustomerSegment" (
  "merchantId",
  "name",
  "description",
  "type",
  "rules",
  "filters",
  "metricsSnapshot",
  "customerCount",
  "isActive",
  "tags",
  "color",
  "definitionVersion",
  "source",
  "createdById",
  "updatedById",
  "archivedAt",
  "lastEvaluatedAt",
  "systemKey",
  "isSystem"
)
SELECT
  m."id",
  'Все клиенты',
  'Системная аудитория: все клиенты мерчанта',
  'SYSTEM',
  jsonb_build_object('kind', 'all'),
  NULL,
  jsonb_build_object(
    'calculatedAt', NOW(),
    'estimatedCustomers', COALESCE(stats.total_customers, 0)
  ),
  COALESCE(stats.total_customers, 0),
  TRUE,
  ARRAY[]::TEXT[],
  NULL,
  1,
  'system',
  NULL,
  NULL,
  NULL,
  NULL,
  'all-customers',
  TRUE
FROM "public"."Merchant" m
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS total_customers
  FROM "public"."CustomerStats" cs
  WHERE cs."merchantId" = m."id"
) stats ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM "public"."CustomerSegment" s
  WHERE s."merchantId" = m."id"
    AND s."systemKey" = 'all-customers'
);
