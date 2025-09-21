-- Add portalEmail and portalPasswordHash to Merchant
ALTER TABLE "public"."Merchant"
  ADD COLUMN IF NOT EXISTS "portalEmail" TEXT,
  ADD COLUMN IF NOT EXISTS "portalPasswordHash" TEXT;

-- Unique index on portalEmail
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'Merchant_portalEmail_key'
  ) THEN
    CREATE UNIQUE INDEX "Merchant_portalEmail_key" ON "public"."Merchant" ("portalEmail");
  END IF;
END $$;
