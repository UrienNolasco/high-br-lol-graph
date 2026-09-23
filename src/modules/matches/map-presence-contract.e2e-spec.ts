import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { MatchesModule } from './matches.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import { mapPresenceFixture } from '../../../test/fixtures/map-presence';

describe('B08 sampled map presence HTTP contract', () => {
  let app: INestApplication;
  const prisma = {
    ...mockPrismaService(),
    matchProcessing: { findUnique: jest.fn() },
  };
  const input = mapPresenceFixture(),
    path = `/api/v1/matches/${input.matchId}/map-presence/${input.participants[0].puuid}`;
  beforeAll(async () => {
    prisma.$transaction.mockImplementation((queries) => Promise.all(queries));
    app = await createTestingApp(MatchesModule, {
      overrides: [{ provide: PrismaService, useValue: prisma }],
    });
  });
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.match.findUnique.mockResolvedValue({
      ...input,
      timelineProjection: input.projection,
    });
    prisma.matchProcessing.findUnique.mockResolvedValue(input.processing);
  });
  afterAll(async () => app.close());
  it('publishes versioned polygons, sample fractions, actual cadence and persisted provenance', async () => {
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body).toMatchObject({
      metricId: 'B08',
      metricVersion: 1,
      processedAt: '2026-09-23T00:00:00.000Z',
      quality: { validSamples: 41, totalSamples: 41 },
      definition: { version: 1, mapId: 11 },
      evidence: { subjectKind: 'player', wardPositionsUsed: false },
    });
    expect(body.definition.regions).toHaveLength(9);
    expect(body.samples).toHaveLength(41);
    expect(body.sampling.validPositions.intervals.at(-1).elapsedMs).toBe(28157);
    expect(body.absolute.reduce((n, r) => n + r.sampleCount, 0)).toBe(41);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Array), {
      isolationLevel: 'RepeatableRead',
    });
    const selected = prisma.match.findUnique.mock.calls[0][0].select;
    expect(selected.participants.select).toEqual({ puuid: true, teamId: true });
    expect(selected.events).toBeUndefined();
    expect(selected.raw).toBeUndefined();
  });
  it('returns explicit absence for missing provenance, unsupported definition and missing position', async () => {
    prisma.matchProcessing.findUnique.mockResolvedValue(null);
    let response = await request(app.getHttpServer()).get(path).expect(200);
    expect(response.body).toMatchObject({
      processedAt: null,
      processingVersion: null,
      reason: 'missing_processing_provenance',
    });
    expect(response.body.absolute.every((r) => r.fraction === null)).toBe(true);
    prisma.matchProcessing.findUnique.mockResolvedValue(input.processing);
    prisma.match.findUnique.mockResolvedValue({
      ...input,
      mapId: 12,
      timelineProjection: input.projection,
    });
    response = await request(app.getHttpServer()).get(path).expect(200);
    expect(response.body).toMatchObject({
      definition: null,
      reason: 'unsupported_map_definition',
    });
  });
  it('distinguishes absent match and participant', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/matches/${input.matchId}/map-presence/unknown`)
      .expect(404);
    prisma.match.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer()).get(path).expect(404);
  });
  it('documents nullable sample coordinates/fractions and concrete phase distributions', () => {
    const schemas = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('B08').setVersion('1').build(),
    ).components!.schemas!;
    expect(schemas.PositionSampleDto).toMatchObject({
      properties: {
        position: { type: 'object', nullable: true },
        timestampMs: { type: 'number', nullable: true },
        reason: { type: 'string', nullable: true },
      },
    });
    expect(schemas.RegionFrequencyDto).toMatchObject({
      properties: {
        fraction: { type: 'number', nullable: true },
        sampleCount: { type: 'number' },
      },
    });
    expect(schemas.MapPresenceDto).toMatchObject({
      properties: {
        phases: { type: 'array' },
        processedAt: { nullable: true },
        definition: { nullable: true },
      },
    });
  });
});
