import { SequencesReport } from './pure/sequences-calculator';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MATCH_CATALOGS } from './ports/catalog-reader';
import { MatchesModule } from './matches.module';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import { sequencesFixture } from '../../../test/fixtures/sequences';
describe('MET15 projected sequences HTTP/OpenAPI', () => {
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
        { provide: MATCH_CATALOGS, useValue: dragon },
      ],
    });
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    const f = sequencesFixture();
    prisma.match.findUnique.mockResolvedValue({
      ...f,
      timelineProjection: f.projection,
    });
    prisma.matchProcessing.findUnique.mockResolvedValue(f.processing);
    prisma.$transaction.mockImplementation(
      (fn: (tx: typeof prisma) => unknown) => fn(prisma),
    );
  });
  const path = '/api/v1/matches/BR1_3200579475/sequences';
  it('serializes real calculator evidence and versioned windows without raw reads or network', async () => {
    const response = await request(app.getHttpServer()).get(path).expect(200);
    const body = response.body as SequencesReport;
    expect(body).toMatchObject({
      metricVersion: 1,
      processedAt: '2026-09-23T00:00:00.000Z',
      reason: null,
      parameters: { version: 1, eventBounds: '(]', checkpointMode: 'pastOnly' },
      report: {
        comeback: {
          winnerTeamId: 100,
          firstPersistentLead: { frameIndex: 28 },
          largestObservedDeficit: { value: 4750 },
        },
      },
    });
    const baron = body.report!.goldChanges.find(
      (e) => e.objective.objective === 'BARON_NASHOR',
    );
    expect(
      body.report!.killEpisodes.filter(
        (e) =>
          e.subjectId === '200' &&
          e.windowMs === 60000 &&
          e.objectives.some((o) => o.eventId === baron!.objective.eventId),
      ),
    ).toHaveLength(5);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    const query = prisma.match.findUnique.mock.calls[0][0];
    expect(Object.keys(query.select)).toEqual([
      'matchId',
      'gameVersion',
      'mapId',
      'timelineProjection',
      'participants',
      'teams',
      'events',
    ]);
    expect(dragon.getItemCatalogForGameVersion).not.toHaveBeenCalled();
  });
  it('keeps missing provenance, snapshots and end markers explicit;404 only for absent match', async () => {
    prisma.matchProcessing.findUnique.mockResolvedValue(null);
    expect(
      (await request(app.getHttpServer()).get(path).expect(200)).body,
    ).toMatchObject({
      report: null,
      processedAt: null,
      processingVersion: null,
      reason: 'not_calculated',
    });
    const f = sequencesFixture();
    f.events = f.events.filter((e) => e.type !== 'GAME_END');
    prisma.matchProcessing.findUnique.mockResolvedValue(f.processing);
    prisma.match.findUnique.mockResolvedValue({
      ...f,
      timelineProjection: null,
    });
    const response = await request(app.getHttpServer()).get(path).expect(200);
    const body = response.body as SequencesReport;
    expect(body.report!.killRates[0].rate).toMatchObject({
      value: null,
      reason: 'incomplete_events',
    });
    expect(body.report!.comeback.largestObservedDeficit).toMatchObject({
      value: null,
      reason: 'missing_projection',
    });
    prisma.match.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer()).get(path).expect(404);
  });
  it('documents nullable reports, nested objective/frame identities and eligible denominators', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = doc.components!.schemas! as Record<string, any>;
    expect(doc.paths['/api/v1/matches/{matchId}/sequences']).toBeDefined();
    expect(schemas.MatchSequencesDto.properties.report.nullable).toBe(true);
    expect(
      schemas.SequenceEpisodeDto.properties.objectives.items.$ref,
    ).toContain('SequenceEvidenceDto');
    expect(schemas.ObjectiveGoldChangeDto.properties.before.nullable).toBe(
      true,
    );
    expect(schemas.SequenceRateDto.properties.rate.$ref).toContain(
      'MetricResultDto',
    );
    expect(
      schemas.SequenceComebackDto.properties.firstPersistentLead.nullable,
    ).toBe(true);
  });
});
