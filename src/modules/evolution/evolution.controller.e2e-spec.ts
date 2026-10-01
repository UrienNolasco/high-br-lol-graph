import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { EvolutionController } from './evolution.controller';
import { EvolutionRepository } from './adapters/evolution.repository';
describe('MET21 HTTP/OpenAPI', () => {
  let app: INestApplication;
  const getEvolution = jest
    .fn()
    .mockResolvedValue({ methodVersion: 1, comparison: { trend: null } });
  const query = {
    definitionId: 'final.deathsNearObjectives',
    championId: 114,
    role: 'TOP',
    queueId: 420,
    mapId: 11,
    horizonKey: 'final',
    baselineFromMs: 10,
    baselineToMs: 20,
    recentFromMs: 20,
    recentToMs: 30,
  };
  beforeAll(async () => {
    const m = await Test.createTestingModule({
      controllers: [EvolutionController],
      providers: [{ provide: EvolutionRepository, useValue: { getEvolution } }],
    }).compile();
    app = m.createNestApplication();
    await app.init();
  });
  afterAll(() => app.close());
  it('publishes comparison with normalized context', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/players/player/evolution')
      .query(query)
      .expect(200)
      .expect({ methodVersion: 1, comparison: { trend: null } });
    expect(getEvolution).toHaveBeenCalledWith(
      expect.objectContaining({ puuid: 'player' }),
    );
  });
  it('rejects overlap before accessing storage', async () => {
    getEvolution.mockClear();
    await request(app.getHttpServer())
      .get('/api/v1/players/player/evolution')
      .query({ ...query, recentFromMs: 19 })
      .expect(400);
    expect(getEvolution).not.toHaveBeenCalled();
  });
  it('publishes windows, denominator/censoring and noninferential contract in OpenAPI', () => {
    const d = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    expect(
      d.paths['/api/v1/players/{puuid}/evolution'].get?.responses['422'],
    ).toBeDefined();
    const schema = d.components!.schemas!.EvolutionResponseDto;
    if (!('properties' in schema)) throw new Error('Expected response schema');
    const windows = schema.properties!.windows,
      comparison = schema.properties!.comparison;
    expect('description' in windows ? windows.description : '').toContain(
      'censored',
    );
    expect('description' in comparison ? comparison.description : '').toContain(
      'null',
    );
  });
});
