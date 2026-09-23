import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { MatchesModule } from './matches.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { parseMatchData } from '../worker/pure/match.parser';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
);

describe('Final statistics HTTP contract', () => {
  let app: INestApplication;
  const prisma = mockPrismaService();
  const path = `/api/v1/matches/${fixture.metadata.matchId}`;
  beforeAll(async () => {
    app = await createTestingApp(MatchesModule, {
      overrides: [{ provide: PrismaService, useValue: prisma }],
    });
  });
  afterAll(async () => app.close());

  it('exposes the ten participants final observations, Riot ID, and separate final objective totals', async () => {
    const parsed = parseMatchData(fixture);
    prisma.match.findUnique.mockResolvedValue({
      ...parsed.match,
      teams: parsed.teams,
      participants: parsed.participants,
    });
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body.participants).toHaveLength(10);
    for (const p of body.participants) {
      const source = fixture.info.participants.find(
        (row) => row.puuid === p.puuid,
      );
      expect(p.displayName).toBe(
        `${source.riotIdGameName}#${source.riotIdTagline}`,
      );
      expect(p.finalStats.values.totalTimeSpentDead).toBe(
        source.totalTimeSpentDead,
      );
      expect(p.finalStats.values.totalHealsOnTeammates).toBe(
        source.totalHealsOnTeammates,
      );
      expect(p.finalStats.quality.coverage).toBe(1);
    }
    expect(body.teams[0].finalObjectives.values.dragon.kills).toBe(3);
    expect(body.teams[0].objectivesTimeline).toEqual([]);
    expect(body.finalContext.values.gameEndTimestamp).toBe(
      fixture.info.gameEndTimestamp,
    );
  });

  it('serializes missing optional values and valid zero/false distinctly', async () => {
    const raw = structuredClone(fixture);
    delete raw.info.participants[0].totalHealsOnTeammates;
    raw.info.participants[0].totalDamageShieldedOnTeammates = 0;
    raw.info.participants[0].gameEndedInSurrender = false;
    const parsed = parseMatchData(raw);
    prisma.match.findUnique.mockResolvedValue({
      ...parsed.match,
      teams: parsed.teams,
      participants: parsed.participants,
    });
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body.participants[0].finalStats.values).toMatchObject({
      totalHealsOnTeammates: null,
      totalDamageShieldedOnTeammates: 0,
      gameEndedInSurrender: false,
    });
    expect(
      body.participants[0].finalStats.missingReasons.totalHealsOnTeammates,
    ).toBe('missing_field');
  });

  it('returns explicit not_calculated for legacy rows before rebuild and falls back to stable PUUID', async () => {
    prisma.match.findUnique.mockResolvedValue({
      matchId: fixture.metadata.matchId,
      gameCreation: 1n,
      teams: [{ teamId: 100 }],
      participants: [{ puuid: 'stable', summonerName: '' }],
    });
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body).toMatchObject({
      finalContext: null,
      finalContextReason: 'not_calculated',
    });
    expect(body.teams[0]).toMatchObject({
      finalObjectives: null,
      finalObjectivesReason: 'not_calculated',
    });
    expect(body.participants[0]).toMatchObject({
      puuid: 'stable',
      displayName: 'stable',
      displayNameSource: 'puuid',
      finalStats: null,
      finalStatsReason: 'not_calculated',
      riotIdGameName: null,
    });
  });

  it('documents nullable fields, observed units, boolean surrender and independent objectives in OpenAPI', () => {
    const schemas = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    ).components!.schemas! as Record<string, any>;
    const values =
      schemas.FinalParticipantStatsDto.properties.values.properties;
    expect(values.totalHealsOnTeammates).toMatchObject({
      type: 'number',
      nullable: true,
    });
    expect(values.gameEndedInSurrender).toMatchObject({
      type: 'boolean',
      nullable: true,
    });
    expect(values.totalTimeSpentDead.description).toContain('seconds');
    expect(schemas.ParticipantDetailDto.properties.finalStats.nullable).toBe(
      true,
    );
    expect(schemas.MatchTeamDto.required).toContain('finalObjectives');
    expect(
      schemas.FinalObjectivesDto.properties.values.properties.dragon.nullable,
    ).toBe(true);
  });
});
