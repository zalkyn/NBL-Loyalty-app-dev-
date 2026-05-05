-- DropIndex
DROP INDEX "CustomerReward_code_key";

-- AlterTable
ALTER TABLE "CustomerReward" ADD COLUMN     "description" TEXT,
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "pointsCost" INTEGER,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "type" TEXT,
ALTER COLUMN "rewardId" DROP NOT NULL,
ALTER COLUMN "code" DROP NOT NULL;
