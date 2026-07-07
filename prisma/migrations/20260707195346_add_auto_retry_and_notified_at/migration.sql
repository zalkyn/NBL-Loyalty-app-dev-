ALTER TABLE "Job" ADD COLUMN "autoRetryCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Transaction" ADD COLUMN "notifiedAt" TIMESTAMP(3);
CREATE INDEX "Transaction_customerId_notifiedAt_idx" ON "Transaction"("customerId", "notifiedAt");
