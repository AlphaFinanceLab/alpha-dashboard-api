-- CreateTable
CREATE TABLE "PositionWithSharesV2ETH" (
    "id" INTEGER NOT NULL,
    "owner" VARCHAR(255) NOT NULL,
    "payload" JSONB,
    "irrelevant" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("id")
);
