ALTER TABLE "Transaction" ADD COLUMN "canceledAt" TIMESTAMP(3);
ALTER TABLE "Transaction" ADD COLUMN "canceledByStaffId" TEXT;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_canceledByStaffId_fkey" FOREIGN KEY ("canceledByStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
