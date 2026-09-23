import { CombatEvent, CombatInput } from './combat-calculator';
export const killEvent = (
  overrides: Partial<CombatEvent> = {},
): CombatEvent => ({
  matchId: 'm',
  frameIndex: 1,
  eventIndex: 0,
  type: 'CHAMPION_KILL',
  timestampMs: 100000,
  actorParticipantId: 1,
  actorPuuid: 'a',
  victimPuuid: 'b',
  assistingParticipantIds: [],
  assistingPuuids: [],
  sourceTeamId: 100,
  payload: { killerId: 1, bounty: 300, shutdownBounty: 0 },
  quality: {},
  metricVersion: 1,
  processingVersion: 2,
  ...overrides,
});
export function combatFixture(
  events: CombatEvent[] = [killEvent()],
  overrides: Partial<CombatInput> = {},
): CombatInput {
  return {
    matchId: 'm',
    gameDuration: 1200,
    processingVersion: 2,
    projectionComplete: true,
    processedAt: '2026-09-23T00:00:00.000Z',
    events: events.some((e) => e.type === 'GAME_END')
      ? events
      : [
          ...events,
          killEvent({
            type: 'GAME_END',
            frameIndex: 9999,
            eventIndex: 0,
            matchId: overrides.matchId ?? 'm',
            processingVersion: overrides.processingVersion ?? 2,
            timestampMs: (overrides.gameDuration ?? 1200) * 1000,
            payload: { winningTeam: 100 },
          }),
        ],
    participants: ['a', 'b', 'c'].map((puuid) => ({
      puuid,
      teamId: puuid === 'b' ? 200 : 100,
      kills: events.filter(
        (e) => e.type === 'CHAMPION_KILL' && e.actorPuuid === puuid,
      ).length,
      deaths: events.filter(
        (e) => e.type === 'CHAMPION_KILL' && e.victimPuuid === puuid,
      ).length,
      assists: events.filter(
        (e) =>
          e.type === 'CHAMPION_KILL' &&
          Array.isArray(e.assistingPuuids) &&
          e.assistingPuuids.includes(puuid),
      ).length,
    })),
    ...overrides,
  };
}
