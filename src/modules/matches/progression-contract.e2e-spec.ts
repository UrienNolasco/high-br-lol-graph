import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { MATCH_CATALOGS } from './ports/catalog-reader';
import { MatchesModule } from './matches.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import { ProgressionRepository } from './repositories/progression.repository';
import {
  fixture,
  event,
  itemCatalog,
  skillCatalog,
} from './pure/progression/progression.fixture';
describe('MET16 progression HTTP', () => {
  let app: INestApplication;
  const repository = { findProgression: jest.fn() };
  const catalogs = {
    getCachedItemCatalog: jest.fn(() => itemCatalog),
    getCachedSkillCatalog: jest.fn(() => skillCatalog),
    getItemCatalogForGameVersion: jest.fn(() => {
      throw new Error('network forbidden');
    }),
    getSkillCatalogForGameVersion: jest.fn(() => {
      throw new Error('network forbidden');
    }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [MatchesModule] })
      .overrideProvider(ProgressionRepository)
      .useValue(repository)
      .overrideProvider(MATCH_CATALOGS)
      .useValue(catalogs)
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService())
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    repository.findProgression.mockResolvedValue(
      fixture([
        event(),
        event(
          'ITEM_UNDO',
          { beforeId: 1001, afterId: 0, goldGain: 300 },
          1,
          2000,
        ),
        event(
          'SKILL_LEVEL_UP',
          { skillSlot: 1, levelUpType: 'NORMAL' },
          2,
          3000,
        ),
      ]),
    );
  });
  it('keeps original undo, authoritative final slots and nullable timing in distinct fields', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/matches/m/progression/a')
      .expect(200);
    expect(body.originalItemEvents[1].payload).toMatchObject({
      beforeId: 1001,
      afterId: 0,
      goldGain: 300,
    });
    expect(body.trajectory.acquisitions[0]).toMatchObject({
      effective: false,
      undoneBy: 'm:0:1',
    });
    expect(
      body.trajectory.itemTimings[0].firstEffectiveObservedAt.value,
    ).toBeNull();
    expect(body.finalInventory.finalBuild[0].itemId).toBe(1001);
    expect(body.skillSequence[0]).toMatchObject({
      timestampMs: 3000,
      skillSlot: 1,
      levelUpType: 'NORMAL',
      validation: { status: 'catalog_consistent' },
    });
    expect(catalogs.getItemCatalogForGameVersion).not.toHaveBeenCalled();
    expect(catalogs.getSkillCatalogForGameVersion).not.toHaveBeenCalled();
  });
  it('returns 404 for absent match/player and explicit unavailable provenance without fake MetricResult', async () => {
    repository.findProgression.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get('/api/v1/matches/m/progression/x')
      .expect(404);
    repository.findProgression.mockResolvedValueOnce(
      fixture([], { processing: null }),
    );
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/matches/m/progression/a')
      .expect(200);
    expect(body).toMatchObject({
      processingVersion: null,
      processedAt: null,
      trajectory: null,
      skillSequence: null,
      quality: { available: false, reason: 'missing_projection' },
    });
  });
  it('documents original evidence, nullable trajectory and metric envelopes', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('MET16').setVersion('1').build(),
    );
    expect(
      doc.paths['/api/v1/matches/{matchId}/progression/{puuid}'].get?.responses[
        '200'
      ],
    ).toBeDefined();
    const schemas = doc.components!.schemas as any;
    expect(schemas.MatchProgressionDto.properties.trajectory.nullable).toBe(
      true,
    );
    expect(schemas.MatchProgressionDto.properties.processedAt.nullable).toBe(
      true,
    );
    expect(schemas.SkillAllocationDto.properties.allocationAt).toBeDefined();
    expect(
      schemas.ItemTimingDto.properties.firstEffectiveObservedAt,
    ).toBeDefined();
  });
});
