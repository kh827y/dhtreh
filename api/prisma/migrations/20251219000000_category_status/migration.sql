-- CreateEnum
CREATE TYPE "public"."ProductCategoryStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "public"."ProductCategory" ADD COLUMN     "status" "public"."ProductCategoryStatus" NOT NULL DEFAULT 'ACTIVE';
