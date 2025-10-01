-- Backfill outlet metadata from remaining devices
WITH device_ranked AS (
    SELECT
        d."outletId",
        d."type",
        COALESCE(d."lastSeenAt", d."createdAt") AS "effectiveLastSeen",
        d."bridgeSecret",
        ROW_NUMBER() OVER (
            PARTITION BY d."outletId"
            ORDER BY d."lastSeenAt" DESC NULLS LAST, d."createdAt" DESC
        ) AS rn
    FROM "public"."Device" d
    WHERE d."outletId" IS NOT NULL
),
device_best AS (
    SELECT
        r."outletId",
        r."type",
        r."effectiveLastSeen",
        r."bridgeSecret"
    FROM device_ranked r
    WHERE r.rn = 1
)
UPDATE "public"."Outlet" o
SET
    "posType" = COALESCE(b."type", o."posType"),
    "posLastSeenAt" = CASE
        WHEN b."effectiveLastSeen" IS NOT NULL THEN
            CASE
                WHEN o."posLastSeenAt" IS NULL OR b."effectiveLastSeen" > o."posLastSeenAt" THEN b."effectiveLastSeen"
                ELSE o."posLastSeenAt"
            END
        ELSE o."posLastSeenAt"
    END,
    "bridgeSecret" = COALESCE(o."bridgeSecret", b."bridgeSecret"),
    "bridgeSecretUpdatedAt" = CASE
        WHEN o."bridgeSecret" IS NULL AND b."bridgeSecret" IS NOT NULL THEN COALESCE(o."bridgeSecretUpdatedAt", CURRENT_TIMESTAMP)
        ELSE o."bridgeSecretUpdatedAt"
    END
FROM device_best b
WHERE b."outletId" = o."id";

-- Propagate outletId from devices where it is still missing
UPDATE "public"."Hold" h
SET "outletId" = d."outletId"
FROM "public"."Device" d
WHERE h."outletId" IS NULL
  AND h."deviceId" = d."id"
  AND d."outletId" IS NOT NULL;

UPDATE "public"."Receipt" r
SET "outletId" = d."outletId"
FROM "public"."Device" d
WHERE r."outletId" IS NULL
  AND r."deviceId" = d."id"
  AND d."outletId" IS NOT NULL;

UPDATE "public"."Transaction" t
SET "outletId" = d."outletId"
FROM "public"."Device" d
WHERE t."outletId" IS NULL
  AND t."deviceId" = d."id"
  AND d."outletId" IS NOT NULL;

UPDATE "public"."LedgerEntry" l
SET "outletId" = d."outletId"
FROM "public"."Device" d
WHERE l."outletId" IS NULL
  AND l."deviceId" = d."id"
  AND d."outletId" IS NOT NULL;

UPDATE "public"."EarnLot" e
SET "outletId" = d."outletId"
FROM "public"."Device" d
WHERE e."outletId" IS NULL
  AND e."deviceId" = d."id"
  AND d."outletId" IS NOT NULL;

UPDATE "public"."CashierSession" cs
SET "outletId" = d."outletId"
FROM "public"."Device" d
WHERE cs."outletId" IS NULL
  AND cs."deviceId" = d."id"
  AND d."outletId" IS NOT NULL;

UPDATE "public"."Staff" s
SET "allowedOutletId" = d."outletId"
FROM "public"."Device" d
WHERE s."allowedOutletId" IS NULL
  AND s."allowedDeviceId" = d."id"
  AND d."outletId" IS NOT NULL;

-- Drop legacy indexes referencing deviceId
DROP INDEX IF EXISTS "public"."Hold_merchantId_deviceId_idx";
DROP INDEX IF EXISTS "public"."Receipt_merchantId_deviceId_idx";
DROP INDEX IF EXISTS "public"."Transaction_merchantId_deviceId_idx";

-- Drop foreign keys before removing columns
ALTER TABLE "public"."Hold" DROP CONSTRAINT IF EXISTS "Hold_deviceId_fkey";
ALTER TABLE "public"."Receipt" DROP CONSTRAINT IF EXISTS "Receipt_deviceId_fkey";
ALTER TABLE "public"."Transaction" DROP CONSTRAINT IF EXISTS "Transaction_deviceId_fkey";
ALTER TABLE "public"."CashierSession" DROP CONSTRAINT IF EXISTS "CashierSession_deviceId_fkey";

-- Drop columns relying on deviceId/allowedDeviceId
ALTER TABLE "public"."Hold" DROP COLUMN IF EXISTS "deviceId";
ALTER TABLE "public"."Receipt" DROP COLUMN IF EXISTS "deviceId";
ALTER TABLE "public"."Transaction" DROP COLUMN IF EXISTS "deviceId";
ALTER TABLE "public"."CashierSession" DROP COLUMN IF EXISTS "deviceId";
ALTER TABLE "public"."LedgerEntry" DROP COLUMN IF EXISTS "deviceId";
ALTER TABLE "public"."EarnLot" DROP COLUMN IF EXISTS "deviceId";
ALTER TABLE "public"."Staff" DROP COLUMN IF EXISTS "allowedDeviceId";

-- Add FK for PushDevice -> Outlet to keep referential integrity
ALTER TABLE "public"."PushDevice"
    ADD CONSTRAINT "PushDevice_outletId_fkey"
    FOREIGN KEY ("outletId") REFERENCES "public"."Outlet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Finally drop Device table
DROP TABLE IF EXISTS "public"."Device";
