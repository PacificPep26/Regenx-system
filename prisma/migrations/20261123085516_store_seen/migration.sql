-- CreateTable
CREATE TABLE "StoreSeen" (
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "ordersSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreSeen_pkey" PRIMARY KEY ("userId","storeId")
);

-- AddForeignKey
ALTER TABLE "StoreSeen" ADD CONSTRAINT "StoreSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreSeen" ADD CONSTRAINT "StoreSeen_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
