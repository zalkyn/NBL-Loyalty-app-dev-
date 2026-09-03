-- CreateTable
CREATE TABLE "SubscriptionCancelEvent" (
    "id" SERIAL NOT NULL,
    "shop" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "customerId" INTEGER,
    "customerShopifyId" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerName" TEXT,
    "subscriptionContractId" TEXT NOT NULL,
    "previousBalance" INTEGER NOT NULL,
    "resetApplied" BOOLEAN NOT NULL DEFAULT false,
    "resolvedManually" BOOLEAN NOT NULL DEFAULT false,
    "skipReason" TEXT,
    "transactionId" INTEGER,
    "svixId" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionCancelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionCancelEvent_transactionId_key" ON "SubscriptionCancelEvent"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionCancelEvent_svixId_key" ON "SubscriptionCancelEvent"("svixId");

-- CreateIndex
CREATE INDEX "SubscriptionCancelEvent_shop_idx" ON "SubscriptionCancelEvent"("shop");

-- CreateIndex
CREATE INDEX "SubscriptionCancelEvent_sessionId_idx" ON "SubscriptionCancelEvent"("sessionId");

-- CreateIndex
CREATE INDEX "SubscriptionCancelEvent_shop_resetApplied_idx" ON "SubscriptionCancelEvent"("shop", "resetApplied");

-- CreateIndex
CREATE INDEX "SubscriptionCancelEvent_customerId_idx" ON "SubscriptionCancelEvent"("customerId");

-- CreateIndex
CREATE INDEX "SubscriptionCancelEvent_cancelledAt_idx" ON "SubscriptionCancelEvent"("cancelledAt");

-- AddForeignKey
ALTER TABLE "SubscriptionCancelEvent" ADD CONSTRAINT "SubscriptionCancelEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionCancelEvent" ADD CONSTRAINT "SubscriptionCancelEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionCancelEvent" ADD CONSTRAINT "SubscriptionCancelEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
