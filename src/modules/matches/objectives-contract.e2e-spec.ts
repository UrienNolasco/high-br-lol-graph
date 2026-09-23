import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { MatchesModule } from './matches.module';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import { objectivesFixture } from '../../../test/fixtures/objectives';
describe('MET14 projected objectives HTTP/OpenAPI', () => {
  let app: INestApplication;
  const prisma = {
    ...mockPrismaService(),
    matchProcessing: { findUnique: jest.fn() },
    $transaction: jest.fn(),
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
    jest.clearAllMocks();
    const fixture = objectivesFixture();
    prisma.match.findUnique.mockResolvedValue(fixture);
    prisma.matchProcessing.findUnique.mockResolvedValue(fixture.processing);
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
  });
  const path = '/api/v1/matches/BR1_3200579475/objectives';
  it('serializes source identities, null soul team, all plates and twelve reconciliations through real service/calculator', async () => {
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body).toMatchObject({
      processedAt: '2026-09-23T00:00:00.000Z',
      metricVersion: 1,
      reason: null,
      report: {
        plates: { total: { value: 74 }, killerIdZero: { value: 28 } },
        structures: { towers: { value: 13 }, inhibitors: { value: 2 } },
      },
    });
    expect(body.report.reconciliation).toHaveLength(12);
    expect(body.report.reconciliation.every((r) => r.matches)).toBe(true);
    expect(
      body.report.chronology.find((e) => e.objective === 'soul')
        .beneficiaryTeamId,
    ).toBeNull();
    expect(
      body.report.participantContributions.find(
        (p) => p.championName === 'Fiora',
      ).turretDamageShare.value,
    ).toBeCloseTo(79.14, 2);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    const query = prisma.match.findUnique.mock.calls[0][0];
    expect(query.select.events.where.type.in).toEqual(
      expect.arrayContaining([
        'BUILDING_KILL',
        'TURRET_PLATE_DESTROYED',
        'GAME_END',
      ]),
    );
    expect(Object.keys(query.select)).toEqual([
      'matchId',
      'gameVersion',
      'mapId',
      'teams',
      'participants',
      'events',
    ]);
    expect(dragon.getItemCatalogForGameVersion).not.toHaveBeenCalled();
  });
  it('serializes final observation absence and zero denominator without NaN or a guessed value', async () => {
    const f = objectivesFixture();
    for (const p of f.participants)
      (p.finalStats as any).values.damageDealtToTurrets = 0;
    f.teams[0].finalObjectives = null;
    prisma.match.findUnique.mockResolvedValue(f);
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(
      body.report.participantContributions[0].turretDamageShare,
    ).toMatchObject({
      value: null,
      reason: 'zero_denominator',
      denominator: { value: 0 },
    });
    expect(body.report.finalTotals[0].objectives.tower.kills).toMatchObject({
      value: null,
      reason: 'not_calculated',
    });
    expect(body.report.reconciliation[0].matches).toBeNull();
  });
  it('makes missing provenance and missing timeline explicit, returning404 only for absent matches', async () => {
    prisma.matchProcessing.findUnique.mockResolvedValue(null);
    expect(
      (await request(app.getHttpServer()).get(path).expect(200)).body,
    ).toMatchObject({
      report: null,
      reason: 'not_calculated',
      processingVersion: null,
      processedAt: null,
    });
    const f = objectivesFixture();
    f.events = [];
    prisma.match.findUnique.mockResolvedValue(f);
    prisma.matchProcessing.findUnique.mockResolvedValue(f.processing);
    expect(
      (await request(app.getHttpServer()).get(path).expect(200)).body.report
        .plates.total,
    ).toMatchObject({ value: null, reason: 'missing_frame' });
    prisma.match.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer()).get(path).expect(404);
  });
  it('documents nested metric envelopes, nullable actors/beneficiaries and separate final/event counters', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = doc.components!.schemas! as Record<string, any>;
    expect(doc.paths['/api/v1/matches/{matchId}/objectives']).toBeDefined();
    expect(schemas.MatchObjectivesDto.properties.report.nullable).toBe(true);
    expect(
      schemas.ObjectiveChronologyDto.properties.beneficiaryTeamId.nullable,
    ).toBe(true);
    expect(
      schemas.ObjectiveChronologyDto.properties.assistingPuuids.items.nullable,
    ).toBe(true);
    expect(
      schemas.ObjectiveFinalTotalsDto.properties.objectives.additionalProperties
        .$ref,
    ).toContain('ObjectiveFinalCountDto');
    expect(
      schemas.ObjectiveReconciliationDto.properties.finalCount.$ref,
    ).toContain('MetricResultDto');
    expect(
      schemas.ObjectiveParticipantDto.properties.turretDamageShare.$ref,
    ).toContain('MetricResultDto');
  });
});
