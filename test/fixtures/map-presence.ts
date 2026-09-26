import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectTimelineSnapshots } from '../../src/modules/matches/adapters/riot/timeline-snapshots';
import { MapPresenceInput } from '../../src/modules/matches/pure/map-presence-calculator';
export const mapPresenceSummary = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
);
export const mapPresenceTimeline = JSON.parse(
  readFileSync(
    join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
    'utf8',
  ),
);
export function mapPresenceFixture(): MapPresenceInput {
  return {
    matchId: mapPresenceSummary.metadata.matchId,
    gameVersion: mapPresenceSummary.info.gameVersion,
    gameDuration: mapPresenceSummary.info.gameDuration,
    mapId: mapPresenceSummary.info.mapId,
    participants: mapPresenceSummary.info.participants.map((p) => ({
      puuid: p.puuid,
      teamId: p.teamId,
    })),
    projection: projectTimelineSnapshots(
      mapPresenceTimeline,
      new Map(
        mapPresenceTimeline.info.participants.map((p) => [
          p.participantId,
          p.puuid,
        ]),
      ),
    ),
    // Synthetic persisted-time input for reproducible tests, not production provenance.
    processing: {
      status: 'COMPLETED',
      completedAt: new Date('2026-09-23T00:00:00Z'),
      processingVersion: 2,
    },
  };
}
