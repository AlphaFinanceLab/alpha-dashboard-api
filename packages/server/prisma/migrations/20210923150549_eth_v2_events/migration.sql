-- CreateTable
CREATE TABLE "EventsV2ETH" (
    "logIndex" INTEGER NOT NULL,
    "transactionHash" VARCHAR(255) NOT NULL,
    "transactionIndex" INTEGER NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "blockNumber" INTEGER NOT NULL,
    "event" VARCHAR(255) NOT NULL,
    "returnValues" JSONB,
    "contextValues" JSONB,
    "positionId" INTEGER,
    "timestamp" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "irrelevant" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "EventErrorsV2ETH" (
    "id" TEXT NOT NULL,
    "startBlock" INTEGER NOT NULL,
    "endBlock" INTEGER NOT NULL,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventsV2ETH_logIndex_transactionHash_unique_constraint" ON "EventsV2ETH"("logIndex", "transactionHash");
