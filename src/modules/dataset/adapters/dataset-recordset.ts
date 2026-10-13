import { Prisma } from '@prisma/client';
import { recordsetJson } from '../../../core/prisma/recordset-json';
export type PreparedDatasetRow = Omit<
  Prisma.HistoricalMetricContributionCreateManyInput,
  'processedAt' | 'lineage'
>;

export const DATASET_WRITE_BATCH_SIZE = 500;

/** Replacement and transaction ownership stay in the dataset adapter. */
export async function insertDatasetBatch(
  tx: Prisma.TransactionClient,
  prepared: readonly PreparedDatasetRow[],
  lineage: Prisma.InputJsonValue,
  processedAt: Date,
): Promise<void> {
  const rows = prepared.map((row) => {
    if (
      row.quality === undefined ||
      row.evidence === undefined ||
      Object.is(row.quality, Prisma.DbNull) ||
      Object.is(row.evidence, Prisma.DbNull)
    )
      throw new TypeError('Required dataset JSON cannot be SQL NULL');
    return {
      ...row,
      quality: row.quality === Prisma.JsonNull ? null : row.quality,
      evidence: row.evidence === Prisma.JsonNull ? null : row.evidence,
      denominator:
        row.denominator === Prisma.DbNull || row.denominator === Prisma.JsonNull
          ? null
          : row.denominator,
      denominatorSqlNull:
        row.denominator === Prisma.DbNull || row.denominator == null,
    };
  });
  const payload = await recordsetJson(tx, rows);
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO historical_metric_contributions (
      "id", "matchId", "datasetVersion",
      "subjectKind", "subjectId", "definitionId",
      "definitionVersion", "usage", "horizonKey",
      "horizonMs", "sourceMaxTimestampMs", "horizonComplete",
      "metricId", "unit", "value",
      "sumValue", "validCount", "sampleCount",
      "numerator", "denominatorValue", "ratioScale",
      "origin", "reason", "method",
      "eligible", "exclusionReason", "patch",
      "queueId", "mapId", "championId",
      "role", "teamId", "playerIds",
      "gameCreation", "quality", "evidence",
      "denominator", "lineage", "processingVersion",
      "processedAt"
    )
    SELECT
      "id", "matchId", "datasetVersion",
      "subjectKind", "subjectId", "definitionId",
      "definitionVersion", "usage", "horizonKey",
      "horizonMs", "sourceMaxTimestampMs", "horizonComplete",
      "metricId", "unit", "value",
      "sumValue", "validCount", "sampleCount",
      "numerator", "denominatorValue", "ratioScale",
      "origin", "reason", "method",
      "eligible", "exclusionReason", "patch",
      "queueId", "mapId", "championId",
      "role", "teamId", "playerIds",
      "gameCreation", COALESCE("quality",'null'::jsonb), COALESCE("evidence",'null'::jsonb),
      CASE WHEN "denominatorSqlNull" THEN NULL ELSE COALESCE(denominator,'null'::jsonb) END, ${JSON.stringify(lineage)}::jsonb, "processingVersion",
      ${processedAt}
    FROM jsonb_to_recordset(${payload}::jsonb) AS r(
      "id" text, "matchId" text, "datasetVersion" integer,
      "subjectKind" text, "subjectId" text, "definitionId" text,
      "definitionVersion" integer, "usage" text, "horizonKey" text,
      "horizonMs" integer, "sourceMaxTimestampMs" integer, "horizonComplete" boolean,
      "metricId" text, "unit" text, "value" double precision,
      "sumValue" double precision, "validCount" integer, "sampleCount" integer,
      "numerator" double precision, "denominatorValue" double precision, "ratioScale" double precision,
      "origin" text, "reason" text, "method" text,
      "eligible" boolean, "exclusionReason" text, "patch" text,
      "queueId" integer, "mapId" integer, "championId" integer,
      "role" text, "teamId" integer, "playerIds" text[],
      "gameCreation" bigint, "quality" jsonb, "evidence" jsonb,
      "denominator" jsonb, "processingVersion" integer, "denominatorSqlNull" boolean
    )`);
}
