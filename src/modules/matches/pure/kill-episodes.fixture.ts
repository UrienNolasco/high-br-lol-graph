import { combatFixture, killEvent } from './combat.fixture';
import {
  KillEpisodeEvent,
  KillEpisodesInput,
} from './kill-episodes-calculator';
export const episodeEvent = (
  overrides: Partial<KillEpisodeEvent> = {},
): KillEpisodeEvent => ({
  ...killEvent(overrides),
  positionX: 1000,
  positionY: 1000,
  ...overrides,
});
export const resourceFrame = (
  frameIndex: number,
  timestamp: number,
  currentGold = 200,
  totalGold = 1000,
) => ({
  frameIndex,
  timestamp,
  participantFrames: Object.fromEntries(
    ['a', 'b', 'c'].map((puuid, index) => [
      String(index + 1),
      { puuid, participantId: index + 1, currentGold, totalGold },
    ]),
  ),
});
export function killEpisodesFixture(
  events: KillEpisodeEvent[] = [episodeEvent()],
  overrides: Partial<KillEpisodesInput> = {},
): KillEpisodesInput {
  const combat = combatFixture(events);
  return {
    ...combat,
    events: combat.events.map((e) => ({
      positionX: null,
      positionY: null,
      ...e,
    })),
    mapId: 11,
    gameVersion: '16.2.1',
    snapshotProjection: {
      projectionVersion: 1,
      frameIntervalMs: 60000,
      observedEndMs: 1200000,
      frames: [
        resourceFrame(0, 0),
        resourceFrame(1, 60000),
        resourceFrame(2, 120000),
      ],
    },
    ...overrides,
  };
}
