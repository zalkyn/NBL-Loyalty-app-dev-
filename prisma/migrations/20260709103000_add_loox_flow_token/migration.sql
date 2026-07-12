-- AlterTable
ALTER TABLE "AppSettings" ADD COLUMN "looxFlowToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AppSettings_looxFlowToken_key" ON "AppSettings"("looxFlowToken");
