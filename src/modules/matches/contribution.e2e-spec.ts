import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { MatchesModule } from './matches.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import { contributionFixture } from '../../../test/fixtures/contribution';

describe('Contribution HTTP contract (real repository, service and calculation)', () => {
  let app: INestApplication;
  const prisma = {
    ...mockPrismaService(),
    matchProcessing: { findUnique: jest.fn() },
  };
  const route = (puuid: string) =>
    `/api/v1/matches/BR1_3200579475/contribution/${puuid}`;
  beforeAll(async () => {
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma),
    );
    app = await createTestingApp(MatchesModule, {
      overrides: [{ provide: PrismaService, useValue: prisma }],
    });
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    const fixture = contributionFixture();
    prisma.match.findUnique.mockResolvedValue(fixture.match);
    prisma.matchProcessing.findUnique.mockResolvedValue(fixture.processing);
  });

  it('returns four dimensions and reconciled tower/shield contributions without a rating', async () => {
    const fixture = contributionFixture();
    const fiora = fixture.match.participants.find(
      (p) => p.championName === 'Fiora',
    )!;
    const { body } = await request(app.getHttpServer())
      .get(route(fiora.puuid))
      .expect(200);
    expect(Object.keys(body.dimensions)).toEqual([
      'resources',
      'combat',
      'vision',
      'structures',
    ]);
    expect(body.dimensions.structures.turretDamage.teamShare.value).toBeCloseTo(
      79.14,
      2,
    );
    expect(body.dimensions.structures.turretDamage.teamShare).toMatchObject({
      unit: 'percent',
      metricId: 'O03',
      processingVersion: 2,
      origin: 'derived',
      reason: null,
    });
    expect(body.processedAt).toBe('2026-09-23T00:00:00.000Z');
    expect(body).not.toHaveProperty('score');
    const milio = fixture.match.participants.find(
      (p) => p.championName === 'Milio',
    )!;
    const support = await request(app.getHttpServer())
      .get(route(milio.puuid))
      .expect(200);
    expect(support.body.dimensions.combat.allyShielding.absolute.value).toBe(
      19049,
    );
    expect(support.body.roleExplanation).toContain('suporte');
  });

  it('serializes incomplete coverage and missing denominators explicitly', async () => {
    const fixture = contributionFixture();
    const player = fixture.match.participants[0];
    const teammate = fixture.match.participants.find(
      (p) => p.teamId === player.teamId && p.puuid !== player.puuid,
    )!;
    (teammate.finalStats as any).values.goldEarned = null;
    prisma.match.findUnique.mockResolvedValue(fixture.match);
    const { body } = await request(app.getHttpServer())
      .get(route(player.puuid))
      .expect(200);
    expect(body.dimensions.resources.gold.teamShare).toMatchObject({
      value: null,
      origin: 'unavailable',
      reason: 'missing_field',
      denominator: { value: null },
      quality: { coverage: 0.8 },
    });
    expect(body.dimensions.resources.gold.absolute.value).not.toBeNull();
  });

  it('returns a documented unavailable state for missing processing provenance and 404 for missing subject/match', async () => {
    const fixture = contributionFixture();
    prisma.matchProcessing.findUnique.mockResolvedValue(null);
    const { body } = await request(app.getHttpServer())
      .get(route(fixture.match.participants[0].puuid))
      .expect(200);
    expect(body).toMatchObject({
      dimensions: null,
      processedAt: null,
      processingVersion: null,
      reason: 'not_calculated',
    });
    await request(app.getHttpServer()).get(route('missing-player')).expect(404);
    prisma.match.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer()).get(route('missing-player')).expect(404);
  });

  it('documents nullable report/metrics and the four dimension schema in OpenAPI', () => {
    const schemas = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    ).components!.schemas! as Record<string, any>;
    expect(schemas.MatchContributionDto.properties.dimensions.nullable).toBe(
      true,
    );
    expect(
      schemas.MatchContributionDto.properties.processingVersion.nullable,
    ).toBe(true);
    expect(schemas.ContributionDimensionsDto.required).toEqual([
      'resources',
      'combat',
      'vision',
      'structures',
    ]);
    expect(schemas.MetricResultDto.properties.value.nullable).toBe(true);
    expect(schemas.MetricResultDto.required).toEqual(
      expect.arrayContaining([
        'denominator',
        'quality',
        'evidence',
        'reason',
        'metricVersion',
      ]),
    );
  });
});
