/*
  Warnings:

  - The primary key for the `champion_stats` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `bans` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `totalAssists` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `totalCreepScore` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `totalDamageDealt` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `totalDeaths` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `totalDuration` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `totalGoldEarned` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `totalKills` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the `matchup_stats` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `processed_matches` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[championId,patch,queueId]` on the table `champion_stats` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `championName` to the `champion_stats` table without a default value. This is not possible if the table is not empty.
  - Added the required column `queueId` to the `champion_stats` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "champion_stats" DROP CONSTRAINT "champion_stats_pkey",
DROP COLUMN "bans",
DROP COLUMN "totalAssists",
DROP COLUMN "totalCreepScore",
DROP COLUMN "totalDamageDealt",
DROP COLUMN "totalDeaths",
DROP COLUMN "totalDuration",
DROP COLUMN "totalGoldEarned",
DROP COLUMN "totalKills",
ADD COLUMN     "banRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "championName" TEXT NOT NULL,
ADD COLUMN     "cspm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "dpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "gpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "id" SERIAL NOT NULL,
ADD COLUMN     "kda" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "losses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pickRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "queueId" INTEGER NOT NULL,
ADD COLUMN     "rank" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tier" TEXT NOT NULL DEFAULT 'C',
ADD COLUMN     "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD CONSTRAINT "champion_stats_pkey" PRIMARY KEY ("id");

-- DropTable
DROP TABLE "public"."matchup_stats";

-- DropTable
DROP TABLE "public"."processed_matches";

-- CreateTable
CREATE TABLE "matches" (
    "matchId" TEXT NOT NULL,
    "gameCreation" BIGINT NOT NULL,
    "gameDuration" INTEGER NOT NULL,
    "gameMode" TEXT NOT NULL,
    "queueId" INTEGER NOT NULL,
    "gameVersion" TEXT NOT NULL,
    "mapId" INTEGER NOT NULL,
    "hasTimeline" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "matches_pkey" PRIMARY KEY ("matchId")
);

-- CreateTable
CREATE TABLE "match_participants" (
    "matchId" TEXT NOT NULL,
    "puuid" TEXT NOT NULL,
    "summonerName" TEXT NOT NULL,
    "championId" INTEGER NOT NULL,
    "championName" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "win" BOOLEAN NOT NULL,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "kda" DOUBLE PRECISION NOT NULL,
    "goldEarned" INTEGER NOT NULL,
    "totalDamage" INTEGER NOT NULL,
    "visionScore" INTEGER NOT NULL,
    "goldGraph" INTEGER[],
    "xpGraph" INTEGER[],
    "csGraph" INTEGER[],
    "damageGraph" INTEGER[],
    "deathPositions" JSONB NOT NULL,
    "killPositions" JSONB NOT NULL,
    "wardPositions" JSONB NOT NULL,
    "pathingSample" JSONB NOT NULL,
    "skillOrder" TEXT[],
    "itemTimeline" JSONB NOT NULL,
    "runes" JSONB NOT NULL,
    "challenges" JSONB NOT NULL,
    "pings" JSONB NOT NULL,
    "spells" INTEGER[],

    CONSTRAINT "match_participants_pkey" PRIMARY KEY ("matchId","puuid")
);

-- CreateTable
CREATE TABLE "match_teams" (
    "id" SERIAL NOT NULL,
    "matchId" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "win" BOOLEAN NOT NULL,
    "bans" INTEGER[],
    "objectivesTimeline" JSONB NOT NULL,

    CONSTRAINT "match_teams_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matches_queueId_idx" ON "matches"("queueId");

-- CreateIndex
CREATE INDEX "match_participants_puuid_idx" ON "match_participants"("puuid");

-- CreateIndex
CREATE INDEX "match_participants_championId_idx" ON "match_participants"("championId");

-- CreateIndex
CREATE INDEX "champion_stats_patch_queueId_idx" ON "champion_stats"("patch", "queueId");

-- CreateIndex
CREATE UNIQUE INDEX "champion_stats_championId_patch_queueId_key" ON "champion_stats"("championId", "patch", "queueId");

-- AddForeignKey
ALTER TABLE "match_participants" ADD CONSTRAINT "match_participants_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("matchId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_teams" ADD CONSTRAINT "match_teams_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("matchId") ON DELETE CASCADE ON UPDATE CASCADE;
