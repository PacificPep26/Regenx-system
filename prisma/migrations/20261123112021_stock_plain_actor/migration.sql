/*
  Warnings:

  - You are about to drop the column `storeId` on the `StockMovement` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_createdById_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_storeId_fkey";

-- AlterTable
ALTER TABLE "StockMovement" DROP COLUMN "storeId";
