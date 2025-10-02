-- Add transactionId column to link reviews with concrete loyalty transactions
ALTER TABLE "Review"
ADD COLUMN "transactionId" TEXT;

-- Ensure each transaction can produce at most one review
CREATE UNIQUE INDEX "Review_transactionId_key"
  ON "Review"("transactionId")
  WHERE "transactionId" IS NOT NULL;

-- Provide referential integrity to transactions
ALTER TABLE "Review"
ADD CONSTRAINT "Review_transactionId_fkey"
FOREIGN KEY ("transactionId")
REFERENCES "Transaction"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
