-- Add portal auth revocation and refresh token storage.
ALTER TABLE "Merchant"
  ADD COLUMN IF NOT EXISTS "portalTokensRevokedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "portalRefreshTokenHash" TEXT;

ALTER TABLE "Staff"
  ADD COLUMN IF NOT EXISTS "portalTokensRevokedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "portalRefreshTokenHash" TEXT;
