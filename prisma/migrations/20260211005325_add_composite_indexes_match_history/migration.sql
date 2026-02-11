-- CreateIndex
CREATE INDEX "match_participants_puuid_championId_idx" ON "match_participants"("puuid", "championId");

-- CreateIndex
CREATE INDEX "match_participants_puuid_role_idx" ON "match_participants"("puuid", "role");

-- CreateIndex
CREATE INDEX "matches_queueId_gameCreation_idx" ON "matches"("queueId", "gameCreation" DESC);
