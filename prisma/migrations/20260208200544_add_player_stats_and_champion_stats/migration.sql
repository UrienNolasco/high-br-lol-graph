-- CreateTable
CREATE TABLE "player_stats" (
    "id" SERIAL NOT NULL,
    "puuid" TEXT NOT NULL,
    "patch" TEXT,
    "queueId" INTEGER NOT NULL DEFAULT 420,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgKda" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgDpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgCspm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgGpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgVisionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roleDistribution" JSONB NOT NULL DEFAULT '{}',
    "topChampions" JSONB NOT NULL DEFAULT '[]',
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_champion_stats" (
    "id" SERIAL NOT NULL,
    "puuid" TEXT NOT NULL,
    "championId" INTEGER NOT NULL,
    "patch" TEXT,
    "queueId" INTEGER NOT NULL DEFAULT 420,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgKda" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgDpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgCspm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgGpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgVisionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgCsd15" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgGd15" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgXpd15" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "roleDistribution" JSONB NOT NULL DEFAULT '{}',
    "lastPlayedAt" TIMESTAMP(3),

    CONSTRAINT "player_champion_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "player_stats_puuid_idx" ON "player_stats"("puuid");

-- CreateIndex
CREATE INDEX "player_stats_puuid_patch_idx" ON "player_stats"("puuid", "patch");

-- CreateIndex
CREATE UNIQUE INDEX "player_stats_puuid_patch_queueId_key" ON "player_stats"("puuid", "patch", "queueId");

-- CreateIndex
CREATE INDEX "player_champion_stats_puuid_idx" ON "player_champion_stats"("puuid");

-- CreateIndex
CREATE INDEX "player_champion_stats_puuid_lastPlayedAt_idx" ON "player_champion_stats"("puuid", "lastPlayedAt");

-- CreateIndex
CREATE INDEX "player_champion_stats_championId_idx" ON "player_champion_stats"("championId");

-- CreateIndex
CREATE UNIQUE INDEX "player_champion_stats_puuid_championId_patch_queueId_key" ON "player_champion_stats"("puuid", "championId", "patch", "queueId");
