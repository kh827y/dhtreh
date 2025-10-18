ALTER TABLE "public"."CustomerStats"
ADD COLUMN "miniappPlatforms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
