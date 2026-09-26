import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MATCH_CATALOGS } from './ports/catalog-reader';
import { MatchesModule } from './matches.module';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import { bountiesFixture } from '../../../test/fixtures/bounties';
describe('MET30 bounty/steal HTTP and OpenAPI', () => {
  let app: INestApplication;
  const prisma = {
    ...mockPrismaService(),
    matchProcessing: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const dragon = { getItemCatalogForGameVersion: jest.fn() };
  const route = '/api/v1/matches/BR1_3200579475/bounties-steals';
  beforeAll(async () => {
    app = await createTestingApp(MatchesModule, {
      overrides: [
        { provide: PrismaService, useValue: prisma },
        { provide: MATCH_CATALOGS, useValue: dragon },
      ],
    });
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    const f = bountiesFixture();
    prisma.match.findUnique.mockResolvedValue(f);
    prisma.matchProcessing.findUnique.mockResolvedValue(f.processing);
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
  });
  it('serializes effective vs announcement start and distinct literal steal/proximity/bounty observations', async () => {
    const { body } = await request(app.getHttpServer()).get(route).expect(200);
    expect(body).toMatchObject({
      processedAt: '2026-09-23T00:00:00.000Z',
      metricVersion: 1,
      reason: null,
    });
    expect(body.report.windows[0]).toMatchObject({
      announcementTimestampMs: 1245318,
      actualStartTime: 1260000,
      startMs: 1260000,
      endMs: 1555457,
      observedDuration: { value: 295457 },
    });
    expect(body.report.literalRewards).toHaveLength(119);
    const karthus = body.report.participants.find(
      (p) => p.championName === 'Karthus',
    );
    expect(karthus).toMatchObject({
      objectivesStolen: { value: 0 },
      objectivesStolenAssists: { value: 0 },
      challenges: {
        epicMonsterKillsNearEnemyJungler: {
          category: 'proximity',
          metric: { value: 2 },
        },
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    const query = prisma.match.findUnique.mock.calls[0][0];
    expect(Object.keys(query.select)).toEqual([
      'matchId',
      'gameVersion',
      'participants',
      'events',
    ]);
    expect(query.select.participants.select.challenges).toBe(true);
    expect(dragon.getItemCatalogForGameVersion).not.toHaveBeenCalled();
  });
  it('retains right censoring and unknown team without matching unknown boundaries', async () => {
    const f = bountiesFixture();
    f.events = f.events.filter((e) => e.type !== 'OBJECTIVE_BOUNTY_FINISH');
    prisma.match.findUnique.mockResolvedValue(f);
    let body = (await request(app.getHttpServer()).get(route).expect(200)).body;
    expect(body.report.windows[0]).toMatchObject({
      endMs: null,
      censoredEnd: true,
      observedEndMs: expect.any(Number),
    });
    f.events.find(
      (e) => e.type === 'OBJECTIVE_BOUNTY_PRESTART',
    )!.beneficiaryTeamId = null;
    prisma.match.findUnique.mockResolvedValue(f);
    body = (await request(app.getHttpServer()).get(route).expect(200)).body;
    expect(body.report.windows[0]).toMatchObject({
      teamId: null,
      observedDuration: { value: null, reason: 'missing_field' },
      associatedObjectiveCount: { value: null },
    });
  });
  it('distinguishes absent projection/counter from zero and returns404 for unknown matches', async () => {
    const f = bountiesFixture();
    f.participants[0].challenges = {};
    prisma.match.findUnique.mockResolvedValue(f);
    expect(
      (await request(app.getHttpServer()).get(route).expect(200)).body.report
        .participants[0].challenges.epicMonsterSteals.metric,
    ).toMatchObject({ value: null, reason: 'missing_field' });
    prisma.matchProcessing.findUnique.mockResolvedValue(null);
    expect(
      (await request(app.getHttpServer()).get(route).expect(200)).body,
    ).toMatchObject({
      report: null,
      reason: 'missing_projection',
      processedAt: null,
      processingVersion: null,
    });
    prisma.match.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer()).get(route).expect(404);
  });
  it('documents nullable observed endpoints, literal metrics, challenge categories and version scope', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = doc.components!.schemas! as Record<string, any>;
    expect(
      doc.paths['/api/v1/matches/{matchId}/bounties-steals'],
    ).toBeDefined();
    expect(schemas.MatchBountiesStealsDto.properties.report.nullable).toBe(
      true,
    );
    expect(schemas.BountyWindowDto.properties.endMs.nullable).toBe(true);
    expect(schemas.BountyWindowDto.properties.teamId.nullable).toBe(true);
    expect(
      schemas.ParticipantStealsDto.properties.challenges.additionalProperties
        .$ref,
    ).toContain('StealChallengeDto');
    expect(
      JSON.stringify(schemas.LiteralBountyRewardDto.properties.shutdownBounty),
    ).toContain('MetricResultDto');
    expect(
      schemas.BountyContractsDto.properties.currentPatchFixtureValidated.type,
    ).toBe('boolean');
  });
});
