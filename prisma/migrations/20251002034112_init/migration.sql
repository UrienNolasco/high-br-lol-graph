-- CreateTable
CREATE TABLE "processed_matches" (
    "matchId" TEXT NOT NULL,
    "patch" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_matches_pkey" PRIMARY KEY ("matchId")
);

-- CreateTable
CREATE TABLE "champion_stats" (
    "patch" TEXT NOT NULL,
    "championId" INTEGER NOT NULL,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "champion_stats_pkey" PRIMARY KEY ("patch","championId")
);

-- CreateTable
CREATE TABLE "matchup_stats" (
    "patch" TEXT NOT NULL,
    "championId1" INTEGER NOT NULL,
    "championId2" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "champion1Wins" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "matchup_stats_pkey" PRIMARY KEY ("patch","championId1","championId2","role")
);
