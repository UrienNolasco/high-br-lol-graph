import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { MatchesModule } from './matches.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import { ReportRepository } from './repositories/report.repository';
import { reportFixture, reportCatalogs } from '../../../test/fixtures/report';
import { ReportInput } from './pure/report/report.types';
describe('MET17 report REST contract', () => {
  let app: INestApplication, input: ReportInput, base: string;
  const repository = { findReport: jest.fn() };
  const catalogs = {
    ...reportCatalogs,
    getItemCatalogForGameVersion: jest.fn(() => {
      throw Error('Network forbidden');
    }),
    getSkillCatalogForGameVersion: jest.fn(() => {
      throw Error('Network forbidden');
    }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [MatchesModule] })
      .overrideProvider(ReportRepository)
      .useValue(repository)
      .overrideProvider(DataDragonService)
      .useValue(catalogs)
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService())
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    input = reportFixture();
    const player = input.participants.find((p) => p.championName === 'Fiora')!;
    base = `/api/v1/matches/${input.matchId}/report/${player.puuid}`;
    repository.findReport
      .mockReset()
      .mockImplementation((matchId: string, puuid: string) =>
        Promise.resolve(
          matchId === input.matchId &&
            input.participants.some((p) => p.puuid === puuid)
            ? input
            : null,
        ),
      );
  });
  it('navigates contribution to metric to evidence using real module routes and cached catalogs only', async () => {
    const { body } = await request(app.getHttpServer())
      .get(base + '?evidenceLimit=1')
      .expect(200);
    expect(body.dimensions).toHaveLength(4);
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(80000);
    const selected = body.dimensions[0].metrics[0];
    expect(selected.evidence.hasMore).toBe(true);
    const metric = await request(app.getHttpServer())
      .get(selected.href)
      .expect(200);
    expect(metric.body.value).toBe(selected.value);
    const proof = await request(app.getHttpServer())
      .get(metric.body.evidence.items[0].href)
      .expect(200);
    expect(proof.body.source).toBe('MatchParticipant');
    expect(repository.findReport).toHaveBeenCalledTimes(3);
    expect(catalogs.getItemCatalogForGameVersion).not.toHaveBeenCalled();
    expect(catalogs.getSkillCatalogForGameVersion).not.toHaveBeenCalled();
  });
  it('navigates one death with two associated captures to each projected event', async () => {
    const list = await request(app.getHttpServer())
      .get(base + '/episodes?kind=death&fromMs=1198000&toMs=1199000&limit=1')
      .expect(200);
    expect(list.body.page.total).toBe(1);
    const death = list.body.page.items[0];
    expect(death.occurrence.value).toBe(1);
    expect(death.associatedCaptures.value).toBe(2);
    expect(death.events.total).toBe(3);
    expect(death.events.hasMore).toBe(true);
    const detail = await request(app.getHttpServer())
      .get(death.href)
      .expect(200);
    expect(detail.body.events.items).toHaveLength(3);
    const proof = await request(app.getHttpServer())
      .get(detail.body.events.items[1].href)
      .expect(200);
    expect(['BUILDING_KILL', 'ELITE_MONSTER_KILL']).toContain(proof.body.type);
    expect(proof.body.eventId).toBe(detail.body.events.items[1].eventId);
  });
  it('retains nearest checkpoint selection throughout metric/evidence and pagination links', async () => {
    const projection = input.timelineProjection as any;
    projection.frames[4].timestamp = 290000;
    projection.frames[5].timestamp = 301000;
    const family = await request(app.getHttpServer())
      .get(
        base +
          '/families/economy?section=checkpoints&mode=nearest&limit=1&evidenceLimit=0',
      )
      .expect(200);
    const checkpoint = family.body.data.items[0];
    expect(checkpoint.actualMs).toBe(301000);
    const nearest = checkpoint.values.totalGold;
    expect(nearest.href).toContain('mode=nearest');
    expect(nearest.evidence.next).toContain('mode=nearest');
    const metric = await request(app.getHttpServer())
      .get(nearest.href)
      .expect(200);
    expect(metric.body.value).toBe(nearest.value);
    const proof = await request(app.getHttpServer())
      .get(metric.body.evidence.items[0].href)
      .expect(200);
    expect(proof.body.timestampMs).toBe(301000);
    const past = await request(app.getHttpServer())
      .get(base + '/families/economy?section=checkpoints&mode=pastOnly&limit=1')
      .expect(200);
    expect(past.body.data.items[0].actualMs).toBe(290000);
    expect(past.body.data.items[0].values.totalGold.value).not.toBe(
      nearest.value,
    );
  });
  it('returns partial and explicit unknown provenance while preserving factual final totals', async () => {
    input.events = [];
    input.timelineProjection = null;
    const partial = await request(app.getHttpServer()).get(base).expect(200);
    expect(partial.body.availability.status).toBe('partial');
    expect(partial.body.finalTotals[0].value).toBeGreaterThan(0);
    input.processing = null;
    const unknown = await request(app.getHttpServer()).get(base).expect(200);
    expect(unknown.body.provenance).toMatchObject({
      processingVersion: null,
      processedAt: null,
      known: false,
    });
    expect(unknown.body.finalTotals[0]).toMatchObject({
      value: partial.body.finalTotals[0].value,
      processingVersion: null,
      processedAt: null,
    });
    expect(unknown.body.dimensions[0].metrics[0].value).toBeNull();
    const f = await request(app.getHttpServer())
      .get(base + '/families/combat')
      .expect(200);
    expect(f.body).toMatchObject({
      reason: 'missing_processing_metadata',
      processingVersion: null,
      processedAt: null,
      data: null,
    });
  });
  it('distinguishes unavailable fields from observed zero and returns404 for absent scoped resources', async () => {
    for (const p of input.participants) {
      p.finalStats = null;
      p.kills = null as any;
      p.deaths = null as any;
      p.assists = null as any;
    }
    input.events = [];
    input.timelineProjection = null;
    input.processing = null;
    const unavailable = await request(app.getHttpServer())
      .get(base)
      .expect(200);
    expect(unavailable.body.availability.status).toBe('unavailable');
    expect(
      (unavailable.body.finalTotals as { value: unknown }[]).every(
        (m) => m.value === null,
      ),
    ).toBe(true);
    await request(app.getHttpServer())
      .get('/api/v1/matches/missing/report/missing')
      .expect(404);
    await request(app.getHttpServer())
      .get(base + '/episodes/death:wrong:0:0:60000')
      .expect(404);
    await request(app.getHttpServer())
      .get(base + '/evidence/event:wrong:0:0')
      .expect(404);
  });
  it.each([
    'limit=51',
    'limit=0',
    'limit=1.2',
    'offset=-1',
    'evidenceLimit=21',
    'fromMs=10&toMs=10',
    'fromMs=20&toMs=10',
    'mode=future',
    'kind=unknown',
    'unused=1',
    'path=constructor',
    'path=x.__proto__',
  ])('rejects invalid query %s', async (query) => {
    await request(app.getHttpServer())
      .get(base + '?' + query)
      .expect(400);
  });
  it('rejects unknown family and section', async () => {
    await request(app.getHttpServer())
      .get(base + '/families/unknown')
      .expect(400);
    await request(app.getHttpServer())
      .get(base + '/families/economy?section=unknown')
      .expect(400);
  });
  it('publishes nullable provenance, evidence pages and all navigation routes in OpenAPI', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('MET17').setVersion('1').build(),
    );
    const prefix = '/api/v1/matches/{matchId}/report/{puuid}';
    expect(doc.paths[prefix].get!.responses['200']).toBeDefined();
    for (const suffix of [
      '/families/{family}',
      '/metrics/{key}',
      '/episodes',
      '/episodes/{id}',
      '/evidence/{id}',
    ])
      expect(doc.paths[prefix + suffix].get).toBeDefined();
    const schemas = doc.components!.schemas as any;
    expect(schemas.ReportMetricDto.properties.processingVersion.nullable).toBe(
      true,
    );
    expect(schemas.ReportMetricDto.properties.processedAt.nullable).toBe(true);
    expect(
      schemas.ReportDimensionDto.properties.presentationWeight.enum,
    ).toEqual([1]);
  });
});
