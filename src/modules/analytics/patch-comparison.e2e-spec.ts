import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { PatchComparisonController } from './patch-comparison.controller';
import { DATASET_READER } from '../dataset/ports/dataset-reader';
describe('patch comparison HTTP/OpenAPI', () => {
  let app: INestApplication;
  const reader = {
    query: jest
      .fn()
      .mockResolvedValue({
        rows: [],
        nextAfter: 'bounded',
        summary: { unmaterializedMatches: 3 },
      }),
  };
  beforeAll(async () => {
    const m = await Test.createTestingModule({
      controllers: [PatchComparisonController],
      providers: [{ provide: DATASET_READER, useValue: reader }],
    }).compile();
    app = m.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());
  it('returns explicit absent periods and bounded coverage, validates exact patches', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/v1/analytics/patch-comparison')
      .query({
        beforePatch: '16.1',
        afterPatch: '16.2',
        definitionId: 'final.gold',
      })
      .expect(200);
    expect(r.body.before).toMatchObject({ matches: 0, cells: [] });
    expect(r.body.coverage.truncated).toBe(true);
    expect(r.body.sequence.complete).toBe(false);
    expect(r.body.unmaterializedMatches).toBe(3);
    await request(app.getHttpServer())
      .get('/api/v1/analytics/patch-comparison')
      .query({
        beforePatch: 'ALL',
        afterPatch: '16.2',
        definitionId: 'final.gold',
      })
      .expect(400);
  });
  it('documents both patch identifiers, selected metric, shape and validation', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const op = doc.paths['/api/v1/analytics/patch-comparison'].get!;
    expect(op.parameters).toEqual(
      expect.arrayContaining(
        ['beforePatch', 'afterPatch', 'definitionId'].map((name) =>
          expect.objectContaining({ name, required: true }),
        ),
      ),
    );
    expect(op.responses['400']).toBeDefined();
    expect(JSON.stringify(op.responses['200'])).toContain('sequence');
    expect(JSON.stringify(op.responses['200'])).toContain('changes');
  });
});
