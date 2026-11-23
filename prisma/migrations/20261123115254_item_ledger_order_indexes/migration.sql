-- DropIndex
DROP INDEX "Customer_email_trgm";

-- DropIndex
DROP INDEX "Customer_name_trgm";

-- DropIndex
DROP INDEX "Customer_phone_trgm";

-- DropIndex
DROP INDEX "Order_extRef_trgm";

-- DropIndex
DROP INDEX "Order_shipName_trgm";

-- DropIndex
DROP INDEX "Order_tracking_trgm";

-- DropIndex
DROP INDEX "Product_name_trgm";

-- DropIndex
DROP INDEX "Product_sku_trgm";

-- CreateIndex
CREATE INDEX "LedgerEntry_orderId_idx" ON "LedgerEntry"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");
