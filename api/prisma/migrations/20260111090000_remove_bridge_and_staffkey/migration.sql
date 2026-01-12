-- Drop legacy Bridge/StaffKey settings from merchants and outlets.
ALTER TABLE "MerchantSettings"
  DROP COLUMN IF EXISTS "requireBridgeSig",
  DROP COLUMN IF EXISTS "bridgeSecret",
  DROP COLUMN IF EXISTS "bridgeSecretNext",
  DROP COLUMN IF EXISTS "requireStaffKey";

ALTER TABLE "Outlet"
  DROP COLUMN IF EXISTS "bridgeSecret",
  DROP COLUMN IF EXISTS "bridgeSecretNext",
  DROP COLUMN IF EXISTS "bridgeSecretUpdatedAt";
