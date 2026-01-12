-- Drop legacy outlet indexes before removing columns.
DROP INDEX IF EXISTS "Outlet_merchantId_hidden_idx";
DROP INDEX IF EXISTS "Outlet_merchantId_externalId_key";
DROP INDEX IF EXISTS "Outlet_merchantId_code_key";

-- Drop legacy outlet schedule table.
DROP TABLE IF EXISTS "OutletSchedule";

-- Drop legacy outlet columns.
ALTER TABLE "Outlet"
  DROP COLUMN IF EXISTS "address",
  DROP COLUMN IF EXISTS "hidden",
  DROP COLUMN IF EXISTS "description",
  DROP COLUMN IF EXISTS "phone",
  DROP COLUMN IF EXISTS "adminEmails",
  DROP COLUMN IF EXISTS "timezone",
  DROP COLUMN IF EXISTS "code",
  DROP COLUMN IF EXISTS "tags",
  DROP COLUMN IF EXISTS "scheduleEnabled",
  DROP COLUMN IF EXISTS "scheduleMode",
  DROP COLUMN IF EXISTS "scheduleJson",
  DROP COLUMN IF EXISTS "externalId",
  DROP COLUMN IF EXISTS "integrationProvider",
  DROP COLUMN IF EXISTS "integrationLocationCode",
  DROP COLUMN IF EXISTS "integrationPayload",
  DROP COLUMN IF EXISTS "manualLocation",
  DROP COLUMN IF EXISTS "latitude",
  DROP COLUMN IF EXISTS "longitude",
  DROP COLUMN IF EXISTS "posType",
  DROP COLUMN IF EXISTS "posLastSeenAt";
