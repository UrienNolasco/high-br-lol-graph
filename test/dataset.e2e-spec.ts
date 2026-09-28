import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DatasetController } from '../src/modules/dataset/dataset.controller';
import { DatasetService } from '../src/modules/dataset/application/dataset.service';

describe('MET19 dataset HTTP contract', () => {
  let app: INestApplication;
  const service = {
    query: jest.fn().mockResolvedValue({
      datasetVersion: 1,
      processingVersion: 4,
      summary: {
        counts: { rows: 3, matches: 1, players: 1, validRows: 2 },
        unmaterializedMatches: 1,
      },
      rows: [
        {
          value: null,
          validCount: 0,
          reason: 'missing_frame',
          processedAt: '2026-09-23T01:02:03.456Z',
        },
      ],
      nextAfter: null,
    }),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DatasetController],
      providers: [{ provide: DatasetService, useValue: service }],
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
  it('declares temporal definitions and separates final labels', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/dataset/definitions')
      .expect(200);
    expect(body.horizonsMs).toEqual([300000, 600000, 900000, 1200000]);
    expect(
      (body.definitions as Array<{ id: string; usage: string }>).find(
        (d) => d.id === 'label.win',
      )!.usage,
    ).toBe('label');
  });
  it('accepts common filters and preserves distinct counts/nulls/real provenance', async () => {
    const { body } = await request(app.getHttpServer())
      .get(
        '/api/v1/dataset?patch=16.2&queueId=420&mapId=11&role=MID&horizonKey=t:900000&eligibleOnly=false&limit=20',
      )
      .expect(200);
    expect(service.query).toHaveBeenLastCalledWith(
      {
        patch: '16.2',
        queueId: 420,
        mapId: 11,
        role: 'MIDDLE',
        horizonKey: 't:900000',
        eligibleOnly: false,
      },
      20,
      undefined,
    );
    expect(body.summary.counts).toEqual({
      rows: 3,
      matches: 1,
      players: 1,
      validRows: 2,
    });
    expect(body.rows[0].value).toBeNull();
  });
  it.each([
    'limit=501',
    'after=raw',
    'patch=16.2.3',
    'fromMs=20&toMs=10',
    'surprise=1',
  ])('rejects invalid query %s', async (query) => {
    await request(app.getHttpServer())
      .get(`/api/v1/dataset?${query}`)
      .expect(400);
  });
});
