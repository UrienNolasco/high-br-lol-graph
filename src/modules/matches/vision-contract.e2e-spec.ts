import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { MatchesModule } from './matches.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import { projectFinalStats } from '../../core/riot/final-stats';
const match = {
  matchId: 'M',
  gameVersion: '16.2.1',
  gameDuration: 100,
  participants: [
    {
      puuid: 'a',
      teamId: 100,
      finalStats: projectFinalStats({ wardsPlaced: 0, visionScore: 0 }),
    },
  ],
  events: [
    {
      matchId: 'M',
      frameIndex: 0,
      eventIndex: 0,
      type: 'GAME_END',
      timestampMs: 100000,
      actorPuuid: null,
      beneficiaryTeamId: 100,
      payload: {},
      metricVersion: 1,
      processingVersion: 2,
    },
  ],
};
describe('MET11 vision HTTP and OpenAPI', () => {
  let app: INestApplication;
  const prisma = {
    ...mockPrismaService(),
    matchProcessing: { findUnique: jest.fn() },
  };
  const dragon = { getItemCatalogForGameVersion: jest.fn() };
  beforeAll(async () => {
    app = await createTestingApp(MatchesModule, {
      overrides: [
        { provide: PrismaService, useValue: prisma },
        { provide: DataDragonService, useValue: dragon },
      ],
    });
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    prisma.match.findUnique.mockResolvedValue(match);
    prisma.matchProcessing.findUnique.mockResolvedValue({
      status: 'COMPLETED',
      processingVersion: 2,
      completedAt: new Date('2026-09-23T00:00:00Z'),
    });
  });
  it('serializes zero, unavailable ratio, version, evidence and projection-only query', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/matches/M/vision/a')
      .expect(200);
    expect(body.metrics.recognizedPlacements).toMatchObject({
      value: 0,
      unit: 'count',
      metricVersion: 1,
      processingVersion: 2,
    });
    expect(body.metrics.placementShare).toMatchObject({
      value: null,
      reason: 'zero_denominator',
    });
    expect(body.metrics.visionScore.evidence[0]).toMatchObject({
      source: 'MatchParticipant.finalStats',
      field: 'values.visionScore',
      value: 0,
    });
    const query = prisma.match.findUnique.mock.calls.at(-1)![0];
    expect(query.select.events).toBeDefined();
    expect(query.select.raw).toBeUndefined();
    expect(dragon.getItemCatalogForGameVersion).not.toHaveBeenCalled();
  });
  it('preserves processing absence without fabricating timestamp, and returns404 for unknown identities', async () => {
    prisma.matchProcessing.findUnique.mockResolvedValue(null);
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/matches/M/vision/a')
      .expect(200);
    expect(body).toMatchObject({
      metrics: null,
      processedAt: null,
      reason: 'not_calculated',
    });
    await request(app.getHttpServer())
      .get('/api/v1/matches/M/vision/missing')
      .expect(404);
    prisma.match.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/api/v1/matches/missing/vision/a')
      .expect(404);
  });
  it('documents metric maps, nulls, temporal bounds and both gap policies', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = doc.components!.schemas! as Record<string, any>;
    expect(doc.paths['/api/v1/matches/{matchId}/vision/{puuid}']).toBeDefined();
    expect(schemas.MatchVisionDto.properties.metrics.nullable).toBe(true);
    expect(
      schemas.MatchVisionDto.properties.metrics.additionalProperties.$ref,
    ).toContain('MetricResultDto');
    expect(schemas.VisionObjectiveWindowDto.properties.lookbackMs.enum).toEqual(
      [60000, 90000],
    );
    expect(schemas.VisionGapDto.properties.includeGameEdges.type).toBe(
      'boolean',
    );
  });
});
