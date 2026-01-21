import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { ApiService } from '../src/modules/api/api.service';
import { PaginatedChampionStatsDto } from '../src/modules/api/dto/champion-stats.dto';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });
});

describe('StatsController (e2e)', () => {
  let app: INestApplication;
  const mockStats: PaginatedChampionStatsDto = {
    data: [
      {
        championId: 1,
        championName: 'Annie',
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
        tier: 'A',
        rank: 3,
        images: { square: 'url', loading: 'url', splash: 'url' },
      },
    ],
    total: 1,
    page: 1,
    limit: 20,
  };

  const apiServiceMock = {
    getChampionStats: () => mockStats,
    getChampion: () => ({ ...mockStats.data[0] }),
    getMatchupStats: () => ({}),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ApiService)
      .useValue(apiServiceMock)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/api/v1/stats/champions (GET)', () => {
    it('should return paginated champion stats', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=12.23')
        .expect(200)
        .expect((res) => {
          expect(res.body).toEqual(mockStats);
        });
    });

    it('should return a validation error if patch is missing', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions')
        .expect(400);
    });

    it('should return a validation error for invalid page', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=12.23&page=0')
        .expect(400);
    });

    it('should return a validation error for invalid limit', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=12.23&limit=300')
        .expect(400);
    });

    it('should return a validation error for invalid patch format', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=invalid-patch')
        .expect(400);
    });

    it('should validate sortBy enum values', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=12.23&sortBy=invalid')
        .expect(400);
    });

    it('should validate order enum values', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=12.23&order=invalid')
        .expect(400);
    });

    it('should accept valid sortBy parameters', () => {
      const validSortBy = [
        'winRate',
        'gamesPlayed',
        'kda',
        'dpm',
        'cspm',
        'gpm',
        'banRate',
        'pickRate',
        'championName',
      ];

      const tests = validSortBy.map((sortBy) =>
        request(app.getHttpServer())
          .get(`/api/v1/stats/champions?patch=12.23&sortBy=${sortBy}`)
          .expect(200),
      );

      return Promise.all(tests);
    });

    it('should accept both asc and desc order', () => {
      return Promise.all([
        request(app.getHttpServer())
          .get('/api/v1/stats/champions?patch=12.23&order=asc')
          .expect(200),
        request(app.getHttpServer())
          .get('/api/v1/stats/champions?patch=12.23&order=desc')
          .expect(200),
      ]);
    });

    it('should handle pagination correctly', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions?patch=12.23&page=2&limit=10')
        .expect(200)
        .expect((res) => {
          expect(res.body.page).toBe(2);
          expect(res.body.limit).toBe(10);
        });
    });
  });

  describe('/api/v1/stats/champions/:championName (GET)', () => {
    it('should return stats for a specific champion', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions/Annie?patch=12.23')
        .expect(200)
        .expect((res) => {
          expect(res.body.championName).toBe('Annie');
        });
    });

    it('should return 404 for non-existent champion', () => {
      apiServiceMock.getChampion = () => null;
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions/NonExistent?patch=12.23')
        .expect(404);
    });

    it('should validate patch parameter', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/champions/Annie')
        .expect(400);
    });
  });

  describe('/api/v1/stats/matchups/:championA/:championB (GET)', () => {
    it('should return matchup stats', () => {
      const mockMatchup = {
        championA: {
          name: 'Annie',
          images: { square: 'url', loading: 'url', splash: 'url' },
          winRate: 55,
          wins: 55,
        },
        championB: {
          name: 'Ahri',
          images: { square: 'url', loading: 'url', splash: 'url' },
          winRate: 45,
          wins: 45,
        },
        gamesPlayed: 100,
        patch: '12.23',
        role: 'MIDDLE',
      };
      apiServiceMock.getMatchupStats = () => mockMatchup;

      return request(app.getHttpServer())
        .get('/api/v1/stats/matchups/Annie/Ahri?patch=12.23&role=MIDDLE')
        .expect(200)
        .expect((res) => {
          expect(res.body.championA.name).toBe('Annie');
          expect(res.body.championB.name).toBe('Ahri');
        });
    });

    it('should require role parameter', () => {
      return request(app.getHttpServer())
        .get('/api/v1/stats/matchups/Annie/Ahri?patch=12.23')
        .expect(400);
    });

    it('should validate champion names', () => {
      apiServiceMock.getMatchupStats = () => {
        throw new Error('Champion not found');
      };
      return request(app.getHttpServer())
        .get('/api/v1/stats/matchups/Invalid/Champion?patch=12.23&role=MIDDLE')
        .expect(404);
    });
  });

  describe('/api/v1/stats/processed-matches (GET)', () => {
    it('should return total count without filter', () => {
      apiServiceMock.getProcessedMatches = () => ({ count: 1000 });
      return request(app.getHttpServer())
        .get('/api/v1/stats/processed-matches')
        .expect(200)
        .expect((res) => {
          expect(res.body.count).toBe(1000);
        });
    });

    it('should return count with patch filter', () => {
      apiServiceMock.getProcessedMatches = (patch) => ({ count: 500, patch });
      return request(app.getHttpServer())
        .get('/api/v1/stats/processed-matches?patch=12.23')
        .expect(200)
        .expect((res) => {
          expect(res.body.count).toBe(500);
          expect(res.body.patch).toBe('12.23');
        });
    });

    it('should return message for patch with no data', () => {
      apiServiceMock.getProcessedMatches = (patch) => ({
        count: 0,
        patch,
        message: 'No data',
      });
      return request(app.getHttpServer())
        .get('/api/v1/stats/processed-matches?patch=99.99')
        .expect(200)
        .expect((res) => {
          expect(res.body.count).toBe(0);
          expect(res.body.message).toBeDefined();
        });
    });
  });

  describe('/api/v1/champions (GET)', () => {
    it('should return list of all champions', () => {
      const mockChampions = {
        champions: [
          {
            name: 'Annie',
            id: 'Annie',
            key: 1,
            title: 'test',
            version: '1.0',
            images: { square: 'url', loading: 'url', splash: 'url' },
          },
        ],
        total: 1,
      };
      apiServiceMock.getAllChampions = () => mockChampions;

      return request(app.getHttpServer())
        .get('/api/v1/champions')
        .expect(200)
        .expect((res) => {
          expect(res.body.champions).toBeDefined();
          expect(res.body.total).toBe(1);
        });
    });
  });

  describe('/api/v1/champions/current-patch (GET)', () => {
    it('should return available patches with current highlighted', () => {
      const mockPatches = {
        patches: [
          { patch: '15.23', fullVersion: '15.23.1' },
          { patch: '15.22', fullVersion: '15.22.2' },
        ],
        current: { patch: '15.23', fullVersion: '15.23.1' },
      };
      apiServiceMock.getCurrentPatch = () => mockPatches;

      return request(app.getHttpServer())
        .get('/api/v1/champions/current-patch')
        .expect(200)
        .expect((res) => {
          expect(res.body.patches).toHaveLength(2);
          expect(res.body.current).toEqual({
            patch: '15.23',
            fullVersion: '15.23.1',
          });
        });
    });
  });

  describe('/api/rate-limit/status (GET)', () => {
    it('should return rate limit status', () => {
      const mockStatus = { tokens: 9, maxTokens: 10, windowMs: 60000 };
      apiServiceMock.getStatus = () => mockStatus;

      return request(app.getHttpServer())
        .get('/api/rate-limit/status')
        .expect(200)
        .expect((res) => {
          expect(res.body.tokens).toBe(9);
          expect(res.body.maxTokens).toBe(10);
        });
    });
  });

  describe('/api/rate-limit/reset (GET)', () => {
    it('should reset rate limit', () => {
      apiServiceMock.clear = () => ({
        message: 'Rate limit tokens resetados com sucesso',
      });

      return request(app.getHttpServer())
        .get('/api/rate-limit/reset')
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toContain('resetados');
        });
    });
  });
});
