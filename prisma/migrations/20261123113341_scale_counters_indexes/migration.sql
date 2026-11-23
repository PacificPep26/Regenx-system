-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "onHand" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reserved" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "creditCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "outstandingCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shippingCents" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Customer_storeId_createdAt_idx" ON "Customer"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Customer_createdAt_idx" ON "Customer"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_audience_createdAt_idx" ON "Notification"("audience", "createdAt");

-- CreateIndex
CREATE INDEX "Order_storeId_createdAt_idx" ON "Order"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_storeId_status_idx" ON "Order"("storeId", "status");

-- CreateIndex
CREATE INDEX "Order_status_approvedAt_idx" ON "Order"("status", "approvedAt");

-- CreateIndex
CREATE INDEX "Order_submittedAt_idx" ON "Order"("submittedAt");

-- CreateIndex
CREATE INDEX "Order_approvedAt_idx" ON "Order"("approvedAt");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- ---------------------------------------------------------------------------
-- Denormalised counters. The journals (LedgerEntry, StockMovement) remain the
-- source of truth; triggers keep the cached totals in the same transaction, so
-- reading a balance is O(1) instead of summing the whole history on every page.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION ledger_apply() RETURNS trigger AS $$
DECLARE r "LedgerEntry"; sign int;
BEGIN
  IF TG_OP = 'INSERT' THEN r := NEW; sign := 1; ELSIF TG_OP = 'DELETE' THEN r := OLD; sign := -1; ELSE RETURN NEW; END IF;
  UPDATE "Store" SET
    "creditCents"      = "creditCents"      + CASE WHEN r.bucket = 'CREDIT'      THEN sign * r."amountCents" ELSE 0 END,
    "outstandingCents" = "outstandingCents" + CASE WHEN r.bucket = 'OUTSTANDING' THEN sign * r."amountCents" ELSE 0 END,
    "shippingCents"    = "shippingCents"    + CASE WHEN r.bucket = 'SHIPPING'    THEN sign * r."amountCents" ELSE 0 END
  WHERE id = r."storeId";
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_counters AFTER INSERT OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION ledger_apply();

CREATE OR REPLACE FUNCTION stock_apply() RETURNS trigger AS $$
DECLARE r "StockMovement"; sign int;
BEGIN
  IF TG_OP = 'INSERT' THEN r := NEW; sign := 1; ELSIF TG_OP = 'DELETE' THEN r := OLD; sign := -1; ELSE RETURN NEW; END IF;
  UPDATE "Product" SET "onHand" = "onHand" + sign * r."onHandDelta", "reserved" = "reserved" + sign * r."reservedDelta" WHERE id = r."productId";
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER stock_counters AFTER INSERT OR DELETE ON "StockMovement" FOR EACH ROW EXECUTE FUNCTION stock_apply();

-- backfill from the journals for data that already exists
UPDATE "Store" s SET
  "creditCents"      = COALESCE((SELECT SUM("amountCents") FROM "LedgerEntry" WHERE "storeId" = s.id AND bucket = 'CREDIT'), 0),
  "outstandingCents" = COALESCE((SELECT SUM("amountCents") FROM "LedgerEntry" WHERE "storeId" = s.id AND bucket = 'OUTSTANDING'), 0),
  "shippingCents"    = COALESCE((SELECT SUM("amountCents") FROM "LedgerEntry" WHERE "storeId" = s.id AND bucket = 'SHIPPING'), 0);
UPDATE "Product" p SET
  "onHand"   = COALESCE((SELECT SUM("onHandDelta")   FROM "StockMovement" WHERE "productId" = p.id), 0),
  "reserved" = COALESCE((SELECT SUM("reservedDelta") FROM "StockMovement" WHERE "productId" = p.id), 0);

-- ---------------------------------------------------------------------------
-- Substring search (ILIKE '%x%') stays fast on millions of rows with trigram indexes
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Customer_name_trgm"  ON "Customer" USING gin (name gin_trgm_ops);
CREATE INDEX "Customer_email_trgm" ON "Customer" USING gin (email gin_trgm_ops);
CREATE INDEX "Customer_phone_trgm" ON "Customer" USING gin (phone gin_trgm_ops);
CREATE INDEX "Order_shipName_trgm" ON "Order" USING gin ("shipName" gin_trgm_ops);
CREATE INDEX "Order_extRef_trgm"   ON "Order" USING gin ("externalRef" gin_trgm_ops);
CREATE INDEX "Order_tracking_trgm" ON "Order" USING gin ("trackingNo" gin_trgm_ops);
CREATE INDEX "Product_name_trgm"   ON "Product" USING gin (name gin_trgm_ops);
CREATE INDEX "Product_sku_trgm"    ON "Product" USING gin (sku gin_trgm_ops);
