-- CreateTable
CREATE TABLE "ShadowRule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rateType" TEXT NOT NULL,
    "fixedPoints" INTEGER,
    "perAmount" DOUBLE PRECISION,
    "pointsPerUnit" INTEGER,
    "maxPoints" INTEGER,
    "currencyCode" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "ShadowRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsBackfillEntry" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "shadowRuleId" INTEGER NOT NULL,
    "customerId" INTEGER NOT NULL,
    "amountSpent" DOUBLE PRECISION NOT NULL,
    "pointsAwarded" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "transactionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsBackfillEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackfillAudienceSnapshot" (
    "id" SERIAL NOT NULL,
    "segmentId" TEXT NOT NULL,
    "segmentName" TEXT NOT NULL,
    "segmentQuery" TEXT,
    "status" TEXT NOT NULL DEFAULT 'BUILDING',
    "reportedTotalCount" INTEGER,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "projectedTotalPoints" INTEGER NOT NULL DEFAULT 0,
    "buildCursor" TEXT,
    "gidChecked" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "shadowRuleId" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "builtAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "BackfillAudienceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackfillAudienceMember" (
    "id" SERIAL NOT NULL,
    "snapshotId" INTEGER NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "displayName" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "amountSpent" DOUBLE PRECISION NOT NULL,
    "currencyCode" TEXT,
    "projectedPoints" INTEGER NOT NULL DEFAULT 0,
    "skipReason" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackfillAudienceMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShadowRule_sessionId_idx" ON "ShadowRule"("sessionId");

-- CreateIndex
CREATE INDEX "ShadowRule_isActive_idx" ON "ShadowRule"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PointsBackfillEntry_transactionId_key" ON "PointsBackfillEntry"("transactionId");

-- CreateIndex
CREATE INDEX "PointsBackfillEntry_jobId_idx" ON "PointsBackfillEntry"("jobId");

-- CreateIndex
CREATE INDEX "PointsBackfillEntry_customerId_idx" ON "PointsBackfillEntry"("customerId");

-- CreateIndex
CREATE INDEX "PointsBackfillEntry_status_idx" ON "PointsBackfillEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PointsBackfillEntry_shadowRuleId_customerId_key" ON "PointsBackfillEntry"("shadowRuleId", "customerId");

-- CreateIndex
CREATE INDEX "BackfillAudienceSnapshot_sessionId_shadowRuleId_createdAt_idx" ON "BackfillAudienceSnapshot"("sessionId", "shadowRuleId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BackfillAudienceSnapshot_status_idx" ON "BackfillAudienceSnapshot"("status");

-- CreateIndex
CREATE INDEX "BackfillAudienceMember_snapshotId_processed_id_idx" ON "BackfillAudienceMember"("snapshotId", "processed", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BackfillAudienceMember_snapshotId_shopifyId_key" ON "BackfillAudienceMember"("snapshotId", "shopifyId");

-- AddForeignKey
ALTER TABLE "ShadowRule" ADD CONSTRAINT "ShadowRule_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsBackfillEntry" ADD CONSTRAINT "PointsBackfillEntry_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsBackfillEntry" ADD CONSTRAINT "PointsBackfillEntry_shadowRuleId_fkey" FOREIGN KEY ("shadowRuleId") REFERENCES "ShadowRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsBackfillEntry" ADD CONSTRAINT "PointsBackfillEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsBackfillEntry" ADD CONSTRAINT "PointsBackfillEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackfillAudienceSnapshot" ADD CONSTRAINT "BackfillAudienceSnapshot_shadowRuleId_fkey" FOREIGN KEY ("shadowRuleId") REFERENCES "ShadowRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackfillAudienceSnapshot" ADD CONSTRAINT "BackfillAudienceSnapshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BackfillAudienceMember" ADD CONSTRAINT "BackfillAudienceMember_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "BackfillAudienceSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
