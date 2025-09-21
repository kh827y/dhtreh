-- Portal auth fields for Merchant
ALTER TABLE "public"."Merchant"
  ADD COLUMN IF NOT EXISTS "portalKeyHash" TEXT,
  ADD COLUMN IF NOT EXISTS "portalTotpSecret" TEXT,
  ADD COLUMN IF NOT EXISTS "portalTotpEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "portalLoginEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "portalLastLoginAt" TIMESTAMP(3);
