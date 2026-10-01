import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ChampionContextController } from './champion-context.controller';
import { CHAMPION_CONTEXT_READER } from '../matches/ports/champion-context-reader';
describe('champion context HTTP/OpenAPI', () => {
  let app: INestApplication;
  const reader = {
    read: jest
      .fn()
      .mockResolvedValue({ matches: [], availableMatches: 4, truncated: true }),
  };
  beforeAll(async () => {
    const m = await Test.createTestingModule({
      controllers: [ChampionContextController],
      providers: [{ provide: CHAMPION_CONTEXT_READER, useValue: reader }],
    }).compile();
    app = m.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  it('publishes coverage and unavailable rates, rejecting missing context', async () => {
    const r = await request(app.getHttpServer())
      .get('/api/v1/analytics/champion-context')
      .query({ patch: '16.2', championId: 1, role: 'TOP' })
      .expect(200);
    expect(r.body.baseline).toMatchObject({
      n: 0,
      rate: null,
      reason: 'no_observations',
    });
    expect(r.body.coverage).toMatchObject({
      availableMatches: 4,
      truncated: true,
    });
    await request(app.getHttpServer())
      .get('/api/v1/analytics/champion-context')
      .query({ patch: 'ALL', championId: 1, role: 'TOP' })
      .expect(400);
  });
  it('documents required context, response shape and bad requests', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const op = doc.paths['/api/v1/analytics/champion-context'].get!;
    expect(op.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'patch', required: true }),
        expect.objectContaining({ name: 'role', required: true }),
      ]),
    );
    expect(op.responses['400']).toBeDefined();
    expect(JSON.stringify(op.responses['200'])).toContain('interval95');
  });
});
