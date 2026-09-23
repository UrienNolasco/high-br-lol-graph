import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { StatsModule } from './stats.module';
import { ChampionStatsRepository } from './repositories/champion-stats.repository';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { createTestingApp } from '../../../test/helpers/app.builder';

describe('H07 popularity HTTP and OpenAPI', () => {
  let app: INestApplication;
  const repo = {
    findPopulation: jest.fn(),
    findManyByPatch: jest.fn().mockResolvedValue([]),
  };
  const row = {
    championId: 9999,
    championName: null,
    patch: '16.2',
    queueId: 420,
    gamesPlayed: 0,
    performanceN: 0,
    wins: null,
    losses: null,
    winRate: null,
    kda: null,
    dpm: null,
    cspm: null,
    gpm: null,
    pickRate: 0,
    banRate: 50,
    pickedMatches: 0,
    bannedMatches: 1,
    eligibleN: 2,
    selectedN: 2,
    bansObservedN: 2,
    excludedN: 0,
    excludedReasons: {},
  };
  beforeAll(async () => {
    repo.findPopulation.mockResolvedValue({
      champions: [row],
      cohort: {
        patch: '16.2',
        queueId: 420,
        mapId: 11,
        eligibleN: 2,
        selectedN: 2,
        bansObservedN: 2,
        excludedN: 0,
        excludedReasons: {},
      },
    });
    app = await createTestingApp(StatsModule, {
      overrides: [
        { provide: ChampionStatsRepository, useValue: repo },
        {
          provide: PrismaService,
          useValue: {
            match: {
              findMany: jest
                .fn()
                .mockResolvedValue([{ gameVersion: '16.2.1' }]),
            },
          },
        },
        {
          provide: DataDragonService,
          useValue: {
            getChampionById: () => undefined,
            getChampionByName: () => undefined,
          },
        },
      ],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  it('preserves ban-only IDs/null performance/catalog through real list/detail services', async () => {
    const list = await request(app.getHttpServer())
      .get('/api/v1/stats/champions?patch=16.2&queueId=420')
      .expect(200);
    expect(list.body.data[0]).toMatchObject({
      championId: 9999,
      championName: null,
      images: null,
      gamesPlayed: 0,
      pickRate: 0,
      banRate: 50,
      winRate: null,
      score: null,
      rank: null,
      availability: { performance: 'no_picks', catalog: 'missing_catalog' },
      population: { eligibleN: 2, bannedMatches: 1 },
      tierMethod: { kind: 'heuristic', version: 2 },
    });
    const detail = await request(app.getHttpServer())
      .get('/api/v1/stats/champions/9999?patch=16.2')
      .expect(200);
    expect(detail.body).toEqual(list.body.data[0]);
  });
  it('validates queue and required exact patch in both routes', async () => {
    for (const url of [
      '/api/v1/stats/champions?patch=16.2&queueId=450',
      '/api/v1/stats/champions/9999?patch=16.2&queueId=450',
      '/api/v1/stats/champions/9999',
    ])
      await request(app.getHttpServer()).get(url).expect(400);
  });
  it('publishes actual nullable types and population/heuristic metadata', () => {
    const schemas = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('H07').setVersion('1').build(),
    ).components!.schemas!;
    expect(schemas.ChampionStatsDto).toMatchObject({
      properties: {
        banRate: { type: 'number', nullable: true },
        winRate: { type: 'number', nullable: true },
        championName: { type: 'string', nullable: true },
        population: { type: 'object' },
        tierMethod: { type: 'object' },
      },
    });
  });
});
