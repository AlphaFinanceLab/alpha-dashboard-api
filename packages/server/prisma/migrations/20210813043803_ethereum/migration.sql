-- CreateTable
CREATE TABLE "IndicatorsETH" (
    "timestamp" INTEGER NOT NULL,
    "indicators" JSONB NOT NULL,
    "lastEvent" JSONB NOT NULL,

    PRIMARY KEY ("timestamp")
);

-- CreateTable
CREATE TABLE "PositionWithSharesETH" (
    "id" INTEGER NOT NULL,
    "goblin" VARCHAR(255) NOT NULL,
    "owner" VARCHAR(255) NOT NULL,
    "debtShare" VARCHAR(255) NOT NULL,
    "goblinPayload" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventsETH" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "EventErrorsETH" (
    "id" TEXT NOT NULL,
    "startBlock" INTEGER NOT NULL,
    "endBlock" INTEGER NOT NULL,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventsETH_logIndex_transactionHash_unique_constraint" ON "EventsETH"("logIndex", "transactionHash");
