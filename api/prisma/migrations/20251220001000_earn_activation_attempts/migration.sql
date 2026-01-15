-- Add activation retry tracking for delayed earn lots
ALTER TABLE "EarnLot"
ADD COLUMN "activationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "activationLastError" TEXT;
