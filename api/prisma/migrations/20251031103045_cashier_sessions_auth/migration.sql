-- Ensure pgcrypto is available for SHA hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Resolve duplicate PIN codes within the same merchant by reassigning unique PINs
DO $$
DECLARE
  dup RECORD;
  access RECORD;
  keep_first BOOLEAN;
  candidate TEXT;
BEGIN
  FOR dup IN
    SELECT "merchantId", "pinCode"
    FROM "StaffOutletAccess"
    WHERE "pinCode" IS NOT NULL
    GROUP BY "merchantId", "pinCode"
    HAVING COUNT(*) > 1
  LOOP
    keep_first := TRUE;
    FOR access IN
      SELECT id, "merchantId"
      FROM "StaffOutletAccess"
      WHERE "merchantId" = dup."merchantId" AND "pinCode" = dup."pinCode"
      ORDER BY "createdAt"
    LOOP
      IF keep_first THEN
        keep_first := FALSE;
        CONTINUE;
      END IF;
      LOOP
        candidate := LPAD((FLOOR(RANDOM() * 10000))::INT::TEXT, 4, '0');
        EXIT WHEN NOT EXISTS (
          SELECT 1
          FROM "StaffOutletAccess"
          WHERE "merchantId" = dup."merchantId"
            AND "pinCode" = candidate
        );
      END LOOP;
      UPDATE "StaffOutletAccess"
      SET "pinCode" = candidate,
          "pinUpdatedAt" = NOW()
      WHERE id = access.id;
    END LOOP;
  END LOOP;
END $$;

-- Add unique constraint for merchant + PIN
ALTER TABLE "StaffOutletAccess"
  ADD CONSTRAINT "StaffOutletAccess_merchantId_pinCode_key"
  UNIQUE ("merchantId", "pinCode");

-- Extend cashier sessions with token hash and metadata
ALTER TABLE "CashierSession"
  ADD COLUMN "lastSeenAt" TIMESTAMP,
  ADD COLUMN "tokenHash" TEXT,
  ADD COLUMN "expiresAt" TIMESTAMP,
  ADD COLUMN "rememberPin" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "CashierSession"
SET "tokenHash" = encode(digest(id::text, 'sha256'), 'hex')
WHERE "tokenHash" IS NULL;

ALTER TABLE "CashierSession"
  ALTER COLUMN "tokenHash" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'CashierSession_tokenHash_key'
  ) THEN
    CREATE UNIQUE INDEX "CashierSession_tokenHash_key"
      ON "CashierSession"("tokenHash");
  END IF;
END $$;
