-- CreateIndex
CREATE INDEX "Customer_sessionId_enrolledAt_idx" ON "Customer"("sessionId", "enrolledAt" DESC);

-- CreateIndex
CREATE INDEX "Customer_sessionId_points_idx" ON "Customer"("sessionId", "points" DESC);

-- CreateIndex
CREATE INDEX "Customer_sessionId_name_idx" ON "Customer"("sessionId", "name");

-- CreateIndex
CREATE INDEX "Customer_sessionId_email_idx" ON "Customer"("sessionId", "email");
