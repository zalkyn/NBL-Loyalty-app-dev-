-- AlterTable
ALTER TABLE "CustomerReward" ADD COLUMN     "discountUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" TEXT DEFAULT 'PENDING';
