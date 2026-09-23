import { projectFinalInventory } from '../../../../core/riot/final-inventory';
import { ItemCatalog } from '../../../../core/data-dragon/item-catalog';
import { SkillCatalog } from '../../../../core/data-dragon/skill-catalog';
import { ProgressionInput } from './progression-calculator';
import { ProgressionEvent } from './types';
export const event = (
  type = 'ITEM_PURCHASED',
  payload: object = { itemId: 1001 },
  index = 0,
  timestampMs: number | null = 1000,
): ProgressionEvent => ({
  matchId: 'm',
  frameIndex: 0,
  eventIndex: index,
  type,
  timestampMs,
  actorPuuid: 'a',
  payload: { type, timestamp: timestampMs, participantId: 1, ...payload },
  quality: {},
  metricVersion: 1,
  processingVersion: 2,
});
export const fixture = (
  events: ProgressionEvent[] = [event()],
  overrides: Partial<ProgressionInput> = {},
): ProgressionInput => ({
  matchId: 'm',
  gameVersion: '16.2.741',
  queueId: 420,
  mapId: 11,
  gameDuration: 1200,
  participant: {
    puuid: 'a',
    championId: 1,
    championName: 'Synthetic',
    finalInventory: projectFinalInventory({
      item0: 1001,
      item1: 0,
      item2: 0,
      item3: 0,
      item4: 0,
      item5: 0,
      item6: 0,
      roleBoundItem: 0,
    }),
  },
  events: events.some((e) => e.type === 'GAME_END')
    ? events
    : [
        ...events,
        {
          ...event('GAME_END', { winningTeam: 100 }, 9999, 1200000),
          actorPuuid: null,
        },
      ],
  snapshotProjection: null,
  processing: {
    status: 'COMPLETED',
    processingVersion: 2,
    completedAt: new Date('2026-09-23T00:00:00Z'),
  },
  ...overrides,
});
export const itemCatalog: ItemCatalog = {
  gameVersion: '16.2.741',
  version: '16.2.1',
  locale: 'pt_BR',
  policy: 'latest_revision_of_exact_patch',
  reason: null,
  items: {
    '1001': {
      name: 'Synthetic component',
      imageUrl: null,
      from: [],
      into: [2001],
      consumed: false,
    },
    '2001': {
      name: 'Synthetic item',
      imageUrl: null,
      from: [1001, 1001],
      into: [],
      consumed: false,
    },
    '3001': {
      name: 'Synthetic potion',
      imageUrl: null,
      from: [],
      into: [],
      consumed: true,
    },
  },
};
export const skillCatalog: SkillCatalog = {
  gameVersion: '16.2.741',
  version: '16.2.1',
  championId: 1,
  locale: 'pt_BR',
  policy: 'latest_revision_of_exact_patch',
  reason: null,
  spells: Array.from({ length: 4 }, (_, i) => ({
    slot: i + 1,
    spellId: `Synthetic${i}`,
    name: `Synthetic ability ${i}`,
    maxRank: i === 3 ? 3 : 5,
  })),
};
