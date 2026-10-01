import type {
  BuildChoiceCohort,
  BuildChoiceFilters,
  BuildChoiceMatch,
} from '../../matches/ports/build-choice-reader';
import type { BuildChoiceCatalogBundle } from './build-choices';
export const choiceFilters: BuildChoiceFilters = {
  patch: '16.2',
  championId: 1,
  role: 'TOP',
  checkpointMs: 900000,
  queueId: 420,
  limit: 500,
};
export function choiceCatalogs(): Record<string, BuildChoiceCatalogBundle> {
  return {
    '16.2.741': {
      items: {
        gameVersion: '16.2.741',
        version: '16.2.1',
        reason: null,
        policy: 'latest_revision_of_exact_patch',
        locale: 'pt_BR',
        items: {
          '100': { name: 'Synthetic item', imageUrl: null, from: [] },
          '101': { name: 'Synthetic alternative', imageUrl: null, from: [] },
        },
      },
      choices: {
        gameVersion: '16.2.741',
        version: '16.2.1',
        reason: null,
        policy: 'latest_revision_of_exact_patch',
        summoners: {
          '4': { id: 4, name: 'Synthetic flash' },
          '12': { id: 12, name: 'Synthetic teleport' },
        },
        styles: {
          '1000': {
            id: 1000,
            name: 'Synthetic primary',
            slots: [[1001], [1002], [1003], [1004]],
          },
          '2000': {
            id: 2000,
            name: 'Synthetic secondary',
            slots: [[2001], [2002], [2003], [2004]],
          },
        },
        runes: Object.fromEntries(
          [1001, 1002, 1003, 1004, 2001, 2002, 2003, 2004].map((id) => [
            String(id),
            { id, name: `Synthetic rune ${id}` },
          ]),
        ),
      },
    },
  };
}
export function choiceMatch(id = 'm1'): BuildChoiceMatch {
  return {
    matchId: id,
    gameVersion: '16.2.741',
    gameDuration: 1800,
    populationEligible: true,
    processing: {
      status: 'COMPLETED',
      processingVersion: 5,
      completedAt: new Date('2026-10-01T00:00:00Z'),
    },
    participants: [
      {
        puuid: 'hero',
        championId: 1,
        teamId: 100,
        role: 'TOP',
        win: true,
        spells: [12, 4],
        runes: {
          styles: [
            {
              description: 'primaryStyle',
              style: 1000,
              selections: [1001, 1002, 1003, 1004].map((perk) => ({ perk })),
            },
            {
              description: 'subStyle',
              style: 2000,
              selections: [2002, 2003].map((perk) => ({ perk })),
            },
          ],
          statPerks: { offense: 5008, flex: 5008, defense: 5002 },
        },
      },
      {
        puuid: 'enemy',
        championId: 2,
        teamId: 200,
        role: 'TOP',
        win: false,
        spells: [],
        runes: {},
      },
    ],
    timelineProjection: {
      projectionVersion: 1,
      frameIntervalMs: 60000,
      observedEndMs: 1800000,
      frames: [
        {
          frameIndex: 15,
          timestamp: 900000,
          participantFrames: {
            '1': {
              participantId: 1,
              puuid: 'hero',
              totalGold: 6000,
              currentGold: 500,
              xp: 6000,
              level: 10,
              minionsKilled: 100,
              jungleMinionsKilled: 0,
              position: null,
              damageStats: null,
              championStats: null,
              additionalFields: {},
              missingFields: [],
            },
          },
        },
      ],
    },
    events: [
      {
        matchId: id,
        frameIndex: 10,
        eventIndex: 0,
        type: 'ITEM_PURCHASED',
        timestampMs: 600000,
        actorPuuid: 'hero',
        payload: { itemId: 100 },
        quality: {},
        metricVersion: 1,
        processingVersion: 5,
      },
      {
        matchId: id,
        frameIndex: 30,
        eventIndex: 0,
        type: 'GAME_END',
        timestampMs: 1800000,
        actorPuuid: null,
        payload: { winningTeam: 100 },
        quality: {},
        metricVersion: 1,
        processingVersion: 5,
      },
    ],
  };
}
export function choiceCohort(
  matches: BuildChoiceMatch[] = [choiceMatch()],
): BuildChoiceCohort {
  return { matches, totalMatches: matches.length, truncated: false };
}
