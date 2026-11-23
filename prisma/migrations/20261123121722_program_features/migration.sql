-- CreateEnum
CREATE TYPE "InsuranceStatus" AS ENUM ('NONE', 'REQUESTED', 'ACTIVE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "upc" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "insuranceNote" TEXT,
ADD COLUMN     "insuranceStatus" "InsuranceStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "labelNotes" TEXT;

-- CreateTable
CREATE TABLE "ProductDoc" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductDoc_productId_idx" ON "ProductDoc"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_storeId_idx" ON "ApiKey"("storeId");

-- AddForeignKey
ALTER TABLE "ProductDoc" ADD CONSTRAINT "ProductDoc_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
