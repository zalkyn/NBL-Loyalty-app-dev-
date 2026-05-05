/*
  Warnings:

  - A unique constraint covering the columns `[rewardKey]` on the table `CustomerReward` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CustomerReward" ADD COLUMN     "event" TEXT,
ADD COLUMN     "rewardKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerReward_rewardKey_key" ON "CustomerReward"("rewardKey");
