import { Prisma } from '@prisma/client';
import { jsonObject } from '../../../../core/prisma/json-value';
import { recordsetJson } from '../../../../core/prisma/recordset-json';
import type { NormalizedTimelineEvent } from '../../contracts/normalized-events';

// Bound the number of expanded rows and temporary JS objects per statement.
export const EVENT_WRITE_BATCH_SIZE = 1000;

export async function writeEvents(
  tx: Prisma.TransactionClient,
  events: readonly NormalizedTimelineEvent[],
  completedAt: Date,
): Promise<void> {
  for (
    let offset = 0;
    offset < events.length;
    offset += EVENT_WRITE_BATCH_SIZE
  ) {
    const rows = events
      .slice(offset, offset + EVENT_WRITE_BATCH_SIZE)
      .map((event) => ({
        ...event,
        payload: jsonObject(event.payload),
        quality: jsonObject(event.quality),
      }));
    const payload = await recordsetJson(tx, rows);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO match_event_projections (
        "matchId","frameIndex","eventIndex",type,"timestampMs","frameTimestampMs",
        "actorParticipantId","actorPuuid","victimParticipantId","victimPuuid",
        "assistingParticipantIds","assistingPuuids","sourceTeamId","ownerTeamId",
        "beneficiaryTeamId","positionX","positionY",lane,tier,payload,quality,
        "metricVersion","processingVersion","processedAt")
      SELECT "matchId","frameIndex","eventIndex",type,"timestampMs","frameTimestampMs",
        "actorParticipantId","actorPuuid","victimParticipantId","victimPuuid",
        NULLIF("assistingParticipantIds",'null'::jsonb),NULLIF("assistingPuuids",'null'::jsonb),
        "sourceTeamId","ownerTeamId","beneficiaryTeamId","positionX","positionY",lane,tier,
        payload,quality,"metricVersion","processingVersion",${completedAt}
      FROM jsonb_to_recordset(${payload}::jsonb) AS e(
        "matchId" text,"frameIndex" integer,"eventIndex" integer,type text,
        "timestampMs" integer,"frameTimestampMs" integer,"actorParticipantId" integer,
        "actorPuuid" text,"victimParticipantId" integer,"victimPuuid" text,
        "assistingParticipantIds" jsonb,"assistingPuuids" jsonb,"sourceTeamId" integer,
        "ownerTeamId" integer,"beneficiaryTeamId" integer,"positionX" double precision,
        "positionY" double precision,lane text,tier text,payload jsonb,quality jsonb,
        "metricVersion" integer,"processingVersion" integer)`);
  }
}
