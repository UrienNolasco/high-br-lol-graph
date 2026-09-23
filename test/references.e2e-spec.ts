import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { ReferenceController } from '../src/modules/references/reference.controller';
import { ReferenceService } from '../src/modules/references/reference.service';
import { calculateReference } from '../src/modules/references/reference-calculator';
import { normalizeReferenceQuery } from '../src/modules/references/reference-contract';
import {
  referenceQueryFixture,
  referenceRowFixture,
} from './fixtures/references';
describe('MET20 references HTTP contract', () => {
  let app: INestApplication;
  const service = {
    getReference: jest
      .fn()
      .mockImplementation((query) =>
        Promise.resolve(
          calculateReference(
            query,
            [referenceRowFixture(0)],
            referenceRowFixture(0),
            0,
          ),
        ),
      ),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ReferenceController],
      providers: [{ provide: ReferenceService, useValue: service }],
    }).compile();
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
  afterAll(async () => app.close());
  it('publishes definitions and precision assumptions; no label is a reference', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/references/definitions')
      .expect(200);
    const definitions = body.definitions as Array<{ id: string }>;
    expect(body.requiredUnits).toBe(82);
    expect(definitions.some((d: { id: string }) => d.id === 'label.win')).toBe(
      false,
    );
    expect(
      definitions.find(
        (d: { id: string }) => d.id === 'vision.controlWardGoldSpent',
      ),
    ).toMatchObject({ metricId: 'V08', costUnavailable: true });
  });
  it('normalizes filters, preserves individual zero and withholds insufficient percentile', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/references')
      .query({ ...referenceQueryFixture, role: 'MID' })
      .expect(200);
    expect(service.getReference).toHaveBeenLastCalledWith(
      normalizeReferenceQuery(referenceQueryFixture),
    );
    expect(body).toMatchObject({
      status: 'insufficient',
      median: null,
      individual: { value: 0, percentile: null },
      precision: { requiredUnits: 82 },
      provenance: { processedAt: { latest: '2026-09-23T00:00:00.000Z' } },
    });
  });
  it.each([
    { role: undefined },
    { patch: undefined },
    { definitionId: 'label.win' },
    { horizonKey: 'final' },
    { confidence: 1 },
    { cdfHalfWidth: 0 },
    { minimumUnits: -1 },
    { fromMs: 2, toMs: 1 },
    { eligibleOnly: true },
    { surprise: 1 },
    { individualId: 'raw' },
  ])('rejects invalid query %j', async (change) => {
    await request(app.getHttpServer())
      .get('/api/v1/references')
      .query({ ...referenceQueryFixture, ...change })
      .expect(400);
  });
  it('documents null summaries and required homogeneous axes in OpenAPI', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('MET20').setVersion('1').build(),
    );
    const schema = doc.components!.schemas!.ReferenceResponseDto as {
      properties: Record<string, { nullable?: boolean }>;
    };
    expect(schema.properties.median.nullable).toBe(true);
    expect(schema.properties.quantiles.nullable).toBe(true);
    const params = doc.paths['/api/v1/references'].get!.parameters as Array<{
      name: string;
      required: boolean;
    }>;
    expect(params.filter((p) => p.required).map((p) => p.name)).toEqual(
      expect.arrayContaining([
        'patch',
        'queueId',
        'mapId',
        'championId',
        'role',
        'definitionId',
        'horizonKey',
      ]),
    );
  });
});
