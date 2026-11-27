-- CreateEnum
CREATE TYPE "InventoryStatus" AS ENUM ('DRAFT', 'ON_HOLD', 'APPROVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StoreStockType" AS ENUM ('RECEIPT', 'ADJUST', 'RESERVE', 'RELEASE', 'SHIP');

-- CreateEnum
CREATE TYPE "TopUpStatus" AS ENUM ('REQUESTED', 'DONE', 'DISMISSED');

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "inventoryOrderId" TEXT;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "inventoryMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "nextInventoryNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "InventoryOrder" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" "InventoryStatus" NOT NULL DEFAULT 'DRAFT',
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountBps" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "creditAppliedCents" INTEGER NOT NULL DEFAULT 0,
    "overageCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "InventoryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,

    CONSTRAINT "InventoryOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreStockMovement" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "StoreStockType" NOT NULL,
    "onHandDelta" INTEGER NOT NULL DEFAULT 0,
    "reservedDelta" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "inventoryOrderId" TEXT,
    "memo" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreStock" (
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StoreStock_pkey" PRIMARY KEY ("storeId","productId")
);

-- CreateTable
CREATE TABLE "TopUpRequest" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "status" "TopUpStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "TopUpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryOrder_status_idx" ON "InventoryOrder"("status");

-- CreateIndex
CREATE INDEX "InventoryOrder_storeId_createdAt_idx" ON "InventoryOrder"("storeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryOrder_storeId_number_key" ON "InventoryOrder"("storeId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryOrderItem_orderId_productId_key" ON "InventoryOrderItem"("orderId", "productId");

-- CreateIndex
CREATE INDEX "StoreStockMovement_storeId_productId_idx" ON "StoreStockMovement"("storeId", "productId");

-- CreateIndex
CREATE INDEX "StoreStockMovement_orderId_idx" ON "StoreStockMovement"("orderId");

-- CreateIndex
CREATE INDEX "StoreStockMovement_inventoryOrderId_idx" ON "StoreStockMovement"("inventoryOrderId");

-- CreateIndex
CREATE INDEX "TopUpRequest_storeId_status_idx" ON "TopUpRequest"("storeId", "status");

-- CreateIndex
CREATE INDEX "TopUpRequest_status_createdAt_idx" ON "TopUpRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_inventoryOrderId_idx" ON "LedgerEntry"("inventoryOrderId");

-- AddForeignKey
ALTER TABLE "InventoryOrder" ADD CONSTRAINT "InventoryOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryOrderItem" ADD CONSTRAINT "InventoryOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "InventoryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryOrderItem" ADD CONSTRAINT "InventoryOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreStock" ADD CONSTRAINT "StoreStock_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreStock" ADD CONSTRAINT "StoreStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopUpRequest" ADD CONSTRAINT "TopUpRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- StoreStock is a trigger-maintained cache of StoreStockMovement (same idea as stock_counters on Product)
CREATE OR REPLACE FUNCTION store_stock_apply() RETURNS trigger AS $$
DECLARE r "StoreStockMovement"; sign int;
BEGIN
  IF TG_OP = 'INSERT' THEN r := NEW; sign := 1; ELSIF TG_OP = 'DELETE' THEN r := OLD; sign := -1; ELSE RETURN NEW; END IF;
  INSERT INTO "StoreStock" ("storeId", "productId", "onHand", "reserved")
    VALUES (r."storeId", r."productId", sign * r."onHandDelta", sign * r."reservedDelta")
  ON CONFLICT ("storeId", "productId") DO UPDATE
    SET "onHand" = "StoreStock"."onHand" + sign * r."onHandDelta", "reserved" = "StoreStock"."reserved" + sign * r."reservedDelta";
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER store_stock_counters AFTER INSERT OR DELETE ON "StoreStockMovement" FOR EACH ROW EXECUTE FUNCTION store_stock_apply();
