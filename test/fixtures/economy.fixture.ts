import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectTimelineSnapshots } from '../../src/modules/matches/adapters/riot/timeline-snapshots';
import { parseMatchData } from '../../src/modules/matches/adapters/riot/match.parser';
import { EconomyInput } from '../../src/modules/matches/pure/economy-calculator';

export const economySummary = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
);
export const economyTimeline = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
    'utf8',
  ),
);
export function economyFixture(): EconomyInput {
  const parsed = parseMatchData(economySummary);
  return {
    ...parsed.match,
    participants: parsed.participants,
    projection: projectTimelineSnapshots(
      economyTimeline,
      new Map(
        economyTimeline.info.participants.map((p) => [
          p.participantId,
          p.puuid,
        ]),
      ),
    ),
    // Controlled provenance for tests; not the processing time of production data.
    processing: {
      status: 'COMPLETED',
      completedAt: new Date('2026-09-23T00:00:00Z'),
      processingVersion: 2,
    },
  };
}
