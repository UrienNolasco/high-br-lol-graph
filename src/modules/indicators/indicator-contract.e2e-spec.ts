import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { IndicatorModule } from './indicator.module';
import { IndicatorRepository } from './indicator.repository';
import { PrismaService } from '../../core/prisma/prisma.service';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import { indicatorFixture } from '../../../test/fixtures/indicators';
import { IndicatorInput } from './pure/indicator.types';
describe('MET29 optional indicators REST', () => {
  let app: INestApplication, input: IndicatorInput;
  const repo = { match: jest.fn(), history: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [IndicatorModule],
    })
      .overrideProvider(IndicatorRepository)
      .useValue(repo)
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService())
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    input = indicatorFixture();
    repo.match.mockReset().mockResolvedValue(input);
    repo.history.mockReset().mockResolvedValue({
      inputs: [input],
      total: 1,
      truncated: false,
      hasMore: false,
    });
  });
  it('exposes24 named optional fields and literal counts without inventing challenge accuracy or cast events', async () => {
    const catalog = await request(app.getHttpServer())
      .get('/api/v1/indicators/catalog')
      .expect(200);
    expect(catalog.body.definitions).toHaveLength(24);
    const result = await request(app.getHttpServer())
      .get('/api/v1/matches/m/indicators/p?family=execution')
      .expect(200);
    expect(result.body.metrics[0]).toMatchObject({
      id: 'execution.skillshotsHit',
      count: { value: 23, unit: 'count' },
      perMinute: null,
    });
    expect(result.body.context.temporalScope).toBe(
      'final_summary_retrospective',
    );
  });
  it('preserves absent/zero, unknown patch and missing provenance instead of manufacturing rates', async () => {
    input.participant.pings = { onMyWayPings: 0 };
    input.processing = null;
    input.match.gameVersion = '99.1.1';
    const result = await request(app.getHttpServer())
      .get('/api/v1/matches/m/indicators/p?family=pings')
      .expect(200);
    expect(
      (result.body.metrics as { id: string }[]).find(
        (m) => m.id === 'pings.onMyWayPings',
      ),
    ).toMatchObject({
      count: { value: 0, processedAt: null, processingVersion: null },
      perMinute: { value: null, reason: 'missing_processing_metadata' },
    });
    expect(result.body.metrics[0].count).toMatchObject({
      value: null,
      reason: 'missing_field',
    });
    expect(result.body.catalogValidation.status).toBe('unvalidated_patch');
    repo.match.mockResolvedValue(null);
    await request(app.getHttpServer())
      .get('/api/v1/matches/missing/indicators/p')
      .expect(404);
  });
  it('returns page-scoped N and stable cursor while never producing a population percentile for one player/match', async () => {
    input.participant.role = 'MID';
    repo.history.mockResolvedValue({
      inputs: [input],
      total: 105,
      truncated: true,
      hasMore: true,
    });
    const result = await request(app.getHttpServer())
      .get(
        '/api/v1/players/p/indicators?role=MID&patch=16.2&limit=1&family=casts',
      )
      .expect(200);
    expect(result.body.filters.role).toBe('MIDDLE');
    expect(result.body.selection).toMatchObject({
      totalMatchingMatchPlayers: 105,
      selectedMatchPlayers: 1,
      truncated: true,
      hasMore: true,
    });
    expect(result.body.sample).toMatchObject({
      distinctMatches: 1,
      distinctPlayers: 1,
    });
    expect(result.body.groups.items[0].reference).toMatchObject({
      percentile: null,
      reason: 'not_calculated',
    });
    const next = result.body.selection.next;
    repo.history.mockResolvedValue({
      inputs: [],
      total: 105,
      truncated: true,
      hasMore: false,
    });
    const empty = await request(app.getHttpServer()).get(next).expect(200);
    expect(empty.body.sample.observations).toBe(0);
    expect(repo.history.mock.calls[1][2]).toEqual({
      gameCreation: input.match.gameCreation,
      matchId: input.match.matchId,
    });
    await request(app.getHttpServer())
      .get((next as string).replace('patch=16.2', 'patch=16.3'))
      .expect(400);
  });
  it.each([
    'limit=101',
    'limit=1.5',
    'groupLimit=11',
    'evidenceLimit=4',
    'fromMs=2&toMs=1',
    'role=BAD',
    'queueId=420x',
    'family=unknown',
    'after=invalid',
    'unknown=1',
  ])('rejects invalid history query %s', async (query) => {
    await request(app.getHttpServer())
      .get('/api/v1/players/p/indicators?' + query)
      .expect(400);
  });
  it('does not silently apply history filters to a single match', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/matches/m/indicators/p?patch=16.2')
      .expect(400);
  });
  it('documents nullable provenance, metric units and both bounded history and match contracts', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('MET29').setVersion('1').build(),
    );
    expect(
      doc.paths['/api/v1/matches/{matchId}/indicators/{puuid}'].get!.responses[
        '200'
      ],
    ).toBeDefined();
    expect(doc.paths['/api/v1/players/{puuid}/indicators'].get).toBeDefined();
    const schemas = doc.components!.schemas as any;
    expect(
      schemas.IndicatorMetricDto.properties.processingVersion.nullable,
    ).toBe(true);
    expect(schemas.IndicatorValueDto.properties.perMinute.nullable).toBe(true);
    expect(schemas.IndicatorMetricDto.properties.temporalScope.enum).toEqual([
      'final_summary_retrospective',
    ]);
  });
});
