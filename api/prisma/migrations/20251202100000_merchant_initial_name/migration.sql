-- AlterTable
ALTER TABLE "Merchant" ADD COLUMN     "initialName" TEXT;

UPDATE "Merchant" SET "initialName" = COALESCE("name", '');

ALTER TABLE "Merchant" ALTER COLUMN "initialName" SET NOT NULL;
