-- AlterTable
ALTER TABLE "public"."Outlet"
    ADD COLUMN "posType" "public"."DeviceType",
    ADD COLUMN "posLastSeenAt" TIMESTAMP(3),
    ADD COLUMN "bridgeSecret" TEXT,
    ADD COLUMN "bridgeSecretNext" TEXT,
    ADD COLUMN "bridgeSecretUpdatedAt" TIMESTAMP(3);

-- Backfill aggregated POS data from Device
WITH ranked_devices AS (
    SELECT
        d."outletId",
        d."type",
        d."lastSeenAt",
        d."createdAt",
        ROW_NUMBER() OVER (
            PARTITION BY d."outletId"
            ORDER BY d."lastSeenAt" DESC NULLS LAST, d."createdAt" DESC
        ) AS rn
    FROM "public"."Device" d
    WHERE d."outletId" IS NOT NULL
),
best_device AS (
    SELECT
        rd."outletId",
        rd."type",
        rd."lastSeenAt",
        rd."createdAt"
    FROM ranked_devices rd
    WHERE rd.rn = 1
),
first_secret AS (
    SELECT DISTINCT ON (d."outletId")
        d."outletId",
        d."bridgeSecret"
    FROM "public"."Device" d
    WHERE d."outletId" IS NOT NULL
      AND d."bridgeSecret" IS NOT NULL
    ORDER BY d."outletId", d."lastSeenAt" DESC NULLS LAST, d."createdAt" DESC
)
UPDATE "public"."Outlet" o
SET
    "posType" = bd."type",
    "posLastSeenAt" = COALESCE(bd."lastSeenAt", bd."createdAt"),
    "bridgeSecret" = fs."bridgeSecret",
    "bridgeSecretUpdatedAt" = CASE
        WHEN fs."bridgeSecret" IS NOT NULL THEN CURRENT_TIMESTAMP
        ELSE NULL
    END
FROM best_device bd
LEFT JOIN first_secret fs ON fs."outletId" = bd."outletId"
WHERE o."id" = bd."outletId";
