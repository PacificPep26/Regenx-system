-- AlterTable
ALTER TABLE "StoreStock" ADD COLUMN     "lowNotified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reorderLevel" INTEGER NOT NULL DEFAULT 0;
