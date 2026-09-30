import { gunzipSync } from 'node:zlib';
import { projectTimelineSnapshots } from '../../../test/fixtures/match-processing';
import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { AnalyticsModule } from './analytics.module';
import { AnalyticsRepository } from './repositories/analytics.repository';
import { PrismaService } from '../../core/prisma/prisma.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import { comparisonFixture, timelineFixture } from './pure/cohort.fixture';

describe('MET-08 comparison HTTP contract', () => {
  let app: INestApplication;
  const repo = { findUserByPuuid: jest.fn(), findComparisonCohort: jest.fn() };
  beforeAll(async () => {
    repo.findUserByPuuid.mockResolvedValue({ gameName: 'Synthetic' });
    repo.findComparisonCohort.mockResolvedValue({
      matches: [comparisonFixture()],
      projections: [
        {
          matchId: 'm1',
          ...projectTimelineSnapshots(
            JSON.parse(gunzipSync(timelineFixture()).toString()),
            new Map([
              [1, 'hero'],
              [6, 'enemy'],
            ]),
          ),
        },
      ],
      eligibleN: 3,
      returnedN: 1,
      limit: 1,
      truncated: true,
    });
    app = await createTestingApp(AnalyticsModule, {
      overrides: [
        { provide: AnalyticsRepository, useValue: repo },
        { provide: PrismaService, useValue: mockPrismaService() },
      ],
    });
  });
  afterAll(async () => {
    await app.close();
  });
  it('serializes null/reasons, all filters, counts and evidence through the actual service', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/analytics/compare')
      .query({
        heroPuuid: 'hero',
        villainPuuid: 'v',
        role: 'MIDDLE',
        championId: 1,
        patch: '16.2',
        queueId: 440,
        startDate: 0,
        endDate: 1000,
        limit: 1,
      })
      .expect(200);
    expect(repo.findComparisonCohort).toHaveBeenCalledWith('hero', {
      role: 'MIDDLE',
      championId: 1,
      patch: '16.2',
      queueId: 440,
      startDate: 0,
      endDate: 1000,
      limit: 1,
    });
    expect(res.body.hero).toMatchObject({
      stats: { gamesPlayed: 1, avgCspm: 10 },
      cohort: {
        eligibleN: 3,
        returnedN: 1,
        truncated: true,
        timelineSource: 'MatchTimelineProjection',
      },
      laningPhase: {
        soloKills15: null,
        soloDeaths15: null,
        soloKills15Reason: 'no_valid_samples',
        samples: { cs: { validN: 1 } },
      },
    });
    expect(res.body.timelineComparison.csGraph.hero[15]).toMatchObject({
      minute: 15,
      value: 100,
      validN: 1,
      evidence: [{ matchId: 'm1', timestampMs: 900000, offsetMs: 0 }],
    });
  });
  it.each([
    { limit: 101 },
    { limit: 0 },
    { startDate: -1 },
    { startDate: 20, endDate: 10 },
    { queueId: 'x' },
    { patch: '16.2.5' },
  ])('rejects invalid query %j', async (filters) => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/compare')
      .query({ heroPuuid: 'h', villainPuuid: 'v', ...filters })
      .expect(400);
  });
  it('publishes nullable values and cohort/checkpoint coverage in OpenAPI', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('MET08').setVersion('1').build(),
    );
    expect(doc.components?.schemas?.LaningPhaseDto).toMatchObject({
      properties: {
        soloKills15: { type: 'number', nullable: true },
        soloKills15Reason: { type: 'string' },
        samples: { type: 'object' },
      },
    });
    expect(doc.components?.schemas?.TimelinePointDto).toMatchObject({
      properties: {
        value: { type: 'number', nullable: true },
        validN: { type: 'number' },
        evidence: { type: 'array' },
      },
    });
    expect(doc.paths['/api/v1/analytics/compare'].get?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'startDate' }),
        expect.objectContaining({ name: 'queueId' }),
        expect.objectContaining({ name: 'limit' }),
      ]),
    );
  });
});
