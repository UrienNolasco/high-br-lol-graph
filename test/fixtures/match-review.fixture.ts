import type {
  MatchReviewInput,
  ReviewEvent,
} from '../../src/modules/matches/contracts/match-review';
export function matchReviewFixture(): MatchReviewInput {
  const roles = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'UTILITY'];
  const participants = Array.from({ length: 10 }, (_, i) => ({
    puuid: `review-p${i + 1}`,
    teamId: i < 5 ? 100 : 200,
    role: roles[i % 5],
    championName: `Champion${i + 1}`,
    kills: i === 5 ? 2 : 0,
    deaths: i === 0 ? 2 : 0,
    assists: 0,
    finalStats: {
      projectionVersion: 1,
      values: {
        totalDamageDealtToChampions: 1100 * (i + 1),
        gameEndedInEarlySurrender: false,
      },
    },
  }));
  const event = (
    timestampMs: number,
    frameIndex: number,
    type = 'CHAMPION_KILL',
  ): ReviewEvent => ({
    matchId: 'REVIEW_TEST',
    frameIndex,
    eventIndex: 0,
    type,
    timestampMs,
    actorParticipantId: type === 'GAME_END' ? null : 6,
    actorPuuid: type === 'GAME_END' ? null : 'review-p6',
    victimParticipantId: type === 'GAME_END' ? null : 1,
    victimPuuid: type === 'GAME_END' ? null : 'review-p1',
    assistingParticipantIds: [],
    assistingPuuids: [],
    sourceTeamId: 200,
    payload:
      type === 'GAME_END'
        ? { winningTeam: 200 }
        : {
            killerId: 6,
            victimId: 1,
            assistingParticipantIds: [],
            victimDamageReceived: [
              {
                participantId: 6,
                name: 'Champion6',
                type: 'OTHER',
                physicalDamage: 400,
                magicDamage: 20,
                trueDamage: 0,
              },
            ],
          },
    quality: {},
    metricVersion: 1,
    processingVersion: 2,
  });
  return {
    matchId: 'REVIEW_TEST',
    gameDuration: 660,
    gameVersion: '16.19.1',
    queueId: 420,
    mapId: 11,
    participants,
    processing: {
      status: 'COMPLETED',
      processingVersion: 2,
      completedAt: new Date('2026-10-01T00:00:00Z'),
    },
    projection: {
      projectionVersion: 1,
      frameIntervalMs: 60000,
      observedEndMs: 660000,
      frames: Array.from({ length: 12 }, (_, frameIndex) => ({
        frameIndex,
        timestamp: frameIndex * 60000,
        participantFrames: Object.fromEntries(
          participants.map((p, i) => [
            String(i + 1),
            {
              participantId: i + 1,
              puuid: p.puuid,
              totalGold: 500 + frameIndex * (100 + i),
              currentGold: 50,
              xp: frameIndex * 100,
              level: 1,
              minionsKilled: frameIndex * 5,
              jungleMinionsKilled: 0,
              position: null,
              damageStats: {
                totalDamageDoneToChampions: frameIndex * 100 * (i + 1),
              },
              championStats: null,
              additionalFields: {},
              missingFields: [],
            },
          ]),
        ),
      })),
    },
    events: [
      event(195000, 4),
      event(630000, 11),
      { ...event(660000, 11, 'GAME_END'), eventIndex: 1 },
    ],
  };
}
