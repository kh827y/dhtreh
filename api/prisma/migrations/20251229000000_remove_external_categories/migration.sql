-- Drop external category mapping table and fields.
DROP TABLE IF EXISTS "public"."ProductCategoryExternal";
DROP INDEX IF EXISTS "public"."ProductCategory_merchantId_externalProvider_externalId_idx";
ALTER TABLE "public"."ProductCategory" DROP COLUMN IF EXISTS "externalProvider", DROP COLUMN IF EXISTS "externalId";
