import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
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
  });
});
