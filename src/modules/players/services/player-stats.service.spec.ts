import { Test, TestingModule } from '@nestjs/testing';
import { PlayerStatsService } from './player-stats.service';
import { PlayerStatsRepository } from '../repositories/player-stats.repository';
import { DataDragonService } from '../../../core/data-dragon/data-dragon.service';
import { PinoLogger } from 'nestjs-pino';

describe('PlayerStatsService', () => {
  let service: PlayerStatsService;
  let statsRepo: jest.Mocked<Pick<PlayerStatsRepository, 'getAggregatedStats' | 'getChampionStats' | 'getRoleDistribution' | 'getActivityData'>>;
  let dataDragon: jest.Mocked<Pick<DataDragonService, 'getChampionById' | 'getChampionImageUrls'>>;

  beforeEach(async () => {
    statsRepo = {
      getAggregatedStats: jest.fn(),
      getChampionStats: jest.fn(),
      getRoleDistribution: jest.fn(),
      getActivityData: jest.fn(),
    } as any;

    dataDragon = {
      getChampionById: jest.fn(),
      getChampionImageUrls: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerStatsService,
        { provide: PlayerStatsRepository, useValue: statsRepo },
        { provide: DataDragonService, useValue: dataDragon },
        { provide: PinoLogger, useValue: { setContext: jest.fn(), info: jest.fn() } },
      ],
    }).compile();

    service = module.get<PlayerStatsService>(PlayerStatsService);
  });

  describe('getSummary', () => {
    it('should return enriched summary', async () => {
      statsRepo.getAggregatedStats.mockResolvedValue({
        puuid: 'p1',
        patch: '15.1',
        queueId: 420,
        gamesPlayed: 100,
        wins: 55,
        losses: 45,
        winRate: 55,
        avgKda: 2.5,
        avgCspm: 7.2,
        avgDpm: 650,
        avgGpm: 450,
        avgVisionScore: 20,
        roleDistribution: { MID: 50 },
        topChampions: [{ championId: 1, games: 30, winRate: 60 }],
        lastUpdated: new Date(),
      } as any);

      dataDragon.getChampionById.mockReturnValue({ id: 'Annie', name: 'Annie' });

      const result = await service.getSummary('p1', { patch: '15.1' });

      expect(result.puuid).toBe('p1');
      expect(result.topChampions[0].championName).toBe('Annie');
    });

    it('should throw NotFoundException if no stats', async () => {
      statsRepo.getAggregatedStats.mockResolvedValue(null);

      await expect(service.getSummary('p1', { patch: '15.1' })).rejects.toThrow('No stats found for player p1');
    });
  });

  describe('getChampions', () => {
    it('should return sorted and enriched champions', async () => {
      statsRepo.getChampionStats.mockResolvedValue([
        {
          championId: 1, gamesPlayed: 10, wins: 6, losses: 4, winRate: 60,
          avgKda: 3, avgCspm: 7, avgDpm: 600, avgGpm: 400, avgVisionScore: 20,
          avgCsd15: 5, avgGd15: 200, avgXpd15: 100,
          roleDistribution: { MID: 10 }, lastPlayedAt: new Date(),
        } as any,
      ]);

      dataDragon.getChampionById.mockReturnValue({ id: 'Annie', name: 'Annie' });
      dataDragon.getChampionImageUrls.mockResolvedValue({ square: 'img.png' });

      const result = await service.getChampions('p1', { patch: '15.1' });

      expect(result.champions).toHaveLength(1);
      expect(result.champions[0].championName).toBe('Annie');
      expect(result.champions[0].imageUrl).toBe('img.png');
    });
  });

  describe('getRoleDistribution', () => {
    it('should return role distribution', async () => {
      statsRepo.getRoleDistribution.mockResolvedValue([
        { role: 'MID', gamesplayed: BigInt(50), wins: BigInt(30), losses: BigInt(20), winrate: 60, avgkda: 3.5 },
        { role: 'TOP', gamesplayed: BigInt(30), wins: BigInt(15), losses: BigInt(15), winrate: 50, avgkda: 2.5 },
      ]);

      const result = await service.getRoleDistribution('p1', { patch: 'ALL' });

      expect(result.roles).toHaveLength(2);
      expect(result.totalGames).toBe(80);
      expect(result.roles[0].role).toBe('MID');
    });
  });

  describe('getActivity', () => {
    it('should return activity heatmap with insights', async () => {
      statsRepo.getActivityData.mockResolvedValue([
        { dayofweek: 1, hour: 14, games: BigInt(10), wins: BigInt(7), losses: BigInt(3), winrate: 70 },
      ]);

      const result = await service.getActivity('p1', { patch: 'ALL' });

      expect(result.heatmap).toHaveLength(168);
      expect(result.insights.mostActiveDay).toBeDefined();
    });
  });
});
