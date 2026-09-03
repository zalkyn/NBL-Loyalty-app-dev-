-- AlterTable
ALTER TABLE "SubscriptionCancelEvent" ADD COLUMN     "lastRestoredAt" TIMESTAMP(3),
ADD COLUMN     "restoredAmount" INTEGER NOT NULL DEFAULT 0;
