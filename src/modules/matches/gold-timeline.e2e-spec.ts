import { projectTimelineSnapshots } from './adapters/riot/timeline-snapshots';
import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { MatchesModule } from './matches.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';

describe('Gold timeline HTTP contract (real service and calculator)', () => {
  let app: INestApplication;
  const prisma = mockPrismaService();
  const path = '/api/v1/matches/BR1_GOLD_SYNTHETIC/timeline/gold';
  const match = () => ({
    mapId: 11,
    gameVersion: '16.2.741.8224',
    teams: [
      { teamId: 100, win: true },
      { teamId: 200, win: false },
    ],
    participants: [100, 200].flatMap((teamId) =>
      Array.from({ length: 5 }, (_, index) => ({
        puuid: `${teamId}-${index}`,
        teamId,
        goldGraph: teamId === 100 ? [500, 1000] : [500, 2000],
      })),
    ),
    get timelineProjection() {
      return projectTimelineSnapshots(
        {
          info: {
            frames: Array.from(
              {
                length: Math.max(
                  0,
                  ...this.participants.map((p) => p.goldGraph.length),
                ),
              },
              (_, minute) => ({
                timestamp: minute * 60000,
                events: [],
                participantFrames: Object.fromEntries(
                  this.participants.map((p, i) => [
                    String(i + 1),
                    { participantId: i + 1, totalGold: p.goldGraph[minute] },
                  ]),
                ),
              }),
            ),
          },
        },
        new Map(this.participants.map((p, i) => [i + 1, p.puuid])),
      );
    },
  });

  beforeAll(async () => {
    app = await createTestingApp(MatchesModule, {
      overrides: [{ provide: PrismaService, useValue: prisma }],
    });
  });
  afterAll(async () => app.close());

  it('serializes a victory with negative final gold and the compatibility alias', async () => {
    prisma.match.findUnique.mockResolvedValue(match());
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body.winner).toBe('blueTeam');
    expect(body.goldDifference[1].difference).toBe(-5000);
    expect(body.observedSwing).toEqual(body.throwPoint);
    expect(body.observedSwing).toMatchObject({
      beforeMinute: 0,
      minute: 1,
      swing: 5000,
    });
    expect(body.evidence.teams).toEqual(match().teams);
  });

  it('serializes incomplete gold as null and coverage, without an artificial swing', async () => {
    const data = match();
    data.participants[0].goldGraph.pop();
    prisma.match.findUnique.mockResolvedValue(data);
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body.goldDifference[1]).toMatchObject({
      blueTeam: null,
      redTeam: 10000,
      difference: null,
      reason: 'missing_frame',
    });
    expect(body.coverage.coverage).toBe(0.5);
    expect(body.observedSwing).toBeNull();
    expect(body.observedSwingReason).toBe('missing_frame');
  });

  it('returns an empty state for an existing match and 404 for an unknown match', async () => {
    prisma.match.findUnique.mockResolvedValue({
      ...match(),
      participants: [],
      timelineProjection: null,
    });
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body).toMatchObject({
      winner: 'blueTeam',
      goldDifference: [],
      maxAdvantage: null,
      reason: 'missing_projection',
    });
    prisma.match.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer()).get(path).expect(404);
  });

  it('documents nullable numeric totals, summary winner, coverage and deprecated alias in OpenAPI', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = document.components!.schemas! as Record<string, any>;
    expect(schemas.GoldDifferenceEntryDto.properties.blueTeam).toMatchObject({
      type: 'number',
      nullable: true,
    });
    expect(schemas.MatchGoldTimelineDto.properties.winner).toMatchObject({
      type: 'string',
      nullable: true,
    });
    expect(schemas.MatchGoldTimelineDto.properties.throwPoint.deprecated).toBe(
      true,
    );
    expect(schemas.MatchGoldTimelineDto.required).toEqual(
      expect.arrayContaining([
        'observedSwing',
        'coverage',
        'evidence',
        'winnerReason',
      ]),
    );
  });
});
