-- AlterTable
ALTER TABLE "PointsTransaction" ADD COLUMN     "pointsRuleId" INTEGER;

-- AddForeignKey
ALTER TABLE "PointsTransaction" ADD CONSTRAINT "PointsTransaction_pointsRuleId_fkey" FOREIGN KEY ("pointsRuleId") REFERENCES "PointsRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
