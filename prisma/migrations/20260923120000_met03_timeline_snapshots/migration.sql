CREATE TABLE "match_timeline_projections" (
  "matchId" TEXT NOT NULL,
  "projectionVersion" INTEGER NOT NULL,
  "frameIntervalMs" INTEGER,
  "observedEndMs" INTEGER,
  "frames" JSONB NOT NULL,
  CONSTRAINT "match_timeline_projections_pkey" PRIMARY KEY ("matchId"),
  CONSTRAINT "match_timeline_projections_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("matchId") ON DELETE CASCADE ON UPDATE CASCADE
);
