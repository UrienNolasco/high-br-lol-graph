-- This pre-production migration requires an empty match/statistics dataset.
-- No historical raw payloads exist from which the old aggregates can be repaired.
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM matches) OR EXISTS (SELECT 1 FROM champion_stats)
     OR EXISTS (SELECT 1 FROM player_stats) OR EXISTS (SELECT 1 FROM player_champion_stats) THEN
    RAISE EXCEPTION 'Reliable processing requires an empty development match/statistics dataset; migration aborted without changing data';
  END IF;
END $$;

/*
  Warnings:

  - You are about to drop the column `cspm` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `dpm` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `gpm` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `kda` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `winRate` on the `champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgCsd15` on the `player_champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgCspm` on the `player_champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgDpm` on the `player_champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgGd15` on the `player_champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgGpm` on the `player_champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgKda` on the `player_champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgVisionScore` on the `player_champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgXpd15` on the `player_champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `winRate` on the `player_champion_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgCspm` on the `player_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgDpm` on the `player_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgGpm` on the `player_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgKda` on the `player_stats` table. All the data in the column will be lost.
  - You are about to drop the column `avgVisionScore` on the `player_stats` table. All the data in the column will be lost.
  - You are about to drop the column `topChampions` on the `player_stats` table. All the data in the column will be lost.
  - You are about to drop the column `winRate` on the `player_stats` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[matchId,teamId]` on the table `match_teams` will be added. If there are existing duplicate values, this will fail.
  - Made the column `patch` on table `player_champion_stats` required. This step will fail if there are existing NULL values in that column.
  - Made the column `patch` on table `player_stats` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY_WAIT', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "champion_stats" DROP COLUMN "cspm",
DROP COLUMN "dpm",
DROP COLUMN "gpm",
DROP COLUMN "kda",
DROP COLUMN "winRate",
ADD COLUMN     "sumCspm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumDpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumGpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumKda" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "match_participants" ADD COLUMN     "totalCs" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "player_champion_stats" DROP COLUMN "avgCsd15",
DROP COLUMN "avgCspm",
DROP COLUMN "avgDpm",
DROP COLUMN "avgGd15",
DROP COLUMN "avgGpm",
DROP COLUMN "avgKda",
DROP COLUMN "avgVisionScore",
DROP COLUMN "avgXpd15",
DROP COLUMN "winRate",
ADD COLUMN     "laningSamples" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sumCsd15" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumCspm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumDpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumGd15" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumGpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumKda" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumVisionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumXpd15" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "patch" SET NOT NULL;

-- AlterTable
ALTER TABLE "player_stats" DROP COLUMN "avgCspm",
DROP COLUMN "avgDpm",
DROP COLUMN "avgGpm",
DROP COLUMN "avgKda",
DROP COLUMN "avgVisionScore",
DROP COLUMN "topChampions",
DROP COLUMN "winRate",
ADD COLUMN     "sumCspm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumDpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumGpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumKda" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sumVisionScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "patch" SET NOT NULL;

-- CreateTable
CREATE TABLE "match_processing" (
    "matchId" TEXT NOT NULL,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "traceId" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastError" TEXT,
    "processingVersion" INTEGER,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_processing_pkey" PRIMARY KEY ("matchId")
);

-- CreateTable
CREATE TABLE "match_raw" (
    "matchId" TEXT NOT NULL,
    "summary" BYTEA,
    "timeline" BYTEA,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_raw_pkey" PRIMARY KEY ("matchId")
);

-- CreateTable
CREATE TABLE "processing_maintenance" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "rebuilding" BOOLEAN NOT NULL DEFAULT false,
    "targetVersion" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "processing_maintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_processing_status_nextAttemptAt_publishedAt_idx" ON "match_processing"("status", "nextAttemptAt", "publishedAt");

-- CreateIndex
CREATE INDEX "match_processing_status_leaseUntil_idx" ON "match_processing"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "match_teams_matchId_teamId_key" ON "match_teams"("matchId", "teamId");

-- AddForeignKey
ALTER TABLE "match_raw" ADD CONSTRAINT "match_raw_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "match_processing"("matchId") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
