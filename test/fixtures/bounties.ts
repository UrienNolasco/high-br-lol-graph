import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeTimelineEvents } from '../../src/modules/matches/adapters/riot/normalized-events';
import { parseMatchData } from '../../src/modules/matches/adapters/riot/match.parser';
import { BountiesStealsInput } from '../../src/modules/matches/pure/bounties-steals-calculator';
import { PROCESSING_VERSION } from '../../src/lib/processing-policy';
export function bountiesFixture(): BountiesStealsInput {
  const summary = JSON.parse(
    readFileSync(
      join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
      'utf8',
    ),
  );
  const timeline = JSON.parse(
    readFileSync(
      join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
      'utf8',
    ),
  );
  const events = normalizeTimelineEvents(
    timeline,
    new Map(summary.info.participants.map((p) => [p.participantId, p.puuid])),
    new Map(summary.info.participants.map((p) => [p.participantId, p.teamId])),
    { processingVersion: PROCESSING_VERSION },
  );
  return {
    matchId: summary.metadata.matchId,
    gameVersion: summary.info.gameVersion,
    participants: parseMatchData(summary).participants,
    events,
    processing: {
      status: 'COMPLETED',
      processingVersion: events[0].processingVersion,
      completedAt: new Date('2026-09-23T00:00:00Z'),
    },
  };
}
