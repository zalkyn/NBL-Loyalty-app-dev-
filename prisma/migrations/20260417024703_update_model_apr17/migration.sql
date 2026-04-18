/*
  Warnings:

  - You are about to drop the column `referenceId` on the `PointsTransaction` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "PointsTransaction_referenceId_idx";

-- AlterTable
ALTER TABLE "PointsTransaction" DROP COLUMN "referenceId";
