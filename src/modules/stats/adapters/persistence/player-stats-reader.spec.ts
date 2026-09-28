import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../../core/prisma/prisma.service';
import { PlayerStatsReaderAdapter } from './player-stats-reader';

describe('PlayerStatsReaderAdapter', () => {
  let repo: PlayerStatsReaderAdapter;
  let prisma: {
    playerStats: { findUnique: jest.Mock };
    playerChampionStats: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      playerStats: { findUnique: jest.fn() },
      playerChampionStats: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn(),
      $transaction: jest.fn((fn: (tx: typeof prisma) => unknown) => fn(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerStatsReaderAdapter,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<PlayerStatsReaderAdapter>(PlayerStatsReaderAdapter);
  });

  it('queries player aggregates with the composite key', async () => {
    await repo.getAggregatedStats('p1', '15.1', 420);

    expect(prisma.playerStats.findUnique).toHaveBeenCalledWith({
      where: {
        puuid_patch_queueId: { puuid: 'p1', patch: '15.1', queueId: 420 },
      },
    });
  });

  it('queries champion aggregates for a player', async () => {
    await repo.getChampionStats('p1', '15.1', 420);

    expect(prisma.playerChampionStats.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { puuid: 'p1', patch: '15.1', queueId: 420 },
      }),
    );
  });

  it('keeps the role distribution query and patch filter', async () => {
    const mockResult = [
      {
        role: 'MID',
        gamesplayed: BigInt(10),
        wins: BigInt(6),
        losses: BigInt(4),
        winrate: 60,
        avgkda: 3,
      },
    ];
    prisma.$queryRaw.mockResolvedValue(mockResult);

    await expect(repo.getRoleDistribution('p1', '15.1')).resolves.toEqual(
      mockResult,
    );
  });

  it('keeps the activity heatmap query for ALL', async () => {
    const mockResult = [
      {
        dayofweek: 1,
        hour: 14,
        games: BigInt(5),
        wins: BigInt(3),
        losses: BigInt(2),
        winrate: 60,
      },
    ];
    prisma.$queryRaw.mockResolvedValue(mockResult);

    await expect(repo.getActivityData('p1', 'ALL')).resolves.toEqual(
      mockResult,
    );
  });
});
