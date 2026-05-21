import { Test, TestingModule } from '@nestjs/testing';
import { ChampionStatsService } from './champion-stats.service';
import { ChampionStatsRepository } from '../repositories/champion-stats.repository';
import { DataDragonService } from '../../../core/data-dragon/data-dragon.service';
import { TierRankService } from './tier-rank.service';

describe('ChampionStatsService', () => {
  let service: ChampionStatsService;
  let repo: jest.Mocked<Pick<ChampionStatsRepository, 'findManyByPatch'>>;
  let dataDragon: jest.Mocked<
    Pick<DataDragonService, 'getChampionById' | 'getChampionImageUrls'>
  >;
  let tierRank: jest.Mocked<
    Pick<TierRankService, 'getPreviousPatch' | 'calculateChampionScore'>
  >;

  const mockStat = {
    championId: 1,
    patch: '15.1',
    queueId: 420,
    winRate: 55.5,
    gamesPlayed: 100,
    wins: 55,
    losses: 45,
    kda: 2.5,
    dpm: 650,
    cspm: 7.2,
    gpm: 450,
    banRate: 15.5,
    pickRate: 12.3,
  };

  beforeEach(async () => {
    repo = { findManyByPatch: jest.fn() } as any;
    dataDragon = {
      getChampionById: jest.fn(),
      getChampionImageUrls: jest.fn(),
    } as any;
    tierRank = {
      getPreviousPatch: jest.fn(),
      calculateChampionScore: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChampionStatsService,
        { provide: ChampionStatsRepository, useValue: repo },
        { provide: DataDragonService, useValue: dataDragon },
        { provide: TierRankService, useValue: tierRank },
      ],
    }).compile();
    service = module.get<ChampionStatsService>(ChampionStatsService);
  });

  it('should return paginated champion stats', async () => {
    repo.findManyByPatch.mockResolvedValue([mockStat] as any);
    tierRank.getPreviousPatch.mockReturnValue(null);
    dataDragon.getChampionById.mockReturnValue({
      id: 'Annie',
      name: 'Annie',
      key: '1',
    });
    dataDragon.getChampionImageUrls.mockResolvedValue({
      square: 'img.png',
      loading: 'l.png',
      splash: 'sp.png',
    });
    tierRank.calculateChampionScore.mockReturnValue({
      score: 75,
      tier: 'S',
      hasInsufficientData: false,
    });

    const result = await service.getChampionStats('15.1');

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.data[0].championName).toBe('Annie');
    expect(result.data[0].rank).toBe(1);
  });

  it('should handle champions with insufficient data', async () => {
    repo.findManyByPatch.mockResolvedValue([mockStat] as any);
    tierRank.getPreviousPatch.mockReturnValue(null);
    dataDragon.getChampionById.mockReturnValue({
      id: 'Annie',
      name: 'Annie',
      key: '1',
    });
    dataDragon.getChampionImageUrls.mockResolvedValue({
      square: 'img.png',
      loading: 'l.png',
      splash: 'sp.png',
    });
    tierRank.calculateChampionScore.mockReturnValue({
      score: 0,
      tier: 'Dados Insuficientes',
      hasInsufficientData: true,
    });

    const result = await service.getChampionStats('15.1');
    expect(result.data[0].rank).toBeNull();
  });

  it('should paginate correctly', async () => {
    const stats = Array.from({ length: 30 }, (_, i) => ({
      ...mockStat,
      championId: i + 1,
    }));
    repo.findManyByPatch.mockResolvedValue(stats as any);
    tierRank.getPreviousPatch.mockReturnValue(null);
    dataDragon.getChampionById.mockReturnValue({
      id: 'Champ',
      name: 'Champ',
      key: '1',
    });
    dataDragon.getChampionImageUrls.mockResolvedValue({
      square: 'img.png',
      loading: 'l.png',
      splash: 'sp.png',
    });
    tierRank.calculateChampionScore.mockReturnValue({
      score: 50,
      tier: 'A',
      hasInsufficientData: false,
    });

    const result = await service.getChampionStats(
      '15.1',
      2,
      10,
      'winRate',
      'desc',
    );

    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.data).toHaveLength(10);
    expect(result.total).toBe(30);
  });
});
