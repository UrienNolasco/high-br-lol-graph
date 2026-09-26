import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MATCH_CATALOGS } from './ports/catalog-reader';
import { MatchesModule } from './matches.module';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
import {
  killEpisodesFixture,
  episodeEvent,
} from './pure/kill-episodes.fixture';
describe('MET24 kill episode HTTP/OpenAPI', () => {
  let app: INestApplication;
  const prisma = {
    ...mockPrismaService(),
    matchEventProjection: { findMany: jest.fn() },
    matchProcessing: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  const dragon = { getItemCatalogForGameVersion: jest.fn() };
  const path = '/api/v1/matches/m/kill-episodes';
  beforeAll(async () => {
    app = await createTestingApp(MatchesModule, {
      overrides: [
        { provide: PrismaService, useValue: prisma },
        { provide: MATCH_CATALOGS, useValue: dragon },
      ],
    });
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    const fixture = killEpisodesFixture([
      episodeEvent(),
      episodeEvent({
        eventIndex: 1,
        timestampMs: 110000,
        positionX: 2600,
        actorParticipantId: 2,
        actorPuuid: 'b',
        victimPuuid: 'a',
        sourceTeamId: 200,
      }),
    ]);
    prisma.match.findUnique.mockResolvedValue({
      ...fixture,
      timelineProjection: fixture.snapshotProjection,
    });
    prisma.matchEventProjection.findMany.mockResolvedValue(fixture.events);
    prisma.matchProcessing.findUnique.mockResolvedValue({
      matchId: 'm',
      status: 'COMPLETED',
      processingVersion: 2,
      completedAt: new Date(fixture.processedAt),
    });
    prisma.$transaction.mockImplementation((fn) => fn(prisma));
  });
  it('returns estimated episodes, explicit10s trade and strictly previous resources through real repository/service', async () => {
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body).toMatchObject({
      reason: null,
      processingVersion: 2,
      processedAt: '2026-09-23T00:00:00.000Z',
      report: {
        definition: { version: 1, thresholds: { tradeMs: 10000 } },
        episodeCount: { value: 1, origin: 'estimated' },
        quickTradeCount: { value: 1 },
      },
    });
    expect(body.report.episodes[0].resources).toMatchObject({
      snapshotTimestampMs: 60000,
      ageMs: 40000,
    });
    expect(body.report.sensitivity.map((s) => s.observedEpisodeCount)).toEqual([
      2, 1, 1,
    ]);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    const query = prisma.match.findUnique.mock.calls[0][0];
    expect(Object.keys(query.select)).toEqual([
      'matchId',
      'gameDuration',
      'gameVersion',
      'mapId',
      'participants',
      'timelineProjection',
    ]);
    expect(query.select.timelineProjection.select.frames).toBe(true);
    expect(
      prisma.matchEventProjection.findMany.mock.calls[0][0].select.positionX,
    ).toBe(true);
    expect(dragon.getItemCatalogForGameVersion).not.toHaveBeenCalled();
  });
  it('serializes missing global provenance or snapshot explicitly and returns404 for absent match', async () => {
    prisma.matchProcessing.findUnique.mockResolvedValue(null);
    expect(
      (await request(app.getHttpServer()).get(path).expect(200)).body,
    ).toMatchObject({
      report: null,
      reason: 'missing_projection',
      processingVersion: null,
      processedAt: null,
    });
    const fixture = killEpisodesFixture();
    prisma.match.findUnique.mockResolvedValue({
      ...fixture,
      timelineProjection: null,
    });
    prisma.matchEventProjection.findMany.mockResolvedValue(fixture.events);
    prisma.matchProcessing.findUnique.mockResolvedValue({
      matchId: 'm',
      status: 'COMPLETED',
      processingVersion: 2,
      completedAt: new Date(fixture.processedAt),
    });
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body.report.episodes[0].resources).toMatchObject({
      snapshotTimestampMs: null,
      ageMs: null,
      reason: 'missing_projection',
    });
    expect(
      body.report.episodes[0].resources.participants[0].currentGold,
    ).toMatchObject({ value: null, reason: 'missing_projection' });
    prisma.match.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer()).get(path).expect(404);
  });
  it('keeps source quality loss visible without guessed locations or a zero full-match count', async () => {
    const f = killEpisodesFixture([episodeEvent({ positionX: null })]);
    prisma.match.findUnique.mockResolvedValue({
      ...f,
      timelineProjection: f.snapshotProjection,
    });
    prisma.matchEventProjection.findMany.mockResolvedValue(f.events);
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body.report).toMatchObject({
      episodeCount: { value: null, reason: 'missing_field' },
      coverage: { sourceKillEvents: 1, assignedKillEvents: 0 },
      unassigned: [{ eventId: 'm:1:0', reason: 'missing_field' }],
    });
  });
  it('documents profiles, nullable absence and dated resource metric envelopes', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = doc.components!.schemas! as Record<string, any>;
    expect(doc.paths['/api/v1/matches/{matchId}/kill-episodes']).toBeDefined();
    expect(schemas.MatchKillEpisodesDto.properties.report.nullable).toBe(true);
    expect(
      schemas.EpisodeResourcesDto.properties.snapshotTimestampMs.nullable,
    ).toBe(true);
    expect(schemas.EpisodeThresholdsDto.properties.profile.enum).toEqual([
      'tight',
      'default',
      'loose',
    ]);
    expect(
      JSON.stringify(
        schemas.EpisodeParticipantResourcesDto.properties.unspentGoldProxy,
      ),
    ).toContain('MetricResultDto');
    expect(schemas.QuickTradeDto.properties.latencyMs.type).toBe('number');
  });
});
