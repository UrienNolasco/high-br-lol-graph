import { Module, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { StatsController } from './stats.controller';
import { ChampionStatsService } from './services/champion-stats.service';
import { ChampionDetailService } from './services/champion-detail.service';
import { ProcessedMatchesService } from './services/processed-matches.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import {
  paginatedStats,
  championStatsEntry,
} from '../../../test/fixtures/shared/stats.fixture';

@Module({
  controllers: [StatsController],
  providers: [
    { provide: ChampionStatsService, useValue: {} },
    { provide: ChampionDetailService, useValue: {} },
    { provide: ProcessedMatchesService, useValue: {} },
  ],
})
class TestStatsModule {}

describe('StatsController (e2e)', () => {
  let app: INestApplication;
  const championStatsSvc = { getChampionStats: jest.fn() };
  const championDetailSvc = { getChampion: jest.fn() };
  const processedMatchesSvc = { getProcessedMatches: jest.fn() };

  beforeAll(async () => {
    app = await createTestingApp(TestStatsModule, {
      overrides: [
        { provide: ChampionStatsService, useValue: championStatsSvc },
        { provide: ChampionDetailService, useValue: championDetailSvc },
        { provide: ProcessedMatchesService, useValue: processedMatchesSvc },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/stats/champions', () => {
    it('should return paginated champion stats', () => {
      championStatsSvc.getChampionStats.mockResolvedValue(paginatedStats());

      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=15.23')
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toHaveLength(1);
          expect(res.body.total).toBe(1);
        });
    });

    it('should return 400 if patch is missing', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions')
        .expect(400);
    });

    it('should return 400 for invalid page (0)', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=15.23&page=0')
        .expect(400);
    });

    it('should return 400 for invalid limit (>200)', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=15.23&limit=300')
        .expect(400);
    });

    it('should return 400 for invalid patch format', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=invalid-patch')
        .expect(400);
    });

    it('should return 400 for invalid sortBy value', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=15.23&sortBy=invalid')
        .expect(400);
    });

    it('should return 400 for invalid order value', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=15.23&order=invalid')
        .expect(400);
    });

    it('should accept all valid sortBy values', async () => {
      championStatsSvc.getChampionStats.mockResolvedValue(paginatedStats());
      const validSortBy = [
        'winRate',
        'gamesPlayed',
        'championName',
        'banRate',
        'pickRate',
        'kda',
        'dpm',
        'cspm',
        'gpm',
      ];
      for (const sortBy of validSortBy) {
        await request(app.getHttpServer())
          .get(`/api/v1/stats/champions?patch=15.23&sortBy=${sortBy}`)
          .expect(200);
      }
    });

    it('should accept both asc and desc order', async () => {
      championStatsSvc.getChampionStats.mockResolvedValue(paginatedStats());
      await request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=15.23&order=asc')
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=15.23&order=desc')
        .expect(200);
    });

    it('should handle pagination correctly', () => {
      championStatsSvc.getChampionStats.mockResolvedValue(
        paginatedStats({ page: 2, limit: 10 }),
      );
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=15.23&page=2&limit=10')
        .expect(200)
        .expect((res) => {
          expect(res.body.page).toBe(2);
          expect(res.body.limit).toBe(10);
        });
    });
  });

  describe('GET /api/v1/stats/champions/:championName', () => {
    it('should return stats for a specific champion', () => {
      championDetailSvc.getChampion.mockResolvedValue(
        championStatsEntry({ championName: 'Annie' }),
      );
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions/Annie?patch=15.23')
        .expect(200)
        .expect((res) => {
          expect(res.body.championName).toBe('Annie');
        });
    });

    it('should return 200 for non-existent champion (controller delegates to service)', () => {
      championDetailSvc.getChampion.mockResolvedValue(null);
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions/NonExistent?patch=15.23')
        .expect(200);
    });
  });

  describe('GET /api/v1/stats/processed-matches', () => {
    it('should return total count without filter', () => {
      processedMatchesSvc.getProcessedMatches.mockResolvedValue({
        count: 1000,
      });
      return request(app.getHttpServer())
        .get('/api/v1/stats/processed-matches')
        .expect(200)
        .expect((res) => {
          expect(res.body.count).toBe(1000);
        });
    });

    it('should return count with patch filter', () => {
      processedMatchesSvc.getProcessedMatches.mockResolvedValue({
        count: 500,
        patch: '15.23',
      });
      return request(app.getHttpServer())
        .get('/api/v1/stats/processed-matches?patch=15.23')
        .expect(200)
        .expect((res) => {
          expect(res.body.count).toBe(500);
          expect(res.body.patch).toBe('15.23');
        });
    });
  });
});
