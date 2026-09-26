import { MatchDto } from '../../src/core/riot/dto/match.dto';
import { TimelineDto } from '../../src/core/riot/dto/timeline.dto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatasetInput } from '../../src/core/dataset/dataset-builder';
import { PROCESSING_VERSION } from '../../src/core/processing/processing.constants';
import { TimelineParserService } from '../../src/modules/matches/adapters/riot/timeline-parser.service';
import { parseMatchData } from '../../src/modules/matches/adapters/riot/match.parser';

/** Real source observations with explicitly synthetic completed-job/lineage metadata. */
export function historicalDatasetFixture(): DatasetInput {
  const summary: MatchDto = JSON.parse(
    readFileSync(
      join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
      'utf8',
    ),
  );
  const timeline: TimelineDto = JSON.parse(
    readFileSync(
      join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
      'utf8',
    ),
  );
  const participantMap = new Map<number, string>(
    summary.info.participants.map((p) => [p.participantId, p.puuid]),
  );
  const participantTeams = new Map<number, number>(
    summary.info.participants.map((p) => [p.participantId, p.teamId]),
  );
  const parsed = new TimelineParserService().parseTimeline(
    timeline,
    participantMap,
    participantTeams,
    PROCESSING_VERSION,
  );
  return {
    ...parseMatchData(summary),
    projection: parsed.snapshotProjection,
    events: parsed.normalizedEvents,
    processingVersion: PROCESSING_VERSION,
    processedAt: new Date('2026-09-23T00:00:00.000Z'),
    lineage: {
      observationIds: ['synthetic:collector:fixture', 'synthetic:sync:fixture'],
      sources: ['collector', 'player_sync'],
      status: 'observed',
      reason: null,
    },
  };
}
