import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { objectivesFixture } from './objectives';
import { normalizeTimelineEvents } from '../../src/modules/matches/adapters/riot/normalized-events';
import { projectTimelineSnapshots } from '../../src/modules/matches/adapters/riot/timeline-snapshots';
import { SequencesInput } from '../../src/modules/matches/pure/sequences-calculator';
import { PROCESSING_VERSION } from '../../src/core/processing/processing.constants';
export function sequencesFixture(): SequencesInput {
  const summary = JSON.parse(
    readFileSync(
      join(__dirname, '../../exemplo_partida_BR1_3200579475.json'),
      'utf8',
    ),
  ) as {
    info: {
      participants: { participantId: number; puuid: string; teamId: number }[];
      teams: SequencesInput['teams'];
    };
  };
  const timeline = JSON.parse(
    readFileSync(
      join(__dirname, '../../exemplo_partida_timeline_BR1_3200579475.json'),
      'utf8',
    ),
  );
  const f = objectivesFixture();
  return {
    ...f,
    teams: summary.info.teams,
    events: normalizeTimelineEvents(
      timeline,
      new Map(summary.info.participants.map((p) => [p.participantId, p.puuid])),
      new Map(
        summary.info.participants.map((p) => [p.participantId, p.teamId]),
      ),
      { processingVersion: PROCESSING_VERSION },
    ),
    projection: projectTimelineSnapshots(
      timeline,
      new Map(summary.info.participants.map((p) => [p.participantId, p.puuid])),
    ),
  };
}
