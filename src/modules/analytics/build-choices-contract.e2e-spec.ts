import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { BuildChoicesController } from './build-choices.controller';
import { BuildChoicesService } from './services/build-choices.service';
import { BUILD_CHOICE_READER } from '../matches/ports/build-choice-reader';
import { CHOICE_CATALOG_READER } from '../matches/ports/choice-catalog-reader';
import { choiceCohort, choiceCatalogs } from './pure/build-choices.fixture';
describe('MET26 HTTP and OpenAPI', () => {
  let app: INestApplication;
  const reader = { findBuildChoiceCohort: jest.fn() };
  const catalog = choiceCatalogs()['16.2.741'];
  const catalogs = {
    getItemCatalog: jest.fn().mockResolvedValue(catalog.items),
    getChoiceCatalog: jest.fn().mockResolvedValue(catalog.choices),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BuildChoicesController],
      providers: [
        BuildChoicesService,
        { provide: BUILD_CHOICE_READER, useValue: reader },
        { provide: CHOICE_CATALOG_READER, useValue: catalogs },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    reader.findBuildChoiceCohort.mockResolvedValue(choiceCohort());
  });
  afterAll(async () => app.close());
  it('runs real query/calculation and serializes IDs,N,uncertainty,absence and evidence', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/analytics/build-choices')
      .query({
        patch: '16.2',
        championId: 1,
        role: 'TOP',
        fromMs: 0,
        toMs: 1000,
      })
      .expect(200);
    expect(reader.findBuildChoiceCohort).toHaveBeenCalledWith(
      expect.objectContaining({ fromMs: 0, toMs: 1000, checkpointMs: 900000 }),
    );
    expect(body.contexts[0].alternatives.items[0]).toMatchObject({
      n: 1,
      comparison: { winRate: null, interval95: null },
      evidence: [{ eventId: 'm1:10:0' }],
    });
    expect(body.uncertainty).toContain('Wilson');
    expect(catalogs.getChoiceCatalog).toHaveBeenCalledWith('16.2.741');
  });
  it.each([
    { patch: 'ALL' },
    { checkpointMs: 1 },
    { unexpected: 'x' },
    { championId: 'abc' },
    { role: 'ALL' },
    { limit: 501 },
  ])('rejects %j before persistence/CDN', async (bad) => {
    await request(app.getHttpServer())
      .get('/api/v1/analytics/build-choices')
      .query({ patch: '16.2', championId: 1, role: 'TOP', ...bad })
      .expect(400);
    expect(reader.findBuildChoiceCohort).not.toHaveBeenCalled();
    expect(catalogs.getItemCatalog).not.toHaveBeenCalled();
  });
  it('exposes empty coverage without network when nothing was observed', async () => {
    reader.findBuildChoiceCohort.mockResolvedValue(choiceCohort([]));
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/analytics/build-choices')
      .query({ patch: '16.2', championId: 1, role: 'TOP' })
      .expect(200);
    expect(body.coverage.eligibleMatches).toBe(0);
    expect(body.contexts).toEqual([]);
    expect(catalogs.getChoiceCatalog).not.toHaveBeenCalled();
  });
  it('documents required exact cohort, nominal interval and nested coverage/evidence', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schema = doc.components!.schemas! as Record<string, any>;
    expect(
      doc.paths['/api/v1/analytics/build-choices'].get!.parameters,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'patch', required: true }),
        expect.objectContaining({ name: 'championId', required: true }),
        expect.objectContaining({ name: 'checkpointMs' }),
      ]),
    );
    expect(schema.ChoiceOutcomeDto.properties.interval95.nullable).toBe(true);
    expect(schema.ChoiceAlternativeDto.properties.evidence.type).toBe('array');
    expect(schema.BuildChoicesResultDto.properties.coverage).toBeDefined();
  });
});
