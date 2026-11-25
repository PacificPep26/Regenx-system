-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED');

-- CreateTable
CREATE TABLE "GpPayout" (
    "id" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "method" TEXT,
    "reference" TEXT,

    CONSTRAINT "GpPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GpPayout_status_requestedAt_idx" ON "GpPayout"("status", "requestedAt");
