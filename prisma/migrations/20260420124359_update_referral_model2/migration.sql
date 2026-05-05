-- AlterTable
ALTER TABLE "Referral" ADD COLUMN     "subscriptionContractId" INTEGER;

-- CreateIndex
CREATE INDEX "Referral_subscriptionContractId_idx" ON "Referral"("subscriptionContractId");
