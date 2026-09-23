-- Nullable additions preserve legacy rows without fabricating observations.
ALTER TABLE "matches" ADD COLUMN "finalContext" JSONB;
ALTER TABLE "match_participants"
  ADD COLUMN "riotIdGameName" TEXT,
  ADD COLUMN "riotIdTagline" TEXT,
  ADD COLUMN "finalStats" JSONB;
ALTER TABLE "match_teams" ADD COLUMN "finalObjectives" JSONB;
