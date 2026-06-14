-- AlterTable
ALTER TABLE "PhysicalPrizeClaim" ADD COLUMN     "viewedAt" TIMESTAMP(3),
ADD COLUMN     "viewedByAdmin" BOOLEAN NOT NULL DEFAULT false;
