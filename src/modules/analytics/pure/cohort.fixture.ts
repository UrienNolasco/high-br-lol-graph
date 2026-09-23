import { gzipSync } from 'node:zlib';
import { ComparisonParticipant } from './cohort-calculator';
export function comparisonFixture(
  matchId = 'm1',
  duration = 1800,
): ComparisonParticipant {
  return {
    matchId,
    puuid: 'hero',
    teamId: 100,
    role: 'MID',
    win: true,
    kda: 3,
    totalCs: 300,
    totalDamage: 30000,
    goldEarned: 15000,
    visionScore: 30,
    match: {
      gameDuration: duration,
      participants: [
        { puuid: 'hero', teamId: 100, role: 'MID' },
        { puuid: 'enemy', teamId: 200, role: 'MIDDLE' },
      ],
    },
  };
}
export function timelineFixture(
  timestamp = 900000,
  player: object = {},
  opponent: object = {},
) {
  return gzipSync(
    JSON.stringify({
      info: {
        participants: [
          { puuid: 'hero', participantId: 1 },
          { puuid: 'enemy', participantId: 6 },
        ],
        frames: [
          {
            timestamp,
            participantFrames: {
              '1': {
                minionsKilled: 90,
                jungleMinionsKilled: 10,
                totalGold: 6000,
                xp: 7000,
                ...player,
              },
              '6': {
                minionsKilled: 80,
                jungleMinionsKilled: 5,
                totalGold: 5800,
                xp: 6500,
                ...opponent,
              },
            },
          },
        ],
      },
    }),
  );
}
