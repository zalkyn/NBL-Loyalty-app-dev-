/*
  Warnings:

  - A unique constraint covering the columns `[rewardId]` on the table `PointsTransaction` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "PointsTransaction" ADD COLUMN     "rewardId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "PointsTransaction_rewardId_key" ON "PointsTransaction"("rewardId");

-- AddForeignKey
ALTER TABLE "PointsTransaction" ADD CONSTRAINT "PointsTransaction_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "CustomerReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
