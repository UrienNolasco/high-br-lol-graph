import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { MatchesModule } from './matches.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import { economyFixture } from '../../../test/fixtures/economy.fixture';

describe('MET12 economy HTTP/OpenAPI contract', () => {
  let app: INestApplication;
  const prisma = {
    ...mockPrismaService(),
    matchProcessing: { findUnique: jest.fn() },
  };
  const input = economyFixture(),
    path = `/api/v1/matches/${input.matchId}/economy/${input.participants[0].puuid}`;
  beforeAll(async () => {
    prisma.$transaction.mockImplementation((queries) => Promise.all(queries));
    app = await createTestingApp(MatchesModule, {
      overrides: [{ provide: PrismaService, useValue: prisma }],
    });
  });
  beforeEach(() => {
    prisma.match.findUnique.mockResolvedValue({
      ...input,
      timelineProjection: input.projection,
    });
    prisma.matchProcessing.findUnique.mockResolvedValue(input.processing);
  });
  afterAll(async () => app.close());
  it('returns real timestamps, intervals and unchanged persisted processing time', async () => {
    const { body } = await request(app.getHttpServer())
      .get(path + '?mode=pastOnly')
      .expect(200);
    expect(body).toMatchObject({
      metricVersion: 1,
      processingVersion: 2,
      processedAt: '2026-09-23T00:00:00.000Z',
      eligible: true,
    });
    expect(body.checkpoints).toHaveLength(4);
    expect(body.samples).toHaveLength(41);
    expect(body.checkpoints[0].actualMs).toBeLessThanOrEqual(300000);
    expect(body.intervals.at(-1)).toMatchObject({
      elapsedMs: 28157,
      partialFinalInterval: true,
    });
    expect(body.unspentGold.maximum.origin).toBe('derived');
  });
  it('serializes global absence rather than fabricating provenance for old data', async () => {
    prisma.matchProcessing.findUnique.mockResolvedValue(null);
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body).toMatchObject({
      processedAt: null,
      processingVersion: null,
      reason: 'missing_processing_provenance',
      samples: [],
    });
    expect(body.checkpoints[0].values.totalGold).toMatchObject({
      value: null,
      origin: 'unavailable',
    });
  });
  it('validates mode and distinguishes unknown participant/match', async () => {
    await request(app.getHttpServer())
      .get(path + '?mode=legacy')
      .expect(400);
    await request(app.getHttpServer())
      .get(`/api/v1/matches/${input.matchId}/economy/unknown`)
      .expect(404);
    prisma.match.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer()).get(path).expect(404);
  });
  it('documents nullable cells and concrete checkpoint/sample/interval schemas', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('MET12').setVersion('1').build(),
    );
    const schemas = document.components!.schemas!;
    expect(schemas.EconomyValueDto).toMatchObject({
      properties: {
        value: { type: 'number', nullable: true },
        reason: { type: 'string', nullable: true },
      },
    });
    expect(schemas.EconomyCheckpointDto).toMatchObject({
      properties: {
        actualMs: { nullable: true },
        comparisonEligible: { type: 'boolean' },
        values: {
          additionalProperties: {
            $ref: '#/components/schemas/EconomyValueDto',
          },
        },
      },
    });
    expect(schemas.MatchEconomyDto).toMatchObject({
      properties: {
        processedAt: { nullable: true },
        samples: { type: 'array' },
        phases: { type: 'array' },
      },
    });
  });
});
