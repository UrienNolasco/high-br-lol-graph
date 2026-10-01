import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { PoolSessionsController } from '../src/modules/players/pool-sessions.controller';
import { PoolSessionsRepository } from '../src/modules/players/repositories/pool-sessions.repository';
import { calculatePoolSessions } from '../src/modules/players/domain/pool-sessions';
describe('MET31 pool sessions HTTP/OpenAPI', () => {
  let app: INestApplication;
  const repo = {
    analyze: jest.fn((q) => Promise.resolve(calculatePoolSessions(q, []))),
  };
  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      controllers: [PoolSessionsController],
      providers: [{ provide: PoolSessionsRepository, useValue: repo }],
    }).compile();
    app = mod.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());
  it('publishes query policy and response coverage/session schema', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const path = doc.paths['/api/v1/players/{puuid}/pool-sessions'].get!;
    expect(path.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'fromMs', required: true }),
        expect.objectContaining({ name: 'gapMinutes', required: false }),
      ]),
    );
    expect(
      (doc.components!.schemas!.PoolSessionsResponseDto as SchemaObject)
        .properties,
    ).toHaveProperty('coverage');
    expect(
      (doc.components!.schemas!.PoolSessionsResponseDto as SchemaObject)
        .properties,
    ).toHaveProperty('sessions');
  });
  it('uses explicit bounded filters and absent metrics', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/players/p/pool-sessions')
      .query({ queueId: 420, mapId: 11, fromMs: 0, toMs: 86400000 })
      .expect(200);
    expect(repo.analyze).toHaveBeenCalledWith({
      playerId: 'p',
      queueId: 420,
      mapId: 11,
      fromMs: 0,
      toMs: 86400000,
      gapMinutes: 30,
    });
    expect(body).toMatchObject({
      status: 'unavailable',
      coverage: { complete: false },
      pool: { top3: { value: null } },
      sessions: { origin: 'estimated' },
    });
  });
  it('rejects unknown filters, missing scope and invalid threshold', async () => {
    for (const query of [
      {},
      { queueId: 420, mapId: 11, fromMs: 0, toMs: 1, patch: 'ALL' },
      { queueId: 420, mapId: 11, fromMs: 0, toMs: 1, gapMinutes: 0 },
    ])
      await request(app.getHttpServer())
        .get('/api/v1/players/p/pool-sessions')
        .query(query)
        .expect(400);
  });
});
