import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AdvantageController } from './advantage.controller';
import { ADVANTAGE_READER } from '../matches/ports/advantage-reader';
describe('advantage HTTP/OpenAPI', () => {
  let app: INestApplication;
  const reader = {
    read: jest
      .fn()
      .mockResolvedValue({ matches: [], availableMatches: 4, truncated: true }),
  };
  beforeAll(async () => {
    const m = await Test.createTestingModule({
      controllers: [AdvantageController],
      providers: [{ provide: ADVANTAGE_READER, useValue: reader }],
    }).compile();
    app = m.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('publishes coverage and unavailable rates, rejecting missing context', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/v1/analytics/advantage')
      .query({ patch: '16.2', championId: 1, role: 'TOP' })
      .expect(200);
    expect(r.body.cells[0].outcome).toMatchObject({
      n: 0,
      rate: null,
      reason: 'no_observations',
    });
    expect(r.body.coverage).toMatchObject({
      availableMatches: 4,
      truncated: true,
    });
    await request(app.getHttpServer())
      .get('/api/v1/analytics/advantage')
      .query({ patch: 'ALL', championId: 1, role: 'TOP' })
      .expect(400);
  });
  it('requires exact context, normalizes role and validates unsupported query keys', async () => {
    for (const query of [
      { patch: '16.2', championId: 1 },
      { patch: '16.2', championId: 1, role: 'TOP', limit: 10001 },
      { patch: '16.2', championId: 1, role: 'TOP', eligibleOnly: false },
      { patch: '16.2', championId: 1, role: 'TOP', fromMs: 20, toMs: 10 },
    ]) {
      await request(app.getHttpServer())
        .get('/api/v1/analytics/advantage')
        .query(query)
        .expect(400);
    }
    const response = await request(app.getHttpServer())
      .get('/api/v1/analytics/advantage')
      .query({
        patch: '16.2',
        championId: 1,
        role: 'MID',
        queueId: 440,
        fromMs: 10,
        toMs: 20,
      })
      .expect(200);
    expect(response.body.filters).toMatchObject({
      role: 'MIDDLE',
      queueId: 440,
      fromMs: 10,
      toMs: 20,
    });
    expect(reader.read).toHaveBeenLastCalledWith({
      patch: '16.2',
      queueId: 440,
      fromMs: 10,
      toMs: 20,
      limit: 1000,
    });
  });
  it('documents required context, response shape and bad requests', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const op = doc.paths['/api/v1/analytics/advantage'].get!;
    expect(op.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'patch', required: true }),
        expect.objectContaining({ name: 'role', required: true }),
      ]),
    );
    expect(op.responses['400']).toBeDefined();
    expect(JSON.stringify(op.responses['200'])).toContain('cells');
  });
});
