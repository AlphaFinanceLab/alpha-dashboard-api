-- CreateTable
CREATE TABLE "IndicatorsV2ETH" (
    "timestamp" INTEGER NOT NULL,
    "indicators" JSONB NOT NULL,
    "lastEvent" JSONB NOT NULL,

    PRIMARY KEY ("timestamp")
);
