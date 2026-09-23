-- CreateTable
CREATE TABLE "match_event_projections" (
    "matchId" TEXT NOT NULL,
    "frameIndex" INTEGER NOT NULL,
    "eventIndex" INTEGER NOT NULL,
    "type" TEXT,
    "timestampMs" INTEGER,
    "frameTimestampMs" INTEGER,
    "actorParticipantId" INTEGER,
    "actorPuuid" TEXT,
    "victimParticipantId" INTEGER,
    "victimPuuid" TEXT,
    "assistingParticipantIds" JSONB,
    "assistingPuuids" JSONB,
    "sourceTeamId" INTEGER,
    "ownerTeamId" INTEGER,
    "beneficiaryTeamId" INTEGER,
    "positionX" DOUBLE PRECISION,
    "positionY" DOUBLE PRECISION,
    "lane" TEXT,
    "tier" TEXT,
    "payload" JSONB NOT NULL,
    "quality" JSONB NOT NULL,
    "metricVersion" INTEGER NOT NULL,
    "processingVersion" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_event_projections_pkey" PRIMARY KEY ("matchId","frameIndex","eventIndex")
);

-- CreateIndex
CREATE INDEX "match_event_projections_matchId_type_timestampMs_idx" ON "match_event_projections"("matchId", "type", "timestampMs");

-- CreateIndex
CREATE INDEX "match_event_projections_actorPuuid_type_idx" ON "match_event_projections"("actorPuuid", "type");

-- AddForeignKey
ALTER TABLE "match_event_projections" ADD CONSTRAINT "match_event_projections_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "matches"("matchId") ON DELETE CASCADE ON UPDATE CASCADE;

