/** One real observed match. No invented later match or longitudinal trend. */
import { writeFileSync } from 'node:fs';
import {
  buildHistoricalDataset,
  calculateSequences,
} from '../../src/composition/study-api';
import { historicalDatasetFixture } from '../../src/composition/study-fixtures';
import {
  calculateEvolution,
  calculateEvolutionWindow,
} from '../../src/modules/evolution/contracts/calculation';
import { normalizeEvolutionQuery } from '../../src/modules/evolution/evolution-contract';
const input = historicalDatasetFixture(),
  rows = buildHistoricalDataset(input),
  creation = Number(input.match.gameCreation);
const sequence = calculateSequences({
  ...input.match,
  participants: input.participants,
  teams: input.teams,
  events: input.events,
  projection: input.projection,
  processing: {
    status: 'COMPLETED',
    processingVersion: input.processingVersion,
    completedAt: input.processedAt,
  },
});
const examples = ['Fiora', 'Milio'].map((name) => {
  const player = input.participants.find((p) => p.championName === name)!;
  const q = normalizeEvolutionQuery(player.puuid, {
    definitionId: 'final.deathsNearObjectives',
    championId: player.championId,
    role: player.role,
    queueId: input.match.queueId,
    mapId: input.match.mapId,
    horizonKey: 'final',
    baselineFromMs: creation,
    baselineToMs: creation + 1,
    recentFromMs: creation + 1,
    recentToMs: creation + 2,
  });
  const selected = rows.filter(
    (r) => r.subjectId === player.puuid && r.definitionId === q.definition.id,
  );
  return {
    champion: name,
    ...calculateEvolution(
      q,
      {
        ...calculateEvolutionWindow(q, q.baseline, selected, selected, 0),
        examples: {
          items: [
            {
              matchId: input.match.matchId,
              reason: sequence.reason,
              episodes:
                sequence.report?.deathEpisodes.filter(
                  (e) => e.subjectId === player.puuid,
                ) ?? [],
            },
          ],
        },
      },
      {
        ...calculateEvolutionWindow(q, q.recent, [], [], 0),
        examples: { items: [] },
      },
    ),
  };
});
writeFileSync(
  'docs/analysis/met21-examples.json',
  JSON.stringify(
    {
      source:
        'BR1_3200579475; source observations real; completed-job/lineage metadata explicitly synthetic in historicalDatasetFixture; recent window empty, no longitudinal claim',
      examples,
    },
    null,
    2,
  ) + '\n',
);
