import { Test, TestingModule } from '@nestjs/testing';
import { ChampionDetailService } from './champion-detail.service';
import { ChampionStatsRepository } from '../repositories/champion-stats.repository';
import { DataDragonService } from '../../../core/data-dragon/data-dragon.service';
import { TierRankService } from './tier-rank.service';

describe('ChampionDetailService', () => {
  let service: ChampionDetailService;
  let repo: jest.Mocked<
    Pick<
      ChampionStatsRepository,
      'findByChampionIdAndPatch' | 'findQualifiedStats'
    >
  >;
  let dataDragon: jest.Mocked<
    Pick<DataDragonService, 'getChampionByName' | 'getChampionImageUrls'>
  >;
  let tierRank: jest.Mocked<
    Pick<
      TierRankService,
      'getPreviousPatch' | 'calculateChampionScore' | 'getChampionStats'
    >
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
    repo = {
      findByChampionIdAndPatch: jest.fn(),
      findQualifiedStats: jest.fn(),
    } as any;
    dataDragon = {
      getChampionByName: jest.fn(),
      getChampionImageUrls: jest.fn(),
    } as any;
    tierRank = {
      getPreviousPatch: jest.fn(),
      calculateChampionScore: jest.fn(),
      getChampionStats: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChampionDetailService,
        { provide: ChampionStatsRepository, useValue: repo },
        { provide: DataDragonService, useValue: dataDragon },
        { provide: TierRankService, useValue: tierRank },
      ],
    }).compile();
    service = module.get<ChampionDetailService>(ChampionDetailService);
  });

  it('should return champion detail', async () => {
    dataDragon.getChampionByName.mockReturnValue({
      id: 'Annie',
      name: 'Annie',
      key: '1',
    });
    repo.findByChampionIdAndPatch.mockResolvedValue(mockStat as any);
    dataDragon.getChampionImageUrls.mockResolvedValue({
      square: 'img.png',
      loading: 'l.png',
      splash: 'sp.png',
    });
    tierRank.getPreviousPatch.mockReturnValue(null);
    tierRank.calculateChampionScore.mockReturnValue({
      score: 75,
      tier: 'S',
      hasInsufficientData: true,
    });

    const result = await service.getChampion('Annie', '15.1');

    expect(result.championName).toBe('Annie');
    expect(result.tier).toBe('S');
    expect(result.rank).toBeNull();
  });

  it('should throw NotFoundException when champion not found', async () => {
    dataDragon.getChampionByName.mockReturnValue(null);
    await expect(service.getChampion('FakeChamp', '15.1')).rejects.toThrow(
      'Champion FakeChamp not found',
    );
  });

  it('should throw NotFoundException when stats not found', async () => {
    dataDragon.getChampionByName.mockReturnValue({
      id: 'Annie',
      name: 'Annie',
      key: '1',
    });
    repo.findByChampionIdAndPatch.mockResolvedValue(null);
    await expect(service.getChampion('Annie', '15.1')).rejects.toThrow(
      'Stats for champion Annie not found on patch 15.1',
    );
  });

  it('should calculate rank when sufficient data', async () => {
    dataDragon.getChampionByName.mockReturnValue({
      id: 'Annie',
      name: 'Annie',
      key: '1',
    });
    repo.findByChampionIdAndPatch.mockResolvedValue({
      ...mockStat,
      championId: 2,
    } as any);
    dataDragon.getChampionImageUrls.mockResolvedValue({
      square: 'img.png',
      loading: 'l.png',
      splash: 'sp.png',
    });
    tierRank.getPreviousPatch.mockReturnValue(null);
    repo.findQualifiedStats.mockResolvedValue([
      { ...mockStat, championId: 1 },
      { ...mockStat, championId: 2 },
      { ...mockStat, championId: 3 },
    ] as any);
    tierRank.calculateChampionScore
      .mockReturnValueOnce({ score: 75, tier: 'S', hasInsufficientData: false })
      .mockReturnValueOnce({ score: 50, tier: 'A', hasInsufficientData: false })
      .mockReturnValueOnce({
        score: 90,
        tier: 'S+',
        hasInsufficientData: false,
      })
      .mockReturnValueOnce({
        score: 30,
        tier: 'C',
        hasInsufficientData: false,
      });

    const result = await service.getChampion('Annie', '15.1');

    expect(result.rank).toBe(2);
  });
});
