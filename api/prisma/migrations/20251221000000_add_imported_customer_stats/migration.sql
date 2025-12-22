ALTER TABLE "CustomerStats"
ADD COLUMN "importedVisits" INTEGER,
ADD COLUMN "importedTotalSpent" INTEGER,
ADD COLUMN "importedLastPurchaseAt" TIMESTAMP(3);
