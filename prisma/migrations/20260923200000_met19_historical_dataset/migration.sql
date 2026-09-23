CREATE TABLE "historical_metric_contributions" (
 "id" TEXT PRIMARY KEY, "matchId" TEXT NOT NULL,
 "datasetVersion" INTEGER NOT NULL, "subjectKind" TEXT NOT NULL, "subjectId" TEXT NOT NULL,
 "definitionId" TEXT NOT NULL, "definitionVersion" INTEGER NOT NULL, "usage" TEXT NOT NULL,
 "horizonKey" TEXT NOT NULL, "horizonMs" INTEGER, "sourceMaxTimestampMs" INTEGER,
 "horizonComplete" BOOLEAN NOT NULL, "metricId" TEXT NOT NULL, "unit" TEXT NOT NULL,
 "value" DOUBLE PRECISION, "sumValue" DOUBLE PRECISION NOT NULL,
 "validCount" INTEGER NOT NULL, "sampleCount" INTEGER NOT NULL,
 "numerator" DOUBLE PRECISION, "denominatorValue" DOUBLE PRECISION, "ratioScale" DOUBLE PRECISION NOT NULL,
 "origin" TEXT NOT NULL, "reason" TEXT, "method" TEXT,
 "eligible" BOOLEAN NOT NULL, "exclusionReason" TEXT,
 "patch" TEXT, "queueId" INTEGER NOT NULL, "mapId" INTEGER NOT NULL,
 "championId" INTEGER, "role" TEXT, "teamId" INTEGER, "playerIds" TEXT[] NOT NULL,
 "gameCreation" BIGINT NOT NULL, "quality" JSONB NOT NULL, "evidence" JSONB NOT NULL,
 "denominator" JSONB, "lineage" JSONB NOT NULL,
 "processingVersion" INTEGER NOT NULL, "processedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "historical_metric_match_fk" FOREIGN KEY ("matchId") REFERENCES "matches"("matchId") ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT "historical_metric_identity" UNIQUE ("matchId","subjectKind","subjectId","definitionId","definitionVersion","horizonKey"),
 CONSTRAINT "historical_metric_usage" CHECK ("usage" IN ('predictive','descriptive','label')),
 CONSTRAINT "historical_metric_subject" CHECK ("subjectKind" IN ('participant','team','match')),
 CONSTRAINT "historical_metric_counts" CHECK ("sampleCount"=1 AND "validCount" IN (0,1) AND
   (("validCount"=0 AND "value" IS NULL AND "sumValue"=0 AND "reason" IS NOT NULL) OR
    ("validCount"=1 AND "value" IS NOT NULL AND "sumValue"="value" AND "reason" IS NULL))),
 CONSTRAINT "historical_metric_finite" CHECK ("value" IS NULL OR ("value">'-Infinity'::float8 AND "value"<'Infinity'::float8)),
 CONSTRAINT "historical_metric_ratio" CHECK (("numerator" IS NULL OR ("numerator">'-Infinity'::float8 AND "numerator"<'Infinity'::float8)) AND ("denominatorValue" IS NULL OR ("denominatorValue">=0 AND "denominatorValue"<'Infinity'::float8)) AND "ratioScale">0 AND "ratioScale"<'Infinity'::float8),
 CONSTRAINT "historical_metric_provenance" CHECK ("processingVersion">=4 AND "definitionVersion">=1 AND "datasetVersion">=1),
 CONSTRAINT "historical_metric_time" CHECK (
   ("usage"<>'predictive' AND "horizonKey"='final' AND "horizonMs" IS NULL) OR
   ("usage"='predictive' AND "horizonMs" IS NOT NULL AND "horizonMs">=0 AND
    ("sourceMaxTimestampMs" IS NULL OR ("sourceMaxTimestampMs">=0 AND "sourceMaxTimestampMs"<="horizonMs")) AND
    ("validCount"=0 OR "sourceMaxTimestampMs" IS NOT NULL)))
);
CREATE INDEX "historical_metric_cohort_idx" ON "historical_metric_contributions"("patch","queueId","mapId","gameCreation");
CREATE INDEX "historical_metric_definition_idx" ON "historical_metric_contributions"("definitionId","definitionVersion","horizonKey","eligible");
CREATE INDEX "historical_metric_champion_role_idx" ON "historical_metric_contributions"("championId","role","gameCreation");
