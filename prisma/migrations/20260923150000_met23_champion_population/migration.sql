ALTER TABLE "matches" ADD COLUMN "populationEligible" BOOLEAN,
  ADD COLUMN "populationExclusionReason" TEXT;
ALTER TABLE "match_teams" ADD COLUMN "bansAvailable" BOOLEAN;
CREATE INDEX "matches_queueId_mapId_gameVersion_idx" ON "matches"("queueId", "mapId", "gameVersion");
