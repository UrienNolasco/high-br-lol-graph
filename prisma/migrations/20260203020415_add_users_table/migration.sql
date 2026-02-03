-- CreateTable
CREATE TABLE "users" (
    "puuid" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "tagLine" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'br1',
    "profileIconId" INTEGER,
    "summonerLevel" INTEGER,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("puuid")
);

-- CreateIndex
CREATE INDEX "users_gameName_idx" ON "users"("gameName");

-- CreateIndex
CREATE UNIQUE INDEX "users_gameName_tagLine_region_key" ON "users"("gameName", "tagLine", "region");
