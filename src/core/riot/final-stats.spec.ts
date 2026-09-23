import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  projectFinalStats,
  projectFinalContext,
  projectFinalObjectives,
  participantDisplayName,
  FINAL_STAT_UNITS,
  FINAL_FLAG_FIELDS,
} from './final-stats';
import { parseMatchData } from '../../modules/worker/pure/match.parser';

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, '../../../exemplo_partida_BR1_3200579475.json'),
    'utf8',
  ),
);

describe('final Match-V5 observations', () => {
  it('reconciles every projected counter and flag for all ten real fixture participants without mutating raw', () => {
    const before = JSON.stringify(fixture);
    const parsed = parseMatchData(fixture);
    expect(parsed.participants).toHaveLength(10);
    for (const p of fixture.info.participants) {
      const projected = projectFinalStats(p);
      for (const field of [
        ...Object.keys(FINAL_STAT_UNITS),
        ...FINAL_FLAG_FIELDS,
      ]) {
        expect(projected.values[field]).toEqual(p[field] ?? null);
      }
      expect(
        parsed.participants.find((row) => row.puuid === p.puuid)?.finalStats,
      ).toEqual(projected);
      expect(projected.quality.coverage).toBe(1);
    }
    const milio = projectFinalStats(
      fixture.info.participants.find((p) => p.championName === 'Milio'),
    );
    expect(milio.values.totalDamageShieldedOnTeammates).toBe(19049);
    const fioraRaw = fixture.info.participants.find(
      (p) => p.championName === 'Fiora',
    );
    const fiora = projectFinalStats(fioraRaw);
    const teamTurretDamage = fixture.info.participants
      .filter((p) => p.teamId === fioraRaw.teamId)
      .reduce((sum, p) => sum + p.damageDealtToTurrets, 0);
    expect(
      (fiora.values.damageDealtToTurrets! / teamTurretDamage) * 100,
    ).toBeCloseTo(79.14, 2);
    expect(JSON.stringify(fixture)).toBe(before);
  });

  it('distinguishes missing counters/flags from valid zero/false and preserves precision', () => {
    const result = projectFinalStats({
      wardsPlaced: 0,
      totalTimeSpentDead: 0,
      gameEndedInSurrender: false,
      totalHeal: 1.25,
      totalHealsOnTeammates: null,
    });
    expect(result.values.wardsPlaced).toBe(0);
    expect(result.values.gameEndedInSurrender).toBe(false);
    expect(result.values.totalHeal).toBe(1.25);
    expect(result.values.totalHealsOnTeammates).toBeNull();
    expect(result.values.totalDamageShieldedOnTeammates).toBeNull();
    expect(result.missingReasons.totalHealsOnTeammates).toBe('missing_field');
    expect(result.quality.validFields).toBe(4);
    expect(result.values).not.toHaveProperty('currentGold');
    expect(
      projectFinalStats({ goldEarned: 100, goldSpent: 80 }).values,
    ).not.toHaveProperty('goldBalance');
  });

  it('keeps malformed fields unavailable without clamping or coercing numeric surrender flags', () => {
    const result = projectFinalStats({
      wardsPlaced: -1,
      timePlayed: Infinity,
      totalHeal: NaN,
      totalTimeCCDealt: '50',
      teamEarlySurrendered: 0,
    });
    for (const field of [
      'wardsPlaced',
      'timePlayed',
      'totalHeal',
      'totalTimeCCDealt',
      'teamEarlySurrendered',
    ]) {
      expect(result.values[field]).toBeNull();
      expect(result.missingReasons[field]).toBe('invalid_value');
    }
  });

  it('keeps final objectives separate from timeline, including absent and future types', () => {
    const parsed = parseMatchData(fixture);
    for (const team of parsed.teams) {
      expect(team.objectivesTimeline).toEqual([]);
      const source = fixture.info.teams.find(
        (t) => t.teamId === team.teamId,
      ).objectives;
      const projected = projectFinalObjectives(source);
      for (const [type, value] of Object.entries(source) as any) {
        expect(projected.values[type]).toEqual({
          first: value.first,
          kills: value.kills,
          lost: null,
        });
      }
      expect(team.finalObjectives).toEqual(projected);
    }
    const result = projectFinalObjectives({
      dragon: { first: false, kills: 0 },
      futureObjective: { first: true, kills: 2 },
      tower: 42,
    });
    expect(result.values.dragon).toEqual({
      first: false,
      kills: 0,
      lost: null,
    });
    expect(result.values.baron).toBeNull();
    expect(result.missingReasons.baron).toBe('missing_field');
    expect(result.missingReasons.tower).toBe('invalid_value');
    expect(result.unknownTypes).toEqual(['futureObjective']);
  });

  it('preserves final timestamps and empty tournament codes without inferring game outcome', () => {
    const result = projectFinalContext(fixture.info);
    expect(result.values.gameEndTimestamp).toBe(fixture.info.gameEndTimestamp);
    expect(result.values.tournamentCode).toBe('');
    expect(projectFinalContext({}).values.gameEndTimestamp).toBeNull();
    expect(result.values).not.toHaveProperty('remake');
  });

  it('prefers Riot ID and retains stable identity with legacy and PUUID fallbacks', () => {
    expect(
      participantDisplayName({
        puuid: 'stable',
        summonerName: 'old',
        riotIdGameName: 'new',
        riotIdTagline: 'BR1',
      }),
    ).toEqual({ displayName: 'new#BR1', displayNameSource: 'riot_id' });
    expect(
      participantDisplayName({
        puuid: 'stable',
        summonerName: 'old',
        riotIdGameName: 'new',
      }).displayName,
    ).toBe('new');
    expect(
      participantDisplayName({ puuid: 'stable', summonerName: 'old' })
        .displayName,
    ).toBe('old');
    expect(
      participantDisplayName({ puuid: 'stable', summonerName: '' }).displayName,
    ).toBe('stable');
  });
});
