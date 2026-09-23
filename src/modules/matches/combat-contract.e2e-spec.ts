import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { MatchCombatController } from './match-combat.controller';
import { MatchCombatService } from './services/match-combat.service';
import { CombatRepository } from './repositories/combat.repository';
import { combatFixture, killEvent } from './pure/combat.fixture';
describe('MET13 combat HTTP contract', () => {
  let app: INestApplication;
  const repo = { findMatchCombat: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [MatchCombatController],
      providers: [
        MatchCombatService,
        { provide: CombatRepository, useValue: repo },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    const input = combatFixture([
      killEvent({ assistingPuuids: null, assistingParticipantIds: null }),
    ]);
    repo.findMatchCombat.mockResolvedValue({
      input,
      match: { ...input, gameVersion: '16.2.1', queueId: 420, mapId: 11 },
    });
  });
  it('serializes explicit unavailable reasons, coverage, independent reward fields and event evidence', async () => {
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/matches/m/combat')
      .expect(200);
    expect(body).toMatchObject({
      matchId: 'm',
      source: 'MatchEventProjection + MatchParticipant',
      quality: { unknownAssistanceEvents: 1 },
      cohort: { gameVersion: '16.2.1', queueId: 420, mapId: 11 },
    });
    expect(body.participants[0]).toMatchObject({
      soloKills15: {
        value: null,
        reason: 'unknown_assistance',
        quality: { validSamples: 0, totalSamples: 1 },
        evidence: [{ eventId: 'm:1:0' }],
      },
      rewards: {
        bountyReceived: { value: 300 },
        shutdownReceived: { value: 0 },
      },
    });
  });
  it('distinguishes absent matches (404) and absent projections (200 with unavailable values)', async () => {
    repo.findMatchCombat.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get('/api/v1/matches/missing/combat')
      .expect(404);
    repo.findMatchCombat.mockResolvedValueOnce({
      input: null,
      source: null,
      match: {},
    });
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/matches/m/combat')
      .expect(200);
    expect(body).toMatchObject({
      processedAt: null,
      processingVersion: null,
      quality: { available: false, reason: 'missing_projection' },
      participants: [],
      killerVictimMatrix: [],
      coParticipation: [],
    });
  });
  it('publishes the route, participant metrics, graphs, and nullable metric contract in OpenAPI', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('MET13').setVersion('1').build(),
    );
    expect(
      doc.paths['/api/v1/matches/{matchId}/combat'].get?.responses['200'],
    ).toBeDefined();
    const schemas = doc.components!.schemas as any;
    expect(schemas.MatchCombatDto.properties).toHaveProperty(
      'killerVictimMatrix',
    );
    expect(schemas.MatchCombatDto.properties).toHaveProperty('coParticipation');
    expect(schemas.CombatParticipantDto.properties).toHaveProperty(
      'soloKills15',
    );
    expect(schemas.MetricResultDto.properties.value.nullable).toBe(true);
    expect(schemas.CombatRewardsDto.properties).toHaveProperty(
      'shutdownReceived',
    );
  });
});
