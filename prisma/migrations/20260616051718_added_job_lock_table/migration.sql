-- CreateTable
CREATE TABLE "JobLock" (
    "id" SERIAL NOT NULL,
    "jobName" TEXT NOT NULL,
    "isRunning" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobLock_jobName_key" ON "JobLock"("jobName");
