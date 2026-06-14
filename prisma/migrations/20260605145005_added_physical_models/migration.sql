-- CreateTable
CREATE TABLE "PhysicalPrize" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "productValue" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "PhysicalPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhysicalPrizeClaim" (
    "id" SERIAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pointsCost" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fulfilledAt" TIMESTAMP(3),
    "customerId" INTEGER NOT NULL,
    "physicalPrizeId" INTEGER NOT NULL,
    "transactionId" INTEGER,

    CONSTRAINT "PhysicalPrizeClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PhysicalPrize_sessionId_idx" ON "PhysicalPrize"("sessionId");

-- CreateIndex
CREATE INDEX "PhysicalPrize_isActive_idx" ON "PhysicalPrize"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalPrizeClaim_transactionId_key" ON "PhysicalPrizeClaim"("transactionId");

-- CreateIndex
CREATE INDEX "PhysicalPrizeClaim_customerId_idx" ON "PhysicalPrizeClaim"("customerId");

-- CreateIndex
CREATE INDEX "PhysicalPrizeClaim_physicalPrizeId_idx" ON "PhysicalPrizeClaim"("physicalPrizeId");

-- CreateIndex
CREATE INDEX "PhysicalPrizeClaim_status_idx" ON "PhysicalPrizeClaim"("status");

-- AddForeignKey
ALTER TABLE "PhysicalPrize" ADD CONSTRAINT "PhysicalPrize_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalPrizeClaim" ADD CONSTRAINT "PhysicalPrizeClaim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalPrizeClaim" ADD CONSTRAINT "PhysicalPrizeClaim_physicalPrizeId_fkey" FOREIGN KEY ("physicalPrizeId") REFERENCES "PhysicalPrize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalPrizeClaim" ADD CONSTRAINT "PhysicalPrizeClaim_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
