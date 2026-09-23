-- Append-only observations, independent of materialized matches and queue priority.
CREATE TABLE "discovery_observations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "source" TEXT NOT NULL CHECK ("source" IN ('collector', 'search', 'sync')),
  "observedAt" TIMESTAMP(3) NOT NULL,
  "region" TEXT,
  "queriedPuuid" TEXT NOT NULL,
  "queueFilter" INTEGER,
  "requestedCount" INTEGER NOT NULL CHECK ("requestedCount" >= 0),
  "startIndex" INTEGER NOT NULL CHECK ("startIndex" >= 0),
  "rankTier" TEXT,
  "rankDivision" TEXT,
  "rankLeaguePoints" INTEGER,
  "rankQueue" TEXT,
  "rankObservedAt" TIMESTAMP(3),
  "lineageVersion" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "observed_rank_requires_timestamp" CHECK (
    ("rankTier" IS NULL AND "rankDivision" IS NULL AND "rankLeaguePoints" IS NULL AND "rankQueue" IS NULL AND "rankObservedAt" IS NULL)
    OR ("rankTier" IS NOT NULL AND "rankQueue" IS NOT NULL AND "rankObservedAt" IS NOT NULL)
  )
);
CREATE TABLE "match_discoveries" (
  "observationId" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  PRIMARY KEY ("observationId", "matchId"),
  FOREIGN KEY ("observationId") REFERENCES "discovery_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "discovery_observations_source_observedAt_idx" ON "discovery_observations"("source", "observedAt");
CREATE INDEX "discovery_observations_queriedPuuid_observedAt_idx" ON "discovery_observations"("queriedPuuid", "observedAt");
CREATE INDEX "match_discoveries_matchId_idx" ON "match_discoveries"("matchId");
-- Existing history is deliberately not backfilled with guessed source/rank.
