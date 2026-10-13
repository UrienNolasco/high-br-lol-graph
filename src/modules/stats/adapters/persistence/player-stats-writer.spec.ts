import type { TransactionContext } from '../../../../lib/transaction-context';
import type { StatsAggregateInput } from '../../contracts/aggregate';
import { PlayerStatsAggregationService } from './player-stats-writer';

const tx = () => ({ $executeRaw: jest.fn().mockResolvedValue(1) });

const input = (
  duration: number,
  frame: Record<string, any> | undefined,
): StatsAggregateInput =>
  ({
    matchData: {
      match: {
        gameVersion: '16.2.7',
        gameDuration: duration,
        queueId: 420,
        gameCreation: BigInt(1_700_000_000_000),
      },
      participants: [
        {
          puuid: 'p1',
          championId: 2,
          championName: 'B',
          teamId: 100,
          role: 'TOP',
          win: true,
          kda: 2,
          totalDamage: 600,
          goldEarned: 3000,
          totalCs: 120,
          visionScore: 10,
        },
        {
          puuid: 'p2',
          championId: 1,
          championName: 'A',
          teamId: 200,
          role: 'TOP',
          win: false,
          kda: 1,
          totalDamage: 300,
          goldEarned: 2400,
          totalCs: 100,
          visionScore: 8,
        },
      ],
    },
    timeline: {
      snapshotProjection: {
        frames: frame
          ? [{ frameIndex: 0, timestamp: 900000, participantFrames: frame }]
          : [],
      },
    },
  }) as StatsAggregateInput;

const snapshots = (
  own: Record<string, any>,
  opponent: Record<string, any>,
) => ({
  // Deliberately reverse participant ids. The puuid on each normalized
  // snapshot, rather than object/index order, is the identity used by stats.
  '2': { participantId: 2, puuid: 'p1', ...own },
  '1': { participantId: 1, puuid: 'p2', ...opponent },
});

const normalSnapshots = (
  own: Record<string, any>,
  opponent: Record<string, any>,
) => ({
  '1': { participantId: 1, puuid: 'p1', ...own },
  '2': { participantId: 2, puuid: 'p2', ...opponent },
});

const valid = (gold = 1000, xp = 100, cs = 20) => ({
  totalGold: gold,
  xp,
  minionsKilled: cs,
  jungleMinionsKilled: 0,
});

describe('PlayerStatsAggregationService normalized input compatibility', () => {
  it.each([
    [
      'real frame',
      900,
      normalSnapshots(valid(1200, 200, 30), valid(1000, 180, 25)),
      1,
      5,
    ],
    ['short 899', 899, snapshots(valid(), valid()), 0, 0],
    [
      'reversed metadata mapping',
      900,
      snapshots(valid(1200, 200, 30), valid(1000, 180, 25)),
      1,
      5,
    ],
    [
      'missing lane field',
      900,
      snapshots({ ...valid(), xp: null }, valid()),
      0,
      0,
    ],
    [
      'observed zero lane field',
      900,
      snapshots(valid(0, 0, 0), valid(0, 0, 0)),
      1,
      0,
    ],
  ])(
    '%s preserves lane samples and batches writes',
    async (_name, duration, frame, samples, expectedCsd) => {
      const database = tx();
      await new PlayerStatsAggregationService().update(
        database as unknown as TransactionContext,
        input(duration, frame),
      );

      expect(database.$executeRaw).toHaveBeenCalledTimes(3);
      const deltas = new PlayerStatsAggregationService().prepare(
        input(duration, frame),
      );
      const lane = deltas.find(
        (row) =>
          row.table === 'player_champion_stats' &&
          row.keys.puuid === 'p1' &&
          row.keys.patch === 'ALL',
      )!;
      expect(lane.sums).toMatchObject({
        laningSamples: samples,
        sumCsd15: expectedCsd,
        sumGd15: expectedCsd ? 200 : 0,
        sumXpd15: expectedCsd ? 20 : 0,
      });
      expect(
        deltas
          .filter(
            (row) => row.table === 'player_stats' && row.keys.puuid === 'p1',
          )
          .map((row) => row.keys.patch),
      ).toEqual(['ALL', '16.2']);
    },
  );
});
